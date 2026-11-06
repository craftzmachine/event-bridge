// The handover pack as a ZIP: expenses.json (for import), expenses.xlsx (the ledger), summary.pdf and the proof
// images. Loaded only through `await import("./handoverPack")`, like the exports: JSZip and ExcelJS are heavy.
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { cleanRef, maskUpi, METHODS } from "./expenses";
import { fingerprint } from "./proofImage";
import { verifyPack, type PackData, type PackProblem } from "./handover";

/** The ledger as a workbook: one row per expense, with the proof's file name so each row can be checked. */
export function ledgerWorkbook(p: PackData): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Expenses");
  ws.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Time", key: "time", width: 8 },
    { header: "Function", key: "fn", width: 14 },
    { header: "Paid to", key: "vendor", width: 26 },
    { header: "What", key: "what", width: 30 },
    { header: "Category", key: "category", width: 18 },
    { header: "Paid by", key: "payer", width: 18 },
    { header: "Method", key: "method", width: 16 },
    { header: "UPI ref", key: "ref", width: 16 },
    { header: "Payee UPI (masked)", key: "upi", width: 20 },
    { header: "Amount (₹)", key: "amount", width: 14 },
    { header: "Proof file", key: "proof", width: 40 },
    { header: "Recorded by", key: "by", width: 26 },
    { header: "Review", key: "review", width: 12 },
  ];
  ws.getRow(1).font = { bold: true };
  const cat = (id: string) => p.categories.find((c) => c.id === id)?.label ?? id;
  const fn = (id?: string) => p.event.functions.find((f) => f.id === id)?.label ?? "";
  const live = p.expenses.filter((e) => !e.removed).sort((a, b) => (a.paidOn + (a.paidAt ?? "")).localeCompare(b.paidOn + (b.paidAt ?? "")));
  for (const e of live)
    ws.addRow({
      date: e.paidOn,
      time: e.paidAt ?? "",
      fn: fn(e.fn),
      vendor: e.vendor,
      what: e.description,
      category: cat(e.category),
      payer: e.payer.kind === "company" ? "Company account" : e.payer.name,
      method: METHODS.find((m) => m.id === e.method)?.label ?? e.method,
      ref: cleanRef(e.upiRef),
      upi: maskUpi(e.payeeUpi),
      amount: e.amount,
      proof: e.proof ? p.files[e.proof.fileId]?.path ?? "" : "missing",
      by: e.recordedBy,
      review: e.review.state,
    });
  ws.getColumn("amount").numFmt = "#,##,##0.00";
  const total = ws.addRow({ vendor: "Total", amount: { formula: `SUM(K2:K${live.length + 1})`, result: live.reduce((t, e) => t + e.amount, 0) } });
  total.font = { bold: true };
  return wb;
}

export async function buildPack(p: PackData, images: Map<string, Blob>, summaryPdf?: Blob): Promise<Blob> {
  const zip = new JSZip();
  zip.file("expenses.json", JSON.stringify(p, null, 2));
  zip.file("expenses.xlsx", await ledgerWorkbook(p).xlsx.writeBuffer());
  // bytes rather than Blobs, which JSZip only takes in browsers
  if (summaryPdf) zip.file("summary.pdf", new Uint8Array(await summaryPdf.arrayBuffer()));
  zip.file(
    "README.txt",
    `Expenses handover for ${p.event.title}, ${p.event.client} (quotation ${p.event.ref}), from ${p.from}.\r\n` +
      `Open it in Event Bridge: Expenses, then Receive a handover. The summary and ledger can also be read without the app.\r\n` +
      `It contains payment details and screenshots: send it only to the reviewer, and delete it once the handover is signed off.\r\n`,
  );
  for (const [fileId, file] of Object.entries(p.files)) {
    const img = images.get(fileId);
    if (img) zip.file(file.path, new Uint8Array(await img.arrayBuffer()));
  }
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return new Blob([bytes as BlobPart], { type: "application/zip" });
}

/** Opens a pack and checks every image against its fingerprint. */
export async function readPack(file: Blob, reviewer: string): Promise<{ pack?: PackData; images: Map<string, Blob>; problems: PackProblem[] }> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    return { images: new Map(), problems: [{ fatal: true, text: "This file couldn't be opened. Choose the .zip handover file you were sent." }] };
  }
  const json = zip.file("expenses.json");
  if (!json) return { images: new Map(), problems: [{ fatal: true, text: "This isn't an Event Bridge expenses handover file." }] };
  let data: PackData;
  try {
    data = JSON.parse(await json.async("string"));
  } catch {
    return { images: new Map(), problems: [{ fatal: true, text: "The handover file is damaged. Ask for a new one." }] };
  }
  const images = new Map<string, Blob>();
  const hashes: Record<string, string | undefined> = {};
  for (const [fileId, f] of Object.entries(data.files ?? {})) {
    const entry = zip.file(f.path);
    if (!entry) continue;
    const bytes = await entry.async("uint8array");
    hashes[fileId] = await fingerprint(bytes);
    const type = data.expenses.find((e) => e.proof?.fileId === fileId)?.proof?.type ?? "image/webp";
    images.set(fileId, new Blob([bytes as BlobPart], { type }));
  }
  const { pack, problems } = verifyPack(data, hashes, reviewer);
  return { pack, images, problems };
}
