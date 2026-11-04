import ExcelJS from "exceljs";
import { HttpError } from "../http.js";

const MAX_SHEETS = 12;
const MAX_ROWS = 1000;
const MAX_COLS = 40;

/** What the client receives instead of the workbook: display text and basic styling only, never formulas. */
export interface GridCell {
  v: string;
  b?: 1;
  i?: 1;
  /** text colour / background, as #rrggbb */
  fg?: string;
  bg?: string;
  al?: "left" | "center" | "right";
  cs?: number;
  rs?: number;
  /** wrap text */
  w?: 1;
}
export interface GridSheet {
  name: string;
  cols: number[];
  rows: { h?: number; cells: (GridCell | null)[] }[];
  truncated?: 1;
}
export interface Grid {
  sheets: GridSheet[];
}

const hex = (argb?: string) => (argb && /^[0-9A-F]{8}$/i.test(argb) ? `#${argb.slice(2).toLowerCase()}` : undefined);
const decimals = (fmt: string) => fmt.match(/0\.(0+)/)?.[1].length ?? 0;

function formatNumber(n: number, fmt: string | undefined) {
  const f = fmt ?? "";
  if (f.includes("%")) return `${(n * 100).toFixed(decimals(f))}%`;
  const currency = f.includes("₹") ? "₹ " : "";
  const d = decimals(f);
  if (/[#0],[#0]/.test(f) || f.includes("\\,") || currency) return currency + n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
  return d ? n.toFixed(d) : String(Math.round(n * 1e6) / 1e6);
}

function display(cell: ExcelJS.Cell): string {
  const fmt = cell.numFmt;
  const one = (x: unknown): string => {
    if (x === null || x === undefined) return "";
    if (typeof x === "number") return formatNumber(x, fmt);
    if (typeof x === "boolean") return x ? "TRUE" : "FALSE";
    if (x instanceof Date) return x.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    if (typeof x === "string") return x;
    if (typeof x === "object") {
      const o = x as { result?: unknown; richText?: { text: string }[]; text?: string; error?: string; formula?: string; sharedFormula?: string };
      if (o.richText) return o.richText.map((r) => r.text).join("");
      if ("result" in o || o.formula || o.sharedFormula) return one(o.result);
      if (o.error) return o.error;
      if (typeof o.text === "string") return o.text;
    }
    return "";
  };
  return one(cell.value as unknown);
}

/** Converts an .xlsx into a read-only grid; the workbook itself is never sent to the client. */
export async function renderXlsx(data: Buffer): Promise<Grid> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data as unknown as ArrayBuffer);
  } catch {
    throw new HttpError(422, "This Excel file couldn't be read. Open it in Excel, save it as .xlsx, and try again.");
  }
  const sheets: GridSheet[] = [];
  for (const ws of wb.worksheets) {
    if (ws.state !== "visible") continue;
    if (sheets.length === MAX_SHEETS) break;
    const rowCount = Math.min(ws.actualRowCount ? ws.rowCount : 0, MAX_ROWS);
    const colCount = Math.min(ws.columnCount, MAX_COLS);

    // merged ranges: the top-left cell spans, the rest are skipped
    const span = new Map<string, { cs: number; rs: number }>();
    const covered = new Set<string>();
    for (const m of (ws.model as { merges?: string[] }).merges ?? []) {
      const [a, b] = m.split(":").map((ref) => ws.getCell(ref));
      if (!a || !b) continue;
      const r0 = Number(a.row), c0 = Number(a.col), r1 = Number(b.row), c1 = Number(b.col);
      span.set(`${r0}:${c0}`, { cs: c1 - c0 + 1, rs: r1 - r0 + 1 });
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (r !== r0 || c !== c0) covered.add(`${r}:${c}`);
    }

    const cols = Array.from({ length: colCount }, (_, i) => {
      const col = ws.getColumn(i + 1);
      return col.hidden ? 0 : Math.round((col.width ?? 9) * 7 + 5);
    });
    const rows: GridSheet["rows"] = [];
    for (let r = 1; r <= rowCount; r++) {
      const row = ws.getRow(r);
      if (row.hidden) continue;
      const cells: (GridCell | null)[] = [];
      for (let c = 1; c <= colCount; c++) {
        if (covered.has(`${r}:${c}`)) {
          cells.push(null);
          continue;
        }
        const cell = row.getCell(c);
        const out: GridCell = { v: display(cell) };
        if (cell.font?.bold) out.b = 1;
        if (cell.font?.italic) out.i = 1;
        const fg = hex(cell.font?.color?.argb);
        if (fg && fg !== "#000000") out.fg = fg;
        const fill = cell.fill as ExcelJS.FillPattern | undefined;
        const bg = fill?.type === "pattern" && fill.pattern === "solid" ? hex(fill.fgColor?.argb) : undefined;
        if (bg && bg !== "#ffffff") out.bg = bg;
        const al = cell.alignment?.horizontal;
        if (al === "center" || al === "right" || al === "left") out.al = al;
        else if (typeof cell.value === "number" || (cell.value as { result?: unknown })?.result !== undefined) out.al = "right";
        if (cell.alignment?.wrapText) out.w = 1;
        const s = span.get(`${r}:${c}`);
        if (s) Object.assign(out, s.cs > 1 && { cs: s.cs }, s.rs > 1 && { rs: s.rs });
        cells.push(out);
      }
      rows.push({ ...(row.height ? { h: Math.round(row.height * 1.33) } : {}), cells });
    }
    sheets.push({ name: ws.name, cols, rows, ...(ws.rowCount > MAX_ROWS || ws.columnCount > MAX_COLS ? { truncated: 1 as const } : {}) });
  }
  if (!sheets.length) throw new HttpError(422, "This workbook has no visible sheets to show.");
  return { sheets };
}
