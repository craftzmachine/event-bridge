// Browser-only helpers shared by the Excel and PDF exports.

/** Rasterises an SVG/PNG URL to base64 PNG (no data: prefix) so it can be embedded in a file. */
export async function logoToPng(url: string, width = 600, height = 408): Promise<string | undefined> {
  try {
    const img = new Image();
    // onload rather than img.decode(): decode() can stay pending in a tab that isn't painting, which would leave
    // the export stuck on "Preparing…"; without a logo after 5 s the file is still produced
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("logo timeout")), 5000);
      img.onload = () => {
        clearTimeout(t);
        resolve();
      };
      img.onerror = () => {
        clearTimeout(t);
        reject(new Error("logo failed"));
      };
      img.src = url;
    });
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
