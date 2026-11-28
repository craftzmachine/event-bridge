// The floor plan's inventory as a PDF or an Excel sheet, to send to the rental vendor. Loaded only through
// `await import("./exportInventory")`, like the other exports, so pdfmake and ExcelJS stay lazy.
import ExcelJS from "exceljs";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import type { Brand, VenueLayout } from "../types";
import { inventory, planCounts, type InventoryRow } from "./inventory";
import { renderPdf } from "./exportPdf";
import { saveBlob } from "./files";
import { safeFilePart, todayISO, formatDate } from "./format";

const INK = "#2e2620";
const MUTED = "#8e8377";
const LINE = "#d8cfbf";

export function buildInventoryDoc(title: string, venue: string, l: VenueLayout, brand: Pick<Brand, "company">, logo?: string, dated = todayISO()): TDocumentDefinitions {
  const rows = inventory(l);
  const c = planCounts(l);
  const content: Content[] = [
    {
      columns: [
        ...(logo ? [{ image: `data:image/png;base64,${logo}`, width: 70 }] : []),
        { stack: [{ text: "Inventory", fontSize: 18, color: INK }, { text: [title, venue].filter(Boolean).join(" · "), fontSize: 10, color: MUTED, margin: [0, 2, 0, 0] }], margin: [logo ? 10 : 0, 4, 0, 0] },
        { text: formatDate(dated), alignment: "right", fontSize: 9, color: MUTED, margin: [0, 6, 0, 0] },
      ],
      margin: [0, 0, 0, 12],
    } as Content,
    {
      columns: [
        { text: [{ text: `${c.tables}`, bold: true }, " tables"] },
        { text: [{ text: `${c.chairs}`, bold: true }, " chairs"] },
        { text: [{ text: `${c.chairRows}`, bold: true }, " chair rows"] },
        { text: [{ text: `${l.w} × ${l.h} m`, bold: true }, " room"] },
      ],
      fontSize: 10,
      margin: [0, 0, 0, 10],
    } as Content,
    {
      table: {
        headerRows: 1,
        widths: ["*", 130, 40, 130],
        body: [
          [{ text: "Item", bold: true }, { text: "Size", bold: true }, { text: "Qty", bold: true, alignment: "right" }, { text: "Note", bold: true }],
          ...rows.map((r: InventoryRow) => [r.item, r.size, { text: String(r.qty), alignment: "right" }, { text: r.note ?? "", color: MUTED }]),
        ],
      },
      layout: { hLineColor: () => LINE, vLineColor: () => LINE, hLineWidth: () => 0.5, vLineWidth: () => 0, paddingTop: () => 5, paddingBottom: () => 5 },
      fontSize: 9.5,
    } as Content,
    { text: "Quantities are from the floor plan. Confirm sizes and spares with the vendor.", fontSize: 8, color: MUTED, margin: [0, 10, 0, 0] },
  ];
  return {
    pageSize: "A4",
    pageMargins: [36, 32, 36, 40],
    info: { title: `Inventory ${title}`, author: brand.company },
    defaultStyle: { font: "Roboto", fontSize: 9, color: INK },
    footer: (page: number, pages: number) => ({
      columns: [
        { text: `${brand.company} · Inventory · ${title}`, fontSize: 7.5, color: MUTED },
        { text: `Page ${page} of ${pages}`, fontSize: 7.5, color: MUTED, alignment: "right" },
      ],
      margin: [36, 12, 36, 0],
    }),
    content,
  };
}

export function buildInventoryWorkbook(title: string, venue: string, l: VenueLayout): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Inventory");
  ws.columns = [
    { header: "Item", key: "item", width: 30 },
    { header: "Size", key: "size", width: 22 },
    { header: "Qty", key: "qty", width: 8 },
    { header: "Note", key: "note", width: 34 },
  ];
  ws.spliceRows(1, 0, [`Inventory — ${[title, venue].filter(Boolean).join(" · ")}`], []);
  ws.getRow(1).font = { bold: true, size: 14 };
  ws.getRow(3).font = { bold: true };
  for (const r of inventory(l)) ws.addRow({ item: r.item, size: r.size, qty: r.qty, note: r.note ?? "" });
  return wb;
}

export async function downloadInventory(kind: "pdf" | "xlsx", title: string, venue: string, l: VenueLayout, brand: Brand) {
  const name = `Inventory_${safeFilePart(title) || "plan"}`;
  if (kind === "pdf") {
    const blob = await renderPdf(brand, (logo) => buildInventoryDoc(title, venue, l, brand, logo));
    saveBlob(blob, `${name}.pdf`);
    return;
  }
  const buf = await buildInventoryWorkbook(title, venue, l).xlsx.writeBuffer();
  saveBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${name}.xlsx`);
}
