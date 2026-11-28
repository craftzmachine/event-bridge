// Safety and clearance checks for a floor plan: aisles wide enough, room to walk between tables, space in front of the
// stage and mandap, a clear entrance, nothing outside the room, and how crowded the room is. These are planning
// guidance figures, not a fire code; the venue's own rules win. Pure, so safety.test.ts checks it.
import type { LayoutItem, VenueLayout } from "../types";
import { KINDS, bounds, clampToRoom, corners, isTable, seatInRoom, seatPositions } from "./layout";

export const AISLE_MIN = 1.2;
/** between the backs of chairs at neighbouring tables, so a guest and a server can pass */
export const TABLE_GAP_MIN = 0.9;
/** chairs from the front of a stage or mandap */
export const STAGE_GAP_MIN = 1.5;
export const ENTRANCE_CLEAR = 1.5;
/** floor area per guest, for the whole room */
export const M2_PER_DINNER = 1.1;
export const M2_PER_THEATRE = 0.6;
/** a chair's depth from its centre to its back */
const CHAIR_BACK = 0.25;

export interface Issue {
  id: string;
  level: "warn" | "info";
  text: string;
  itemIds: string[];
  fix?: { label: string; apply: (items: LayoutItem[]) => LayoutItem[] };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const name = (i: LayoutItem) => i.label || KINDS[i.kind].label;

/** how far a room point is from an item's rotated rectangle (0 inside) */
function distToItem(it: LayoutItem, p: { x: number; y: number }): number {
  const a = (it.rot * Math.PI) / 180;
  const dx = p.x - it.x;
  const dy = p.y - it.y;
  const lx = dx * Math.cos(a) + dy * Math.sin(a);
  const ly = -dx * Math.sin(a) + dy * Math.cos(a);
  return Math.hypot(Math.max(0, Math.abs(lx) - it.w / 2), Math.max(0, Math.abs(ly) - it.h / 2));
}

const chairsOf = (it: LayoutItem) => (isTable(it) ? seatPositions(it).map((s) => seatInRoom(it, s)) : []);

/** points that stand for an item's footprint: corners, edge midpoints, centre and chairs */
function footprint(it: LayoutItem) {
  const c = corners(it).map(([x, y]) => ({ x, y }));
  const mids = c.map((p, i) => ({ x: (p.x + c[(i + 1) % 4].x) / 2, y: (p.y + c[(i + 1) % 4].y) / 2 }));
  return [...c, ...mids, { x: it.x, y: it.y }, ...chairsOf(it)];
}

export function checkPlan(l: VenueLayout, guests?: number | null): Issue[] {
  const items = l.items;
  const out: Issue[] = [];

  // aisles
  for (const a of items.filter((i) => i.kind === "aisle")) {
    const narrow = Math.min(a.w, a.h);
    if (narrow < AISLE_MIN - 1e-6)
      out.push({
        id: `aisle:${a.id}`, level: "warn", itemIds: [a.id],
        text: `${name(a)} is ${r1(narrow)} m wide; aim for at least ${AISLE_MIN} m so two people can pass.`,
        fix: { label: `Widen to ${AISLE_MIN} m`, apply: (list) => list.map((i) => (i.id === a.id ? clampToRoom(i.w <= i.h ? { ...i, w: AISLE_MIN } : { ...i, h: AISLE_MIN }, l) : i)) },
      });
  }

  // room to walk between neighbouring tables (chair back to chair back)
  const tables = items.filter((i) => i.kind === "round" || i.kind === "rect");
  const tight: [LayoutItem, LayoutItem, number][] = [];
  for (let i = 0; i < tables.length; i++)
    for (let j = i + 1; j < tables.length; j++) {
      const A = tables[i];
      const B = tables[j];
      const ba = bounds(A);
      const bb = bounds(B);
      // far apart: skip before the chair-by-chair check
      if (ba.x0 - bb.x1 > 3 || bb.x0 - ba.x1 > 3 || ba.y0 - bb.y1 > 3 || bb.y0 - ba.y1 > 3) continue;
      const ca = chairsOf(A);
      const cb = chairsOf(B);
      if (!ca.length || !cb.length) continue;
      let min = Infinity;
      for (const p of ca) for (const q of cb) min = Math.min(min, Math.hypot(p.x - q.x, p.y - q.y));
      const gap = min - CHAIR_BACK * 2;
      if (gap < TABLE_GAP_MIN - 1e-6) tight.push([A, B, gap]);
    }
  for (const [A, B, gap] of tight.slice(0, 12))
    out.push({ id: `gap:${A.id}:${B.id}`, level: "warn", itemIds: [A.id, B.id], text: `${name(A)} and ${name(B)}: ${gap <= 0 ? "chairs touch" : `${r1(gap)} m between chairs`}; leave about ${TABLE_GAP_MIN} m to walk and serve.` });
  if (tight.length > 12) out.push({ id: "gap:more", level: "warn", itemIds: tight.slice(12).flatMap(([a, b]) => [a.id, b.id]), text: `${tight.length - 12} more pairs of tables are too close.` });

  // space in front of the stage and mandap
  const seating = items.filter(isTable);
  for (const z of items.filter((i) => i.kind === "stage" || i.kind === "mandap")) {
    const near = seating.filter((t) => chairsOf(t).some((c) => distToItem(z, c) < STAGE_GAP_MIN - 1e-6));
    if (near.length)
      out.push({ id: `stage:${z.id}`, level: "warn", itemIds: [z.id, ...near.map((t) => t.id)], text: `${near.length === 1 ? name(near[0]) : `${near.length} tables or rows`} within ${STAGE_GAP_MIN} m of the ${name(z).toLowerCase()}; leave room for the couple, priests and photographers.` });
  }

  // a clear way in
  for (const e of items.filter((i) => i.kind === "entrance")) {
    const block = items.filter((i) => i.id !== e.id && !["aisle", "label", "entrance", "dance"].includes(i.kind) && footprint(i).some((p) => distToItem(e, p) < ENTRANCE_CLEAR - 1e-6));
    if (block.length)
      out.push({ id: `door:${e.id}`, level: "warn", itemIds: [e.id, ...block.map((i) => i.id)], text: `${block.length === 1 ? name(block[0]) : `${block.length} items`} within ${ENTRANCE_CLEAR} m of the ${name(e).toLowerCase()}; keep the way in clear.` });
  }

  // nothing outside the room
  const outside = items.filter((i) => {
    const b = bounds(i);
    return b.x0 < -0.01 || b.y0 < -0.01 || b.x1 > l.w + 0.01 || b.y1 > l.h + 0.01;
  });
  if (outside.length)
    out.push({
      id: "outside", level: "warn", itemIds: outside.map((i) => i.id), text: `${outside.length === 1 ? name(outside[0]) : `${outside.length} items`} outside the room.`,
      fix: { label: "Move inside", apply: (list) => list.map((i) => (outside.some((o) => o.id === i.id) ? clampToRoom(i, l) : i)) },
    });

  // how crowded the room is
  const dinner = items.filter((i) => i.kind === "round" || i.kind === "rect").reduce((t, i) => t + (i.seats ?? 0), 0);
  const theatre = items.filter((i) => i.kind === "row").reduce((t, i) => t + (i.seats ?? 0), 0);
  const need = dinner * M2_PER_DINNER + theatre * M2_PER_THEATRE;
  const area = l.w * l.h;
  if (need > area)
    out.push({ id: "density", level: "warn", itemIds: [], text: `Crowded: ${dinner + theatre} seats want about ${Math.round(need)} m² (${M2_PER_DINNER} m² a dinner guest, ${M2_PER_THEATRE} m² in rows), and the room is ${Math.round(area)} m².` });
  if (guests && guests > dinner + theatre)
    out.push({ id: "seats", level: "info", itemIds: [], text: `${guests} guests expected, ${dinner + theatre} seats in the plan.` });

  const hidden = items.filter((i) => i.hidden);
  if (hidden.length)
    out.push({ id: "hidden", level: "info", itemIds: hidden.map((i) => i.id), text: `${hidden.length} hidden ${hidden.length === 1 ? "item still counts" : "items still count"} and print${hidden.length === 1 ? "s" : ""}.` });
  return out;
}
