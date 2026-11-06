// A payment receipt as a PDF, in the same company branding as the proposal. Loaded only through
// `await import("./exportReceipt")`, like the other exports, so pdfmake stays out of the main bundle.
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import type { Brand, Catalog, Payment, Proposal } from "../types";
import { formatDate, formatINR } from "./format";
import { eventDatesLine, proposalTitle, venueLine } from "./proposal";
import { amountInWords, METHODS, schedule } from "./payments";
import { renderPdf } from "./exportPdf";
import { saveBlob } from "./files";

/** Pure, so tests render it in Node. The balance shown is what remained after this payment. */
export function buildReceiptDoc(p: Proposal, pay: Payment, catalog: Catalog, brand: Brand, logoPng?: string): TDocumentDefinitions {
  const c = { ink: `#${brand.colors.ink}`, accent: `#${brand.colors.accent}`, soft: `#${brand.colors.soft}`, line: `#${brand.colors.line}` };
  const muted = "#7a7068";
  // the balance as it stood once this payment (and the ones before it) had been received
  const upTo = p.payments?.received.slice(0, (p.payments?.received.findIndex((x) => x.id === pay.id) ?? -1) + 1) ?? [pay];
  const s = schedule({ ...p, payments: { plan: p.payments?.plan, received: upTo } }, brand);
  const method = METHODS.find((m) => m.id === pay.method)?.label ?? pay.method;
  const row = (k: string, v: string, bold = false) => [
    { text: k, color: muted, fontSize: 9 },
    { text: v, fontSize: 10, bold, color: c.ink },
  ];
  return {
    pageSize: "A5",
    pageOrientation: "landscape",
    pageMargins: [36, 32, 36, 36],
    info: { title: `Receipt ${pay.receiptNo}`, author: brand.company },
    defaultStyle: { font: "Roboto", fontSize: 10, color: c.ink },
    content: [
      {
        columns: [
          logoPng ? { image: `data:image/png;base64,${logoPng}`, width: 90 } : { text: brand.company, bold: true, fontSize: 14 },
          {
            stack: [
              { text: "PAYMENT RECEIPT", bold: true, fontSize: 13, color: c.accent, characterSpacing: 2, alignment: "right" },
              { text: pay.receiptNo, fontSize: 9, color: muted, alignment: "right", margin: [0, 3, 0, 0] },
              { text: `Dated ${formatDate(pay.date)}`, fontSize: 9, color: muted, alignment: "right" },
            ],
          },
        ],
      },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 523, y2: 0, lineWidth: 1, lineColor: c.accent }], margin: [0, 10, 0, 12] },
      {
        text: [
          "Received with thanks from ",
          { text: p.client.name || "the client", bold: true },
          " the sum of ",
          { text: formatINR(pay.amount), bold: true },
          ` (${amountInWords(pay.amount)}) by ${method}${pay.reference ? `, reference ${pay.reference}` : ""}.`,
        ],
        fontSize: 11,
        lineHeight: 1.35,
      },
      {
        table: {
          widths: [140, "*"],
          body: [
            row("For", `${proposalTitle(p, catalog) || "Event"} · quotation ${p.ref}`),
            row(eventDatesLine(p).label, eventDatesLine(p).text),
            row("Venue", venueLine(p) || "To Be Confirmed"),
            row("Total including GST", formatINR(s.total)),
            row("Received to date", formatINR(s.received)),
            row("Balance", formatINR(Math.max(0, s.balance)), true),
            ...(pay.note ? [row("Note", pay.note)] : []),
          ],
        },
        layout: { hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => c.line, paddingTop: () => 4, paddingBottom: () => 4 },
        margin: [0, 14, 0, 0],
      },
      {
        columns: [
          { text: `${brand.legalName} · ${brand.address}${brand.gstin ? ` · GSTIN ${brand.gstin}` : ""}`, fontSize: 7.5, color: muted, width: "*" },
          { text: `For ${brand.company}\n\n\nAuthorised signatory`, fontSize: 8.5, alignment: "right", width: 160 },
        ],
        margin: [0, 22, 0, 0],
      },
    ],
  };
}

export async function downloadReceipt(p: Proposal, pay: Payment, catalog: Catalog, brand: Brand) {
  const blob = await renderPdf(brand, (logo) => buildReceiptDoc(p, pay, catalog, brand, logo));
  saveBlob(blob, `Receipt_${pay.receiptNo}.pdf`);
}
