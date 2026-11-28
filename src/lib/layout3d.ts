// A floor plan as a 3D scene description, in metres with y up: the plan's x stays x and its y becomes z. Pure, so
// layout3d.test.ts checks it in Node; src/components/layout/Plan3D.tsx draws it with three.js.
import type { LayoutItem, VenueLayout } from "../types";
import { KINDS, isTable, seatPositions } from "./layout";

/** named colours, so the renderer picks the materials */
export type Paint = "linen" | "gold" | "stage" | "wood" | "dark" | "floral" | "wall" | "dance" | "carpet";

export interface Part {
  shape: "box" | "cyl";
  /** centre */
  x: number;
  y: number;
  z: number;
  /** box: width (x), height (y), depth (z); cylinder: radius in w, height in h */
  w: number;
  h: number;
  d: number;
  /** turn about the vertical axis, radians */
  rotY: number;
  paint: Paint;
  /** the plan item it belongs to */
  itemId: string;
}

export interface Chair {
  x: number;
  z: number;
  rotY: number;
  itemId: string;
  seat: number;
}

export interface Label3D {
  text: string;
  x: number;
  y: number;
  z: number;
  /** table numbers are drawn as round badges */
  badge: boolean;
}

export interface Scene3D {
  w: number;
  d: number;
  parts: Part[];
  chairs: Chair[];
  labels: Label3D[];
  /** where people come in, and where they look (the stage or mandap), for the camera presets */
  entrance: { x: number; z: number };
  focus: { x: number; z: number };
}

export const HEIGHTS = { table: 0.76, stage: 0.6, mandap: 2.7, pillar: 2.6, counter: 0.95, wall: 2.4, chairSeat: 0.46, chairBack: 0.92 };

const deg = (d: number) => (d * Math.PI) / 180;

/** a point in the item's own frame (metres from its centre) in room coordinates */
function place(it: LayoutItem, lx: number, lz: number) {
  const a = deg(it.rot);
  return { x: it.x + lx * Math.cos(a) - lz * Math.sin(a), z: it.y + lx * Math.sin(a) + lz * Math.cos(a) };
}

export function buildScene(l: VenueLayout): Scene3D {
  const parts: Part[] = [];
  const chairs: Chair[] = [];
  const labels: Label3D[] = [];
  const add = (it: LayoutItem, shape: Part["shape"], lx: number, lz: number, y: number, w: number, h: number, d: number, paint: Paint) => {
    const p = place(it, lx, lz);
    parts.push({ shape, x: p.x, y, z: p.z, w, h, d, rotY: -deg(it.rot), paint, itemId: it.id });
  };
  for (const it of l.items) {
    const hw = it.w / 2;
    const hd = it.h / 2;
    if (isTable(it))
      seatPositions(it).forEach((s, i) => {
        const p = place(it, s.x, s.y);
        chairs.push({ x: p.x, z: p.z, rotY: -deg(s.a + it.rot), itemId: it.id, seat: i });
      });
    switch (it.kind) {
      case "round":
        add(it, "cyl", 0, 0, HEIGHTS.table - 0.02, hw, 0.04, 0, "linen");
        add(it, "cyl", 0, 0, (HEIGHTS.table - 0.04) / 2, hw - 0.01, HEIGHTS.table - 0.04, 0, "linen");
        add(it, "cyl", 0, 0, HEIGHTS.table + 0.15, Math.min(0.14, hw / 5), 0.3, 0, "floral");
        break;
      case "rect":
        add(it, "box", 0, 0, HEIGHTS.table - 0.02, it.w, 0.04, it.h, "linen");
        add(it, "box", 0, 0, (HEIGHTS.table - 0.04) / 2, it.w - 0.02, HEIGHTS.table - 0.04, it.h - 0.02, "linen");
        add(it, "box", 0, 0, HEIGHTS.table + 0.005, Math.max(0, it.w - 0.2), 0.01, Math.min(0.36, it.h / 2.5), "gold");
        break;
      case "stage":
        add(it, "box", 0, 0, HEIGHTS.stage / 2, it.w, HEIGHTS.stage, it.h, "stage");
        add(it, "box", 0, 0, HEIGHTS.stage + 0.005, it.w - 0.1, 0.01, it.h - 0.1, "carpet");
        // two steps at the front (the plan's +y side)
        add(it, "box", 0, hd + 0.2, HEIGHTS.stage / 3, Math.min(1.6, it.w), HEIGHTS.stage * (2 / 3), 0.4, "stage");
        add(it, "box", 0, hd + 0.5, HEIGHTS.stage / 6, Math.min(1.6, it.w), HEIGHTS.stage / 3, 0.3, "stage");
        add(it, "box", 0, -hd + 0.15, 1.6, it.w * 0.8, 2, 0.08, "floral");
        break;
      case "mandap":
        add(it, "box", 0, 0, 0.075, it.w, 0.15, it.h, "carpet");
        for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) add(it, "cyl", dx * (hw - 0.3), dz * (hd - 0.3), HEIGHTS.pillar / 2, 0.12, HEIGHTS.pillar, 0, "gold");
        add(it, "box", 0, 0, HEIGHTS.mandap, it.w, 0.1, it.h, "floral");
        add(it, "cyl", 0, 0, 0.3, Math.min(hw, hd) * 0.25, 0.3, 0, "gold");
        break;
      case "dance":
        add(it, "box", 0, 0, 0.01, it.w, 0.02, it.h, "dance");
        break;
      case "bar":
      case "buffet":
        add(it, "box", 0, 0, HEIGHTS.counter / 2, it.w, HEIGHTS.counter, it.h, "wood");
        add(it, "box", 0, 0, HEIGHTS.counter + 0.01, it.w + 0.04, 0.03, it.h + 0.04, "linen");
        break;
      case "dj":
        add(it, "box", 0, 0, 0.5, it.w, 1, it.h, "dark");
        break;
      case "photo":
        for (const dx of [-1, 1]) add(it, "box", dx * (hw - 0.05), 0, 1.1, 0.1, 2.2, 0.1, "gold");
        add(it, "box", 0, 0, 2.2, it.w, 0.1, 0.1, "gold");
        add(it, "box", 0, -hd + 0.05, 1.2, it.w - 0.2, 2, 0.05, "floral");
        break;
      case "entrance":
        for (const dx of [-1, 1]) add(it, "cyl", dx * hw, 0, HEIGHTS.pillar / 2, 0.15, HEIGHTS.pillar, 0, "floral");
        add(it, "box", 0, 0, HEIGHTS.pillar, it.w + 0.3, 0.25, 0.3, "floral");
        break;
      case "wall":
        add(it, "box", 0, 0, HEIGHTS.wall / 2, it.w, HEIGHTS.wall, Math.max(0.1, it.h), "wall");
        break;
      default:
        break;
    }
    // names float above zones; tables get a number badge
    if (it.kind === "round" || it.kind === "rect") {
      const n = /(\d+)\s*$/.exec(it.label ?? "");
      labels.push({ text: n ? n[1] : it.label || KINDS[it.kind].label, x: it.x, y: 1.5, z: it.y, badge: !!n });
    } else if (it.kind === "label" || KINDS[it.kind].zone) {
      const top = it.kind === "mandap" ? HEIGHTS.mandap + 0.5 : it.kind === "stage" ? 2.9 : it.kind === "label" ? 0.6 : 1.9;
      labels.push({ text: it.label || KINDS[it.kind].label, x: it.x, y: top, z: it.y, badge: false });
    }
  }
  const find = (...kinds: LayoutItem["kind"][]) => l.items.find((i) => kinds.includes(i.kind));
  const ent = find("entrance");
  const foc = find("stage", "mandap");
  return {
    w: l.w,
    d: l.h,
    parts,
    chairs,
    labels,
    entrance: ent ? { x: ent.x, z: ent.y } : { x: l.w / 2, z: l.h },
    focus: foc ? { x: foc.x, z: foc.y } : { x: l.w / 2, z: 0 },
  };
}
