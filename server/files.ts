export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB
export type FileKind = "pdf" | "xlsx";

const MB = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

/** Checks size, extension and the file's actual contents (magic bytes), so a renamed file can't slip through. */
export function validateUpload(name: string, data: Buffer): { kind: FileKind } | { error: string } {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (!data.length) return { error: "The file is empty." };
  if (data.length > MAX_UPLOAD_BYTES) return { error: `The file is ${MB(data.length)}; the limit is ${MB(MAX_UPLOAD_BYTES)}.` };
  if (ext === "xls" || ext === "xlsm" || ext === "csv")
    return { error: `.${ext} files aren't supported. Save it as an Excel workbook (.xlsx) and upload that.` };
  if (ext !== "pdf" && ext !== "xlsx") return { error: "Upload a PDF (.pdf) or an Excel workbook (.xlsx)." };
  if (ext === "pdf") return data.subarray(0, 1024).includes("%PDF-") ? { kind: "pdf" } : { error: "This file is named .pdf but isn't a valid PDF." };
  const isZip = data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
  // zip entry names are stored uncompressed, so the workbook part's name is visible in the bytes
  return isZip && data.includes("xl/workbook.xml") ? { kind: "xlsx" } : { error: "This file is named .xlsx but isn't a valid Excel workbook." };
}
