import ExcelJS from "exceljs";
import type { Brand, Catalog, Line, Proposal } from "../types";
import { computeTotals, functionTotals } from "./totals";
import { byFunction, functionHeading } from "./functions";
import { formatDate, todayISO } from "./format";
import { eventDatesLine, exportFileName, groupLines, proposalTitle, venueLine } from "./proposal";
import { logoToPng, saveBlob } from "./files";

export { logoToPng };

// Indian grouping (₹ 4,41,303.50) for amounts up to crores
export const INR_FMT =
  '[>=10000000]"₹ "##\\,##\\,##\\,##0.00;[>=100000]"₹ "##\\,##\\,##0.00;"₹ "##,##0.00';
const SERIF = "Georgia";
const SANS = "Arial";

export function buildWorkbook(p: Proposal, catalog: Catalog, brand: Brand, logoPng?: string): ExcelJS.Workbook {
  const c = brand.colors;
  const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;
  const fill = (hex: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: argb(hex) } });
  const thin = { style: "thin" as const, color: { argb: argb(c.line) } };
  const t = computeTotals(p, brand.gstPct);
  const title = proposalTitle(p, catalog);

  const wb = new ExcelJS.Workbook();
  wb.creator = brand.company;
  wb.created = new Date();

  const ws = wb.addWorksheet("Proposal", {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
    headerFooter: { oddFooter: `&L&8${brand.company} · ${brand.phone} · ${brand.email}&R&8Page &P of &N` },
  });
  ws.columns = [
    { key: "sl", width: 6 },
    { key: "name", width: 48 },
    { key: "notes", width: 30 },
    { key: "qty", width: 8 },
    { key: "unit", width: 11 },
    { key: "rate", width: 15 },
    { key: "amount", width: 17 },
  ];
  ws.properties.defaultRowHeight = 18;

  // ---- header -----------------------------------------------------------
  if (logoPng) {
    const id = wb.addImage({ base64: logoPng, extension: "png" });
    // the crest is ~1.47:1; three header rows give it room
    ws.addImage(id, { tl: { col: 0.15, row: 0.15 }, ext: { width: 150, height: 102 } });
    ws.getRow(1).height = 30;
    ws.getRow(2).height = 30;
    ws.getRow(3).height = 24;
  } else {
    ws.mergeCells("A1:D1");
    Object.assign(ws.getCell("A1"), { value: brand.company.toUpperCase() });
    ws.getCell("A1").font = { name: SERIF, size: 20, color: { argb: argb(c.ink) } };
    ws.getRow(1).height = 30;
    ws.mergeCells("A2:D2");
    ws.getCell("A2").value = brand.tagline;
    ws.getCell("A2").font = { name: SANS, size: 9, italic: true, color: { argb: argb(c.accent) } };
  }
  ws.mergeCells("E1:G1");
  ws.getCell("E1").value = "PROPOSAL & ESTIMATE";
  ws.getCell("E1").font = { name: SANS, size: 9, bold: true, color: { argb: argb(c.accent) } };
  ws.getCell("E1").alignment = { horizontal: "right", vertical: "middle" };
  ws.mergeCells("E2:G2");
  ws.getCell("E2").value = title;
  ws.getCell("E2").font = { name: SERIF, size: 16, color: { argb: argb(c.ink) } };
  ws.getCell("E2").alignment = { horizontal: "right", vertical: "middle" };
  if (!logoPng) ws.getRow(3).height = 8;
  for (let col = 1; col <= 7; col++) ws.getRow(3).getCell(col).border = { bottom: { style: "medium", color: { argb: argb(c.accent) } } };

  // ---- event info -------------------------------------------------------
  const info: [string, string][] = [
    ["Client", p.client.name || "—"],
    ["Contact", p.client.contact || "To Be Confirmed"],
    ["Event", title],
    [eventDatesLine(p).label, eventDatesLine(p).text],
    ["Venue", venueLine(p) || "To Be Confirmed"],
    ["Quotation ref", p.ref || "To Be Assigned"],
    ["Dated", formatDate(todayISO())],
  ];
  let r = 5;
  for (const [k, v] of info) {
    ws.getCell(`A${r}`).value = k.toUpperCase();
    ws.mergeCells(`A${r}:B${r}`);
    ws.getCell(`A${r}`).font = { name: SANS, size: 8, bold: true, color: { argb: argb(c.accent) } };
    ws.mergeCells(`C${r}:G${r}`);
    ws.getCell(`C${r}`).value = v;
    ws.getCell(`C${r}`).font = { name: SANS, size: 10, color: { argb: argb(c.ink) } };
    r++;
  }
  r++;

  // ---- items table -------------------------------------------------------
  const head = ws.getRow(r);
  head.values = ["SL", "ELEMENT", "NOTES", "QTY", "UNIT", "RATE (₹)", "AMOUNT (₹)"];
  head.height = 22;
  head.eachCell((cell, col) => {
    cell.fill = fill(c.ink);
    cell.font = { name: SANS, size: 8, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: col >= 6 ? "right" : col === 4 ? "center" : "left" };
  });
  r++;

  const firstItemRow = r;
  const included = p.lines.filter((l) => !l.optional);
  const groups = groupLines(included, catalog);
  const letters = "ABCDEFGHIJKLMNOP";
  const fnSubtotals = new Map(functionTotals(p).map((x) => [x.fn.id, x.subTotal]));
  // rows holding each function's subtotal; with functions the Sub Total adds these, so nothing counts twice
  const fnTotalRows: number[] = [];
  byFunction(p, included, true).forEach((sec) => {
    if (sec.fn) {
      // "FUNCTION: Haldi — 12th February 2027"; the Excel import reads this row back as the function
      const fr = ws.getRow(r);
      ws.mergeCells(`A${r}:G${r}`);
      fr.getCell(1).value = `FUNCTION: ${functionHeading(sec.fn)}`;
      fr.getCell(1).fill = fill(c.accent);
      fr.getCell(1).font = { name: SERIF, size: 12, bold: true, color: { argb: "FFFFFFFF" } };
      fr.getCell(1).alignment = { vertical: "middle" };
      fr.height = 24;
      r++;
    }
    const first = r;
    groupLines(sec.lines, catalog).forEach((g, gi) => {
      const sr = ws.getRow(r);
      sr.getCell(1).value = letters[gi];
      sr.getCell(2).value = g.label;
      sr.height = 22;
      for (let col = 1; col <= 7; col++) {
        const cell = sr.getCell(col);
        cell.fill = fill(c.soft);
        cell.font = { name: SERIF, size: 11, bold: col === 1, color: { argb: argb(c.ink) } };
        cell.alignment = { vertical: "middle" };
      }
      sr.getCell(1).border = { left: { style: "thick", color: { argb: argb(c.accent) } } };
      r++;
      g.lines.forEach((l, i) => {
        r = writeItem(ws, r, String(i + 1).padStart(2, "0"), l, thin, c);
      });
    });
    if (sec.fn) {
      const tr = ws.getRow(r);
      ws.mergeCells(`B${r}:F${r}`);
      tr.getCell(2).value = `${sec.fn.label} subtotal`;
      tr.getCell(2).alignment = { horizontal: "right" };
      tr.getCell(2).font = { name: SANS, size: 10, bold: true, color: { argb: argb(c.ink) } };
      tr.getCell(7).value = { formula: `SUM(G${first}:G${r - 1})`, result: fnSubtotals.get(sec.fn.id) ?? 0 };
      tr.getCell(7).numFmt = INR_FMT;
      tr.getCell(7).font = { name: SANS, size: 10, bold: true, color: { argb: argb(c.ink) } };
      for (let col = 1; col <= 7; col++) tr.getCell(col).border = { top: { style: "thin", color: { argb: argb(c.accent) } } };
      fnTotalRows.push(r);
      r += 2;
    }
  });
  const lastItemRow = r - 1;
  if (!groups.length) {
    ws.getCell(`B${r}`).value = "No elements selected yet.";
    ws.getCell(`B${r}`).font = { name: SANS, size: 9, italic: true, color: { argb: "FF888888" } };
    r++;
  }
  r++;

  // ---- totals -------------------------------------------------------------
  const sumRange = fnTotalRows.length ? fnTotalRows.map((x) => `G${x}`).join("+") : groups.length ? `SUM(G${firstItemRow}:G${lastItemRow})` : "0";
  const totalRow = (label: string, value: ExcelJS.CellValue, opts: { bold?: boolean; big?: boolean; pct?: number; input?: boolean } = {}) => {
    const row = ws.getRow(r);
    ws.mergeCells(`B${r}:E${r}`);
    row.getCell(2).value = label;
    row.getCell(2).alignment = { horizontal: "right" };
    row.getCell(2).font = { name: opts.big ? SERIF : SANS, size: opts.big ? 13 : 10, bold: opts.bold, color: { argb: argb(c.ink) } };
    if (opts.pct !== undefined) {
      row.getCell(6).value = opts.pct / 100;
      row.getCell(6).numFmt = "0.##%";
      row.getCell(6).font = { name: SANS, size: 10, color: { argb: "FF1F4E9E" } };
      row.getCell(6).alignment = { horizontal: "right" };
    }
    const cell = row.getCell(7);
    cell.value = value;
    cell.numFmt = INR_FMT;
    cell.font = { name: opts.big ? SERIF : SANS, size: opts.big ? 13 : 10, bold: opts.bold || opts.big, color: { argb: opts.input ? "FF1F4E9E" : argb(c.ink) } };
    if (opts.input) cell.fill = fill("FFF4C2");
    if (opts.big) {
      row.height = 24;
      for (let col = 2; col <= 7; col++) row.getCell(col).border = { top: { style: "medium", color: { argb: argb(c.accent) } } };
    }
    return r++;
  };
  const subRow = totalRow("Sub Total", { formula: sumRange, result: t.subTotal }, { bold: true });
  const coordRow = totalRow(
    `${brand.coordinationLabel} (${p.coordinationPct}%)`,
    { formula: `G${subRow}*F${r}`, result: t.coordination },
    { pct: p.coordinationPct },
  );
  const roundRow = totalRow("Rounded Off", t.roundOff, { input: true });
  const gtRow = totalRow("Grand Total", { formula: `G${subRow}+G${coordRow}+G${roundRow}`, result: t.grandTotal }, { big: true });
  r++;
  const gstRow = totalRow(`GST @ ${brand.gstPct}% (for reference)`, { formula: `G${gtRow}*F${r}`, result: t.gst }, { pct: brand.gstPct });
  totalRow("Total including GST", { formula: `G${gtRow}+G${gstRow}`, result: t.totalWithGst }, { bold: true });
  r++;

  const notes: string[] = [];
  if (t.asPerActuals.length)
    notes.push(`${t.asPerActuals.map((l) => l.name).join("; ")} will be billed as per actuals and are not included in the Grand Total.`);
  if (t.optionsTotal) notes.push("Additional options are listed on the next tab and are not included in the Grand Total.");
  if (p.notes.trim()) notes.push(p.notes.trim());
  for (const n of notes) {
    ws.mergeCells(`A${r}:G${r}`);
    ws.getCell(`A${r}`).value = n;
    ws.getCell(`A${r}`).font = { name: SANS, size: 9, italic: true, color: { argb: "FF777777" } };
    ws.getCell(`A${r}`).alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r).height = Math.max(18, Math.ceil(n.length / 120) * 14);
    r++;
  }
  ws.pageSetup.printArea = `A1:G${r}`;

  // ---- additional options ------------------------------------------------
  const os = wb.addWorksheet("Additional Options", {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  os.columns = [{ width: 6 }, { width: 52 }, { width: 30 }, { width: 8 }, { width: 11 }, { width: 15 }, { width: 17 }];
  os.mergeCells("A1:G1");
  os.getCell("A1").value = "Additional Options";
  os.getCell("A1").font = { name: SERIF, size: 16, color: { argb: argb(c.ink) } };
  os.mergeCells("A2:G2");
  os.getCell("A2").value = "Optional — not included in the Grand Total.";
  os.getCell("A2").font = { name: SANS, size: 9, italic: true, color: { argb: argb(c.accent) } };
  const oh = os.getRow(4);
  oh.values = ["SL", "OPTION", "NOTES", "QTY", "UNIT", "RATE (₹)", "AMOUNT (₹)"];
  oh.eachCell((cell, col) => {
    cell.fill = fill(c.ink);
    cell.font = { name: SANS, size: 8, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: col >= 6 ? "right" : col === 4 ? "center" : "left" };
  });
  let orow = 5;
  let n = 1;
  for (const l of p.lines.filter((x) => x.optional)) orow = writeItem(os, orow, String(n++).padStart(2, "0"), l, thin, c);
  for (const l of p.lines) {
    for (const u of l.upgrades.filter((x) => x.mode === "offer")) {
      orow = writeItem(
        os,
        orow,
        String(n++).padStart(2, "0"),
        { ...l, name: `Upgrade: ${u.name}`, notes: `For “${l.name}”`, qty: 1, unit: "lump sum", rate: u.price, upgrades: [] },
        thin,
        c,
      );
    }
  }
  if (n === 1) {
    os.getCell(`B${orow}`).value = "No additional options in this proposal.";
    os.getCell(`B${orow}`).font = { name: SANS, size: 9, italic: true, color: { argb: "FF888888" } };
    orow++;
  }
  orow++;
  os.mergeCells(`B${orow}:E${orow}`);
  os.getCell(`B${orow}`).value = "Total of additional options";
  os.getCell(`B${orow}`).alignment = { horizontal: "right" };
  os.getCell(`B${orow}`).font = { name: SANS, size: 10, bold: true };
  os.getCell(`G${orow}`).value = { formula: n > 1 ? `SUM(G5:G${orow - 2})` : "0", result: t.optionsTotal };
  os.getCell(`G${orow}`).numFmt = INR_FMT;
  os.getCell(`G${orow}`).font = { name: SANS, size: 10, bold: true };

  // ---- terms ----------------------------------------------------------------
  const ts = wb.addWorksheet("Terms", { views: [{ showGridLines: false }], pageSetup: { paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ts.columns = [{ width: 5 }, { width: 100 }];
  ts.getCell("A1").value = "Terms & Conditions";
  ts.getCell("A1").font = { name: SERIF, size: 16, color: { argb: argb(c.ink) } };
  let trow = 3;
  p.terms.forEach((term, i) => {
    ts.getCell(`A${trow}`).value = i + 1;
    ts.getCell(`A${trow}`).font = { name: SANS, size: 10, color: { argb: argb(c.accent) } };
    ts.getCell(`A${trow}`).alignment = { vertical: "top" };
    ts.getCell(`B${trow}`).value = term;
    ts.getCell(`B${trow}`).font = { name: SANS, size: 10 };
    ts.getCell(`B${trow}`).alignment = { wrapText: true, vertical: "top" };
    trow++;
  });
  trow += 2;
  const contact: [string, string, Partial<ExcelJS.Font>][] = [
    ["YOUR POINT OF CONTACT", "", { size: 8, bold: true, color: { argb: argb(c.accent) } }],
    [brand.contact.name, "", { name: SERIF, size: 13 }],
    [brand.contact.role, "", { size: 10 }],
    [`${brand.contact.phone}  ·  ${brand.contact.email}`, "", { size: 10 }],
    ["", "", {}],
    [`${brand.company} · ${brand.legalName}`, "", { size: 9, bold: true }],
    [brand.address, "", { size: 9, color: { argb: "FF777777" } }],
    [`GSTIN: ${brand.gstin}`, "", { size: 9, color: { argb: "FF777777" } }],
  ];
  for (const [text, , font] of contact) {
    ts.getCell(`B${trow}`).value = text;
    ts.getCell(`B${trow}`).font = { name: SANS, ...font };
    trow++;
  }
  return wb;
}

function writeItem(
  ws: ExcelJS.Worksheet,
  r: number,
  sl: string,
  l: Line,
  thin: Partial<ExcelJS.Border>,
  c: Brand["colors"],
): number {
  const row = ws.getRow(r);
  row.getCell(1).value = sl;
  row.getCell(2).value = l.name;
  row.getCell(3).value = l.notes || null;
  row.getCell(4).value = l.qty;
  row.getCell(5).value = l.unit;
  if (l.rate === null) {
    row.getCell(6).value = "—";
    row.getCell(7).value = "As per actuals";
    row.getCell(7).font = { name: SANS, size: 9, italic: true, color: { argb: `FF${c.accent}` } };
  } else {
    row.getCell(6).value = l.rate;
    row.getCell(7).value = { formula: `D${r}*F${r}`, result: l.qty * l.rate };
  }
  styleItemRow(row, thin, c);
  r++;
  for (const u of l.upgrades.filter((x) => x.mode === "include")) {
    const ur = ws.getRow(r);
    ur.getCell(2).value = `   + ${u.name}`;
    ur.getCell(4).value = 1;
    ur.getCell(5).value = "upgrade";
    ur.getCell(6).value = u.price;
    ur.getCell(7).value = { formula: `D${r}*F${r}`, result: u.price };
    styleItemRow(ur, thin, c);
    ur.getCell(2).font = { name: SANS, size: 9, italic: true, color: { argb: `FF${c.ink}` } };
    r++;
  }
  return r;
}

function styleItemRow(row: ExcelJS.Row, thin: Partial<ExcelJS.Border>, c: Brand["colors"]) {
  for (let col = 1; col <= 7; col++) {
    const cell = row.getCell(col);
    cell.border = { bottom: thin };
    cell.alignment = { vertical: "middle", wrapText: col === 2 || col === 3, horizontal: col === 4 ? "center" : col >= 6 ? "right" : "left" };
    if (!cell.font?.italic) cell.font = { name: "Arial", size: col === 1 ? 8 : 9.5, color: { argb: col === 1 ? "FF999999" : col === 6 ? "FF1F4E9E" : `FF${c.ink}` } };
  }
  row.getCell(6).numFmt = INR_FMT;
  row.getCell(7).numFmt = INR_FMT;
  const name = String(row.getCell(2).value ?? "");
  const notes = String(row.getCell(3).value ?? "");
  row.height = Math.max(18, Math.ceil(Math.max(name.length / 50, notes.length / 32)) * 14);
}

export async function downloadXlsx(p: Proposal, catalog: Catalog, brand: Brand) {
  const logo = await logoToPng(`${import.meta.env.BASE_URL}${brand.logo}`);
  const wb = buildWorkbook(p, catalog, brand, logo);
  const buf = await wb.xlsx.writeBuffer();
  saveBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), exportFileName(p, catalog));
}
