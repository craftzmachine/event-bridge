/**
 * Reads an uploaded .xlsx into plain cell grids for `convertWorkbook`. Loaded with `await import()`
 * from the upload flow, because it pulls in ExcelJS (kept out of the main bundle, like the exports).
 *
 * Legacy .xls (the binary Excel 97–2003 format) is recognised and explained, not read: ExcelJS
 * only reads .xlsx. Supporting it would mean adding SheetJS (from cdn.sheetjs.com) and reading
 * .xls with it here; nothing else would need to change.
 */
import ExcelJS from "exceljs";
import type { Cell, SheetGrid, WorkbookGrid } from "./excelImport";

export const MAX_BYTES = 10 * 1024 * 1024;

/** A problem with the file itself, worded for the person who uploaded it. */
export class ReadError extends Error {
  name = "ReadError";
}

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((x, i) => b[i] === x);
const ZIP = [0x50, 0x4b, 0x03, 0x04]; // .xlsx is a zip package
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // .xls, or an encrypted .xlsx

export async function readWorkbook(name: string, data: ArrayBuffer): Promise<WorkbookGrid> {
  const ext = (name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
  if (!["xlsx", "xls", "xlsm"].includes(ext)) throw new ReadError(`“${name}” isn't an Excel file. Choose a .xlsx or .xls file.`);
  if (data.byteLength === 0) throw new ReadError(`“${name}” is empty.`);
  if (data.byteLength > MAX_BYTES) throw new ReadError(`“${name}” is ${(data.byteLength / 1048576).toFixed(1)} MB. Files up to 10 MB can be read.`);

  const head = new Uint8Array(data.slice(0, 8));
  if (startsWith(head, OLE)) {
    throw new ReadError(
      ext === "xls"
        ? `“${name}” is in the older .xls format, which can't be read here yet. Open it in Excel, choose File › Save As › Excel Workbook (.xlsx), and upload that file.`
        : `“${name}” is password-protected. Remove the password in Excel (File › Info › Protect Workbook), save, and upload it again.`,
    );
  }
  if (!startsWith(head, ZIP)) {
    throw new ReadError(
      ext === "xls"
        ? `“${name}” isn't a real Excel workbook (it may be a web page or CSV renamed to .xls). Open it in Excel and save it as .xlsx.`
        : `“${name}” isn't a valid Excel workbook. It may be damaged; try opening it in Excel and saving it again.`,
    );
  }

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data);
  } catch {
    throw new ReadError(`“${name}” couldn't be read. It may be damaged; try opening it in Excel and saving it again.`);
  }

  const sheets: SheetGrid[] = [];
  wb.eachSheet((ws) => {
    if (ws.state !== "visible") return; // hidden sheets aren't part of what the person sees
    const rows: Cell[][] = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const cells: Cell[] = [];
      for (let c = 1; c <= ws.columnCount; c++) {
        const cell = row.getCell(c);
        // merged cells repeat the top-left value; only the top-left cell keeps it
        cells.push(cell.isMerged && cell.master.address !== cell.address ? null : plain(cell.value));
      }
      while (cells.length && cells[cells.length - 1] === null) cells.pop();
      rows.push(cells);
    }
    sheets.push({ name: ws.name, rows });
  });
  if (!sheets.length) throw new ReadError(`“${name}” has no visible sheets.`);
  return { fileName: name, sheets };
}

/** A cell's value as the sheet shows it: a formula gives its last calculated result. */
function plain(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return plain((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ("formula" in v || "sharedFormula" in v) return null; // never calculated: no value to read
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join("");
    if ("text" in v) return String((v as ExcelJS.CellHyperlinkValue).text);
    if ("error" in v) return null;
  }
  return null;
}
