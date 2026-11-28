// Turns an uploaded venue drawing (an image, or one page of a PDF) into a WebP of at most 2400 px for the floor plan's
// background. Browser-only; pdf.js is imported only when a PDF is chosen, so it stays out of the editor's chunk.
const MAX = 2400;

async function toWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.85));
  if (blob) return blob;
  const png = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!png) throw new Error("This browser couldn't save the drawing.");
  return png;
}

async function fromImage(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file).catch(() => {
    throw new Error("That image couldn't be read. Try a PNG, JPG or WebP.");
  });
  const f = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * f));
  c.height = Math.max(1, Math.round(bmp.height * f));
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

/** how many pages a PDF has, so the editor can ask which one */
export async function pdfPages(file: Blob): Promise<number> {
  const { doc, close } = await openPdf(file);
  const n = doc.numPages;
  await close();
  return n;
}

async function openPdf(file: Blob) {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true });
  try {
    return { doc: await task.promise, close: () => task.destroy() };
  } catch (e) {
    await task.destroy();
    throw new Error((e as { name?: string }).name === "PasswordException" ? "This PDF is password-protected. Save a copy without a password." : "This PDF couldn't be read.");
  }
}

async function fromPdf(file: Blob, page: number): Promise<HTMLCanvasElement> {
  const { doc, close } = await openPdf(file);
  try {
    const p = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
    const base = p.getViewport({ scale: 1 });
    const viewport = p.getViewport({ scale: Math.min(4, MAX / Math.max(base.width, base.height)) });
    const c = document.createElement("canvas");
    c.width = Math.round(viewport.width);
    c.height = Math.round(viewport.height);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    await p.render({ canvas: c, canvasContext: ctx, viewport }).promise;
    return c;
  } finally {
    await close();
  }
}

export const isPdf = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);

export async function prepareBackdrop(file: File, page = 1): Promise<{ blob: Blob; w: number; h: number }> {
  const canvas = isPdf(file) ? await fromPdf(file, page) : await fromImage(file);
  return { blob: await toWebp(canvas), w: canvas.width, h: canvas.height };
}
