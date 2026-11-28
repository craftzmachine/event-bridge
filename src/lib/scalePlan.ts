// Printing a floor plan to scale: which standard scale fits the room on the chosen paper, and how big a metre is on
// it. Pure (no pdfmake), so the editor's Print panel can show "1:100 on A3" before anything loads; the document
// itself is built in exportScalePlan.ts.
import type { VenueLayout } from "../types";

export type Paper = "A4" | "A3";
export type Orientation = "landscape" | "portrait";
export const SCALES = [50, 100, 200, 250, 500] as const;

/** portrait page size in points */
export const PAPER_PT: Record<Paper, { w: number; h: number }> = { A4: { w: 595.28, h: 841.89 }, A3: { w: 841.89, h: 1190.55 } };
export const MARGIN = 28;
/** room for the title block, legend and counts under the plan */
export const INFO_H = 118;
/** the plan is drawn with a metre of paper round the room (layoutSvg's padding) */
export const PAD_M = 1;
const PT_PER_MM = 72 / 25.4;

/** points per real metre at 1:scale */
export const ptPerMetre = (scale: number) => (1000 / scale) * PT_PER_MM;

export const orientationFor = (l: Pick<VenueLayout, "w" | "h">): Orientation => (l.w >= l.h ? "landscape" : "portrait");

/** the area left for the plan itself, in points */
export function planArea(paper: Paper, orientation: Orientation) {
  const p = PAPER_PT[paper];
  const [w, h] = orientation === "landscape" ? [p.h, p.w] : [p.w, p.h];
  return { pageW: w, pageH: h, w: w - MARGIN * 2, h: h - MARGIN * 2 - INFO_H };
}

/** the largest standard drawing (smallest scale number) that fits, or null when even 1:500 doesn't */
export function pickScale(l: Pick<VenueLayout, "w" | "h">, paper: Paper, orientation: Orientation): number | null {
  const a = planArea(paper, orientation);
  return SCALES.find((s) => (l.w + PAD_M * 2) * ptPerMetre(s) <= a.w && (l.h + PAD_M * 2) * ptPerMetre(s) <= a.h) ?? null;
}

/** whether a chosen scale fits */
export const fits = (l: Pick<VenueLayout, "w" | "h">, paper: Paper, orientation: Orientation, scale: number) => {
  const a = planArea(paper, orientation);
  return (l.w + PAD_M * 2) * ptPerMetre(scale) <= a.w + 0.5 && (l.h + PAD_M * 2) * ptPerMetre(scale) <= a.h + 0.5;
};

/** a scale bar length in metres that reads well at this scale */
export const scaleBarMetres = (scale: number) => (scale <= 50 ? 2 : scale <= 100 ? 5 : scale <= 250 ? 10 : 20);
