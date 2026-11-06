// Preparing a proof image: scaled down so a phone's storage and a handover pack stay small, and fingerprinted.
import { sha256Bytes } from "../auth/sha256";

const MAX_SIDE = 1600;

/** SHA-256 in hex: crypto.subtle where the browser offers it (https, localhost), else the pure version. */
export async function fingerprint(bytes: Uint8Array): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return sha256Bytes(bytes);
}

/** A screenshot or photo, at most 1600 px on its longer side, as WebP (or JPEG where WebP can't be written). */
export async function prepareProof(file: Blob): Promise<{ blob: Blob; sha256: string; type: string }> {
  if (!file.type.startsWith("image/")) throw new Error("Attach an image: a screenshot or a photo of the receipt.");
  let blob: Blob = file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    if (scale < 1 || file.size > 600_000) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.85));
      const fallback = out && out.type === "image/webp" ? out : await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
      if (fallback && fallback.size < file.size) blob = fallback;
    }
    bmp.close();
  } catch {
    // a format the browser can't decode (e.g. HEIC on some desktops): keep the original
  }
  const sha256 = await fingerprint(new Uint8Array(await blob.arrayBuffer()));
  return { blob, sha256, type: blob.type || file.type };
}
