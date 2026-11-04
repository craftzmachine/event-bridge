import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { HttpError } from "../http.js";

export const MAX_PAGES = 30;
const TARGET_WIDTH = 1100; // px; sharp on laptops and tablets, ~100–200 KB per page as WebP

export interface RenderedPdf {
  pages: { w: number; h: number; image: Buffer }[];
}

const require = createRequire(import.meta.url);

let fontReady = false;
async function watermarkFont() {
  const { GlobalFonts } = await import("@napi-rs/canvas");
  if (!fontReady) {
    // pdfmake ships Roboto as base64; serverless hosts have no system fonts to fall back on
    const vfs = require("pdfmake/build/vfs_fonts") as Record<string, string>;
    GlobalFonts.register(Buffer.from(vfs["Roboto-Medium.ttf"], "base64"), "PB Watermark");
    fontReady = true;
  }
}

/**
 * Renders each page to a WebP image with the client's name tiled across it, so the PDF file itself never has to
 * reach the client's browser.
 */
export async function renderPdf(data: Buffer, watermark: string): Promise<RenderedPdf> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // a static import of the worker lets the deploy bundler see it; pdf.js then runs it in-process
  // @ts-expect-error the worker entry ships without type declarations
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker ??= await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");
  await watermarkFont();

  const root = dirname(require.resolve("pdfjs-dist/package.json"));
  const task = pdfjs.getDocument({
    data: new Uint8Array(data),
    disableFontFace: true,
    standardFontDataUrl: join(root, "standard_fonts") + "/",
    cMapUrl: join(root, "cmaps") + "/",
    cMapPacked: true,
    wasmUrl: join(root, "wasm") + "/",
    iccUrl: join(root, "iccs") + "/",
  });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    await task.destroy();
    if ((e as { name?: string }).name === "PasswordException") throw new HttpError(422, "This PDF is password-protected. Upload a copy without a password.");
    throw new HttpError(422, "This PDF couldn't be read. Try exporting it again.");
  }
  if (doc.numPages > MAX_PAGES) {
    const n = doc.numPages;
    await task.destroy();
    throw new HttpError(422, `This PDF has ${n} pages; the limit is ${MAX_PAGES}.`);
  }

  const pages: RenderedPdf["pages"] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(3, TARGET_WIDTH / base.width) });
      const w = Math.ceil(viewport.width);
      const h = Math.ceil(viewport.height);
      const canvas = createCanvas(w, h);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;
      stamp(ctx as unknown as CanvasRenderingContext2D, w, h, watermark);
      pages.push({ w, h, image: await canvas.encode("webp", 80) });
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return { pages };
}

/** Diagonal, faint, repeated — readable on any part of a cropped screenshot without hiding the content. */
function stamp(ctx: CanvasRenderingContext2D, w: number, h: number, text: string) {
  const size = Math.round(w / 34);
  ctx.save();
  ctx.font = `${size}px "PB Watermark"`;
  ctx.fillStyle = "rgba(120, 96, 60, 0.13)";
  ctx.textAlign = "center";
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 6);
  const stepX = size * text.length * 0.62 + size * 3;
  const stepY = size * 6;
  for (let y = -h; y <= h; y += stepY)
    for (let x = -w * 1.2 + ((y / stepY) % 2) * (stepX / 2); x <= w * 1.2; x += stepX) ctx.fillText(text, x, y);
  ctx.restore();
}
