// The floor plan as a PNG to send to a family or a venue: the same paper-coloured drawing as the seating PDF
// (layoutSvg), rasterised on a white canvas with a title. Browser-only; loaded with the export when it's used.
import type { VenueLayout } from "../types";
import { layoutSvg } from "./exportSeating";
import type { Plan } from "./seating";
import { saveBlob } from "./files";

export async function downloadPlanImage(layout: VenueLayout, plan: Plan, title: string, fileName: string) {
  const svg = layoutSvg(layout, plan);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("The plan couldn't be drawn."));
      img.src = url;
    });
    const width = 2400;
    const head = 120;
    const height = Math.round((img.height / img.width) * width) + head;
    const cv = document.createElement("canvas");
    cv.width = width;
    cv.height = height;
    const g = cv.getContext("2d")!;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, width, height);
    g.fillStyle = "#2e2620";
    g.font = "600 44px Georgia, 'Times New Roman', serif";
    g.fillText(title, 48, 70);
    g.fillStyle = "#8e8377";
    g.font = "24px Inter, system-ui, sans-serif";
    g.fillText(`Room ${layout.w} × ${layout.h} m`, 48, 104);
    g.drawImage(img, 0, head, width, height - head);
    const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, "image/png"));
    if (!blob) throw new Error("The image couldn't be saved.");
    saveBlob(blob, fileName);
  } finally {
    URL.revokeObjectURL(url);
  }
}
