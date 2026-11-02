// Browser-only helpers shared by the Excel and PDF exports.

/** Rasterises an SVG/PNG URL to base64 PNG (no data: prefix) so it can be embedded in a file. */
export async function logoToPng(url: string, width = 600, height = 408): Promise<string | undefined> {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    const scale = Math.min(width / img.width, height / img.height);
    ctx.drawImage(img, (width - img.width * scale) / 2, (height - img.height * scale) / 2, img.width * scale, img.height * scale);
    return canvas.toDataURL("image/png").split(",")[1];
  } catch {
    return undefined;
  }
}

export function saveBlob(blob: Blob, fileName: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
