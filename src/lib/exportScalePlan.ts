// The floor plan printed to scale (1:50 to 1:500 on A4 or A3) with a scale bar, the main zones' sizes, a legend of
// what's in the plan and a title block, for venue managers, décor teams and the rental vendor. Loaded only through
// `await import("./exportScalePlan")`, like the other exports, so pdfmake stays lazy. buildScalePlanDoc is pure.
import type { CanvasElement, Content, TDocumentDefinitions } from "pdfmake/interfaces";
import type { Brand, LayoutKind, VenueLayout } from "../types";
import { KINDS, drawOrder, isTable } from "./layout";
import { planCounts } from "./inventory";
import { layoutSvg } from "./exportSeating";
import { MARGIN, PAD_M, planArea, pickScale, fits, ptPerMetre, scaleBarMetres, orientationFor, type Orientation, type Paper } from "./scalePlan";
import { renderPdf } from "./exportPdf";
import { saveBlob } from "./files";
import { formatDate, safeFilePart, todayISO } from "./format";

const INK = "#2e2620";
const MUTED = "#8e8377";
const GOLD = "#b79a68";
const SOFT = "#f4eee3";
const LINE = "#d8cfbf";
const r2 = (n: number) => Math.round(n * 100) / 100;
/** zones whose size the venue and décor teams ask for */
const DIMENSIONED: LayoutKind[] = ["mandap", "stage", "dance", "aisle", "kids", "screen", "buffet", "bar"];

export interface ScalePlanOptions {
  title: string;
  venue: string;
  layout: VenueLayout;
  paper: Paper;
  orientation?: Orientation | "auto";
  /** 1:scale; "auto" picks the largest that fits */
  scale?: number | "auto";
  seatNumbers?: boolean;
  /** the venue drawing as a JPEG/PNG data URL, already faded to its opacity, and where it sits (metres) */
  backdrop?: { dataUrl: string; x: number; y: number; w: number; h: number };
  dated?: string;
}

export function buildScalePlanDoc(o: ScalePlanOptions, brand: Pick<Brand, "company">, logo?: string): { doc: TDocumentDefinitions; scale: number | null; orientation: Orientation } {
  const l = o.layout;
  const orientation = !o.orientation || o.orientation === "auto" ? orientationFor(l) : o.orientation;
  const area = planArea(o.paper, orientation);
  const wanted = o.scale && o.scale !== "auto" && fits(l, o.paper, orientation, o.scale) ? o.scale : pickScale(l, o.paper, orientation);
  // too big for even 1:500 on this paper: fit it, and say it isn't to scale
  const perM = wanted ? ptPerMetre(wanted) : Math.min(area.w / (l.w + PAD_M * 2), area.h / (l.h + PAD_M * 2));
  const planW = (l.w + PAD_M * 2) * perM;
  const planH = (l.h + PAD_M * 2) * perM;
  const left = MARGIN + (area.w - planW) / 2;
  const top = MARGIN;
  // room metres → page points
  const at = (x: number, y: number) => ({ x: left + (x + PAD_M) * perM, y: top + (y + PAD_M) * perM });

  const counts = planCounts(l);
  const kinds = new Map<LayoutKind, number>();
  for (const it of l.items) if (it.kind !== "label") kinds.set(it.kind, (kinds.get(it.kind) ?? 0) + 1);
  const zones = drawOrder(l.items).filter((i) => DIMENSIONED.includes(i.kind));
  const bar = scaleBarMetres(wanted ?? 500);
  const barPt = bar * perM;

  const swatch = (k: LayoutKind): CanvasElement[] => {
    const info = KINDS[k];
    if (k === "row") return [0, 1, 2].map((i) => ({ type: "ellipse", x: 3 + i * 5, y: 5, r1: 2, r2: 2, color: "#ffffff", lineColor: MUTED, lineWidth: 0.5 }));
    if (info.round) return [{ type: "ellipse", x: 8, y: 5, r1: 4.5, r2: 4.5, color: info.zone ? SOFT : "#ffffff", lineColor: info.zone ? LINE : GOLD, lineWidth: 0.8 }];
    if (k === "wall") return [{ type: "rect", x: 1, y: 4, w: 14, h: 2.5, color: INK }];
    return [{ type: "rect", x: 1, y: 1.5, w: 14, h: 7, color: info.zone ? SOFT : "#ffffff", lineColor: info.zone ? LINE : GOLD, lineWidth: 0.8 }];
  };

  const content: Content[] = [
    ...(o.backdrop
      ? [{ image: o.backdrop.dataUrl, width: o.backdrop.w * perM, height: o.backdrop.h * perM, absolutePosition: at(o.backdrop.x, o.backdrop.y) } as unknown as Content]
      : []),
    { svg: layoutSvg(l, {}, { seatNumbers: o.seatNumbers, transparent: !!o.backdrop }), width: planW, height: planH, absolutePosition: { x: left, y: top } } as unknown as Content,
    // the info block sits under the plan area, whatever the plan's height
    { text: "", margin: [0, area.h + 8, 0, 0] },
    {
      columns: [
        {
          width: "34%",
          stack: [
            {
              columns: [
                ...(logo ? [{ image: `data:image/png;base64,${logo}`, width: 44, margin: [0, 0, 8, 0] }] : []),
                { stack: [{ text: o.title || "Floor plan", fontSize: 13, color: INK, bold: true }, { text: [o.venue, `room ${l.w} × ${l.h} m`].filter(Boolean).join(" · "), fontSize: 8.5, color: MUTED, margin: [0, 2, 0, 0] }] },
              ],
            },
            {
              text: [
                { text: `${counts.tables}`, bold: true }, " tables · ", { text: `${counts.chairs}`, bold: true }, " chairs",
                ...(counts.chairRows ? [" · ", { text: `${counts.chairRows}`, bold: true }, " chair rows"] : []),
              ],
              fontSize: 9, margin: [0, 8, 0, 0],
            },
            { text: `${brand.company} · ${formatDate(o.dated ?? todayISO())}`, fontSize: 7.5, color: MUTED, margin: [0, 4, 0, 0] },
            {
              canvas: [
                { type: "rect", x: 0, y: 0, w: barPt / 2, h: 4, color: INK },
                { type: "rect", x: barPt / 2, y: 0, w: barPt / 2, h: 4, color: "#ffffff", lineColor: INK, lineWidth: 0.6 },
              ],
              margin: [0, 10, 0, 2],
            },
            { columns: [{ text: "0", width: barPt / 2 }, { text: `${bar / 2}`, width: barPt / 2 }, { text: `${bar} m`, width: "auto" }], fontSize: 7, color: MUTED },
            {
              text: wanted ? `Scale 1:${wanted} on ${o.paper} ${orientation}. Print at 100% (actual size), not "fit to page".` : `Not to scale: the room is too large for ${o.paper} at 1:500. The bar above still matches this print.`,
              fontSize: 7.5, color: wanted ? INK : "#a3402f", margin: [0, 4, 0, 0],
            },
          ],
        },
        {
          width: "33%",
          stack: [
            { text: "Legend", fontSize: 9, bold: true, color: INK, margin: [0, 0, 0, 4] },
            {
              columns: [0, 1].map((c) => ({
                stack: [...kinds.entries()].filter((_, i) => i % 2 === c).map(([k, n]) => ({
                  columns: [{ canvas: swatch(k), width: 18 }, { text: `${KINDS[k].label} · ${n}${isTable({ kind: k }) ? ` (${l.items.filter((i) => i.kind === k).reduce((t, i) => t + (i.seats ?? 0), 0)} seats)` : ""}`, fontSize: 7.5 }],
                  margin: [0, 0, 0, 3],
                })),
              })),
              columnGap: 6,
            },
          ],
        },
        {
          width: "33%",
          stack: [
            { text: "Sizes", fontSize: 9, bold: true, color: INK, margin: [0, 0, 0, 4] },
            ...(zones.length
              ? zones.slice(0, 10).map((z) => ({ text: [{ text: z.label || KINDS[z.kind].label, color: INK }, { text: `  ${KINDS[z.kind].round ? `Ø ${r2(z.w)}` : `${r2(z.w)} × ${r2(z.h)}`} m${z.kind === "dance" ? ` · ${r2(z.w * z.h)} m²` : ""}`, color: MUTED }], fontSize: 7.5, margin: [0, 0, 0, 2] }))
              : [{ text: "No stage, mandap or dance floor in this plan.", fontSize: 7.5, color: MUTED }]),
            ...(zones.length > 10 ? [{ text: `and ${zones.length - 10} more`, fontSize: 7, color: MUTED }] : []),
            { text: "Sizes and positions are planning figures; confirm on site with the venue.", fontSize: 6.5, color: MUTED, margin: [0, 6, 0, 0] },
          ],
        },
      ],
      columnGap: 14,
    } as Content,
  ];

  return {
    scale: wanted,
    orientation,
    doc: {
      pageSize: o.paper,
      pageOrientation: orientation,
      pageMargins: [MARGIN, MARGIN, MARGIN, MARGIN],
      info: { title: `Floor plan ${o.title}`, author: brand.company },
      defaultStyle: { font: "Roboto", fontSize: 8, color: INK },
      content,
    },
  };
}

/** the drawing faded to its opacity on white, as a JPEG (PDFs can't take WebP) */
async function fadedJpeg(blob: Blob, opacity: number): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, c.width, c.height);
  g.globalAlpha = Math.max(0.1, Math.min(1, opacity));
  g.drawImage(bmp, 0, 0);
  bmp.close();
  return c.toDataURL("image/jpeg", 0.82);
}

export async function downloadScalePlan(o: Omit<ScalePlanOptions, "backdrop"> & { backdropBlob?: Blob }, brand: Brand) {
  const b = o.layout.backdrop;
  const backdrop = o.backdropBlob && b ? { dataUrl: await fadedJpeg(o.backdropBlob, b.opacity), x: b.x, y: b.y, w: b.w, h: b.h } : undefined;
  let scale: number | null = null;
  const blob = await renderPdf(brand, (logo) => {
    const r = buildScalePlanDoc({ ...o, backdrop }, brand, logo);
    scale = r.scale;
    return r.doc;
  });
  saveBlob(blob, `Floor_plan_${safeFilePart(o.title) || "plan"}_${scale ? `1-${scale}` : "fit"}_${o.paper}.pdf`);
  return scale;
}
