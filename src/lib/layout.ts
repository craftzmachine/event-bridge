// Venue floor plans: tables, stage, mandap and the rest, placed in metres in a room, one plan per function.
// Pure geometry and templates, so layout.test.ts runs it in Node; the editor is src/components/LayoutEditor.tsx.
import type { LayoutItem, LayoutKind, Proposal, VenueLayout } from "../types";

export const GRID = 0.25;
export const ROOM_MIN = 5;
export const ROOM_MAX = 200;
export const ITEMS_MAX = 600;

export interface KindInfo {
  label: string;
  /** default size in metres */
  w: number;
  h: number;
  /** seats by default, for tables and chair rows */
  seats?: number;
  round?: boolean;
  /** drawn as a solid block (stage, mandap…) rather than furniture */
  zone?: boolean;
}

export const KINDS: Record<LayoutKind, KindInfo> = {
  round: { label: "Round table", w: 1.8, h: 1.8, seats: 10, round: true },
  rect: { label: "Long table", w: 2.4, h: 0.9, seats: 8 },
  row: { label: "Chair row", w: 5, h: 0.6, seats: 10 },
  stage: { label: "Stage", w: 8, h: 4, zone: true },
  mandap: { label: "Mandap", w: 5, h: 5, zone: true },
  dance: { label: "Dance floor", w: 6, h: 6, zone: true },
  bar: { label: "Bar / juice counter", w: 4, h: 1, zone: true },
  buffet: { label: "Buffet counter", w: 6, h: 1.2, zone: true },
  entrance: { label: "Entrance", w: 3, h: 0.5, zone: true },
  dj: { label: "DJ / sound", w: 2.5, h: 1.5, zone: true },
  photo: { label: "Photo booth", w: 3, h: 2.5, zone: true },
  wall: { label: "Wall / divider", w: 6, h: 0.2, zone: true },
  label: { label: "Text label", w: 4, h: 0.8 },
};

/** the order of the editor's palette */
export const PALETTE: LayoutKind[] = ["round", "rect", "row", "stage", "mandap", "dance", "buffet", "bar", "dj", "photo", "entrance", "wall", "label"];

export const isTable = (it: Pick<LayoutItem, "kind">) => it.kind === "round" || it.kind === "rect" || it.kind === "row";
export const snap = (n: number, step = GRID) => Math.round(n / step) * step;
const r2 = (n: number) => Math.round(n * 100) / 100;
const uid = () => Math.random().toString(36).slice(2, 9);

export const emptyLayout = (w = 30, h = 20): VenueLayout => ({ w, h, items: [] });
export const layoutOf = (p: Pick<Proposal, "layouts">, fnId: string): VenueLayout | undefined => p.layouts?.[fnId];

/** the corners of an item after rotation, in room metres */
export function corners(it: Pick<LayoutItem, "x" | "y" | "w" | "h" | "rot">): [number, number][] {
  const a = (it.rot * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([dx, dy]) => {
    const px = (dx * it.w) / 2;
    const py = (dy * it.h) / 2;
    return [it.x + px * c - py * s, it.y + px * s + py * c] as [number, number];
  });
}

/** the axis-aligned box around an item after rotation */
export function bounds(it: Pick<LayoutItem, "x" | "y" | "w" | "h" | "rot">) {
  const pts = corners(it);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** moves an item back inside the room if any part of it is outside */
export function clampToRoom(it: LayoutItem, room: Pick<VenueLayout, "w" | "h">): LayoutItem {
  const b = bounds(it);
  let dx = 0;
  let dy = 0;
  if (b.x0 < 0) dx = -b.x0;
  else if (b.x1 > room.w) dx = room.w - b.x1;
  if (b.y0 < 0) dy = -b.y0;
  else if (b.y1 > room.h) dy = room.h - b.y1;
  return dx || dy ? { ...it, x: r2(it.x + dx), y: r2(it.y + dy) } : it;
}

/** do two items' rotated shapes overlap? (separating axis test on the two rectangles) */
export function overlaps(a: LayoutItem, b: LayoutItem): boolean {
  const pa = corners(a);
  const pb = corners(b);
  for (const poly of [pa, pb]) {
    for (let i = 0; i < 4; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % 4];
      const nx = y2 - y1;
      const ny = x1 - x2;
      const proj = (pts: [number, number][]) => pts.map(([x, y]) => x * nx + y * ny);
      const A = proj(pa);
      const B = proj(pb);
      if (Math.max(...A) <= Math.min(...B) + 1e-6 || Math.max(...B) <= Math.min(...A) + 1e-6) return false;
    }
  }
  return true;
}

/** ids of items that overlap another (labels and walls are allowed to cross things) */
export function clashes(items: LayoutItem[]): Set<string> {
  const solid = items.filter((i) => i.kind !== "label" && i.kind !== "wall");
  const out = new Set<string>();
  for (let i = 0; i < solid.length; i++)
    for (let j = i + 1; j < solid.length; j++)
      if (overlaps(solid[i], solid[j])) {
        out.add(solid[i].id);
        out.add(solid[j].id);
      }
  return out;
}

/**
 * Where each seat of a table sits, in the item's own frame (centre 0,0, before rotation), with the chair's facing
 * angle. Round: evenly round the edge. Long table: along both long sides. Chair row: in a line.
 */
export function seatPositions(it: Pick<LayoutItem, "kind" | "w" | "h" | "seats">): { x: number; y: number; a: number }[] {
  const n = Math.max(0, Math.floor(it.seats ?? 0));
  if (!n) return [];
  if (it.kind === "round") {
    const rr = Math.min(it.w, it.h) / 2 + 0.3;
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      return { x: r2(Math.cos(a) * rr), y: r2(Math.sin(a) * rr), a: (a * 180) / Math.PI + 90 };
    });
  }
  if (it.kind === "row") return Array.from({ length: n }, (_, i) => ({ x: r2(-it.w / 2 + (it.w / n) * (i + 0.5)), y: 0, a: 0 }));
  // long table: half on each long side (the extra one on the top side)
  const top = Math.ceil(n / 2);
  const bottom = n - top;
  const side = (count: number, y: number, a: number) => Array.from({ length: count }, (_, i) => ({ x: r2(-it.w / 2 + (it.w / count) * (i + 0.5)), y, a }));
  return [...side(top, -it.h / 2 - 0.3, 180), ...side(bottom, it.h / 2 + 0.3, 0)];
}

/** seats in a seat position, turned to the room's frame */
export function seatInRoom(it: LayoutItem, s: { x: number; y: number }) {
  const a = (it.rot * Math.PI) / 180;
  return { x: it.x + s.x * Math.cos(a) - s.y * Math.sin(a), y: it.y + s.x * Math.sin(a) + s.y * Math.cos(a) };
}

export const layoutCapacity = (l: VenueLayout | undefined) => (l?.items ?? []).filter(isTable).reduce((t, i) => t + (i.seats ?? 0), 0);

/** the next table number ("Table 7"), counting the tables already there */
export function nextTableLabel(items: LayoutItem[]): string {
  const used = new Set(items.map((i) => i.label));
  for (let n = 1; ; n++) if (!used.has(`Table ${n}`)) return `Table ${n}`;
}

export function newItem(kind: LayoutKind, at: { x: number; y: number }, items: LayoutItem[] = []): LayoutItem {
  const k = KINDS[kind];
  return {
    id: uid(),
    kind,
    x: snap(at.x),
    y: snap(at.y),
    w: k.w,
    h: k.h,
    rot: 0,
    ...(k.seats ? { seats: k.seats } : {}),
    label: kind === "round" || kind === "rect" ? nextTableLabel(items) : kind === "label" ? "Label" : k.label,
  };
}

/** a copy with fresh ids, for templates and duplicates */
export const cloneItems = (items: LayoutItem[], dx = 0, dy = 0) => items.map((i) => ({ ...i, id: uid(), x: r2(i.x + dx), y: r2(i.y + dy) }));

export type Starter = "rounds" | "banquet" | "ceremony";
export const STARTERS: { id: Starter; label: string; hint: string }[] = [
  { id: "rounds", label: "Reception rounds", hint: "Stage, dance floor, buffet and round tables of 10" },
  { id: "banquet", label: "Banquet long tables", hint: "Head table and long tables of 8 for a sit-down meal" },
  { id: "ceremony", label: "Mandap with chair rows", hint: "Mandap at the front, an aisle and rows of chairs" },
];

/**
 * A first plan sized for the guests, for the planner to adjust. The room grows to fit; nothing overlaps.
 */
export function starterLayout(kind: Starter, guests: number): VenueLayout {
  const people = Math.max(10, Math.min(3000, Math.round(guests) || 100));
  const items: LayoutItem[] = [];
  const add = (k: LayoutKind, x: number, y: number, extra: Partial<LayoutItem> = {}) => {
    const it = { ...newItem(k, { x, y }, items), ...extra };
    items.push(it);
    return it;
  };
  if (kind === "ceremony") {
    const perRow = 10;
    const rows = Math.ceil(people / (perRow * 2));
    const w = Math.max(24, perRow * 0.5 * 2 + 4 + 4);
    const h = 4 + 6 + rows * 1.1 + 4;
    add("mandap", w / 2, 4.5);
    for (let r = 0; r < rows; r++) {
      const y = 9 + r * 1.1;
      add("row", w / 2 - 3.5 - 0.25, y, { seats: perRow, label: `Row ${r + 1} L` });
      add("row", w / 2 + 3.5 + 0.25, y, { seats: perRow, label: `Row ${r + 1} R` });
    }
    add("entrance", w / 2, h - 0.5);
    return { w: snap(w), h: snap(h), items };
  }
  const seats = kind === "rounds" ? 10 : 8;
  const tables = Math.ceil(people / seats);
  const cellW = kind === "rounds" ? 3.6 : 3.4;
  const cellH = kind === "rounds" ? 3.6 : 2.8;
  const cols = Math.max(4, Math.ceil(Math.sqrt(tables * 1.4)));
  const rowsN = Math.ceil(tables / cols);
  const w = Math.max(24, cols * cellW + 4);
  const top = kind === "rounds" ? 13 : 7;
  const h = top + rowsN * cellH + 5;
  if (kind === "rounds") {
    add("stage", w / 2, 3);
    add("dance", w / 2, 9);
    add("buffet", 4.5, h - 1.5);
    add("bar", w - 4, h - 1.5);
  } else {
    add("stage", w / 2, 2.5, { w: 6, h: 3 });
    add("rect", w / 2, 5.2, { w: 6, seats: 10, label: "Head table" });
    add("buffet", w / 2, h - 1.5);
  }
  const x0 = (w - cols * cellW) / 2 + cellW / 2;
  for (let i = 0; i < tables; i++) add(kind === "rounds" ? "round" : "rect", x0 + (i % cols) * cellW, top + Math.floor(i / cols) * cellH + cellH / 2, { seats });
  add("entrance", w / 2, h - 0.25);
  return { w: snap(w), h: snap(h), items };
}

// ---- editing helpers for the canvas editor ----------------------------------------------------

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Guide {
  /** "v": a vertical line at x = at; "h": a horizontal line at y = at; from/to along the other axis */
  dir: "v" | "h";
  at: number;
  from: number;
  to: number;
}

/**
 * Smart guides: when an edge or centre of the moving box comes within `tol` metres of another box's edge or
 * centre (or the room's centre lines), how far to nudge it to line up, and the lines to draw.
 */
export function snapGuides(moving: Box, others: Box[], tol = 0.15, room?: { w: number; h: number }): { dx: number; dy: number; guides: Guide[] } {
  const xs = (b: Box) => [b.x0, (b.x0 + b.x1) / 2, b.x1];
  const ys = (b: Box) => [b.y0, (b.y0 + b.y1) / 2, b.y1];
  const targets = room ? [...others, { x0: room.w / 2, x1: room.w / 2, y0: room.h / 2, y1: room.h / 2 }] : others;
  let bestX: { d: number; at: number; box: Box } | null = null;
  let bestY: { d: number; at: number; box: Box } | null = null;
  for (const o of targets) {
    for (const m of xs(moving))
      for (const t of xs(o)) {
        const d = t - m;
        if (Math.abs(d) <= tol && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, at: t, box: o };
      }
    for (const m of ys(moving))
      for (const t of ys(o)) {
        const d = t - m;
        if (Math.abs(d) <= tol && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, at: t, box: o };
      }
  }
  const guides: Guide[] = [];
  const dx = bestX?.d ?? 0;
  const dy = bestY?.d ?? 0;
  if (bestX) guides.push({ dir: "v", at: bestX.at, from: Math.min(moving.y0 + dy, bestX.box.y0), to: Math.max(moving.y1 + dy, bestX.box.y1) });
  if (bestY) guides.push({ dir: "h", at: bestY.at, from: Math.min(moving.x0 + dx, bestY.box.x0), to: Math.max(moving.x1 + dx, bestY.box.x1) });
  return { dx, dy, guides };
}

export const SEATS_MAX: Partial<Record<LayoutKind, number>> = { round: 24, rect: 24, row: 40 };

/** chairs that fit a table of this size: about 0.55 m of edge per chair round a table, 0.5 m per chair in a row */
export function seatsFor(kind: LayoutKind, w: number, h: number): number {
  const max = SEATS_MAX[kind] ?? 0;
  if (!max) return 0;
  const n = kind === "round" ? (Math.PI * Math.min(w, h)) / 0.55 : kind === "rect" ? (2 * Math.max(w, h)) / 0.55 : Math.max(w, h) / 0.5;
  return Math.max(1, Math.min(max, Math.floor(n + 1e-6)));
}

/**
 * A resized item: round tables stay round, nothing smaller than 0.4 m (walls 0.1 m deep), and a table's seats
 * follow its new size when `fitSeats` is set (the canvas does this on resize, so a smaller table loses chairs).
 */
export function resizeItem(it: LayoutItem, w: number, h: number, fitSeats = true): LayoutItem {
  const minH = it.kind === "wall" ? 0.1 : 0.4;
  let nw = Math.max(0.4, snap(w, 0.05));
  let nh = Math.max(minH, snap(h, 0.05));
  if (KINDS[it.kind].round) nw = nh = Math.max(nw, nh);
  const next = { ...it, w: r2(nw), h: r2(nh) };
  return fitSeats && isTable(it) ? { ...next, seats: seatsFor(it.kind, nw, nh) } : next;
}
