// What a floor plan needs: live counts for the editor (tables by size, chairs, zones) and an inventory list for the
// rental vendor (chairs, tables, linens, centrepieces, mandap, stage, runner…). Also setting chairs on many tables at
// once. Pure, so inventory.test.ts checks it.
import type { LayoutItem, LayoutKind, VenueLayout } from "../types";
import { KINDS, SEATS_MAX, isTable } from "./layout";

const m = (n: number) => `${Math.round(n * 100) / 100}`;
const size = (it: Pick<LayoutItem, "kind" | "w" | "h">) => (KINDS[it.kind].round ? `Ø ${m(it.w)} m` : `${m(it.w)} × ${m(it.h)} m`);

export interface CountRow {
  kind: LayoutKind;
  label: string;
  size: string;
  seats?: number;
  count: number;
}

export interface PlanCounts {
  tables: number;
  chairRows: number;
  chairs: number;
  /** grouped: kind + size + seats */
  rows: CountRow[];
  /** zones and décor, one row per kind + size */
  zones: CountRow[];
}

function group(items: LayoutItem[], withSeats: boolean): CountRow[] {
  const map = new Map<string, CountRow>();
  for (const it of items) {
    const s = size(it);
    const key = `${it.kind}|${s}|${withSeats ? it.seats ?? 0 : ""}`;
    const row = map.get(key);
    if (row) row.count++;
    else map.set(key, { kind: it.kind, label: KINDS[it.kind].label, size: s, ...(withSeats && it.seats ? { seats: it.seats } : {}), count: 1 });
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label) || b.count - a.count);
}

export function planCounts(l: VenueLayout | undefined): PlanCounts {
  const items = l?.items ?? [];
  const seating = items.filter(isTable);
  return {
    tables: seating.filter((i) => i.kind !== "row").length,
    chairRows: seating.filter((i) => i.kind === "row").length,
    chairs: seating.reduce((t, i) => t + (i.seats ?? 0), 0),
    rows: group(seating, true),
    zones: group(items.filter((i) => !isTable(i) && i.kind !== "label" && i.kind !== "wall"), false),
  };
}

export interface InventoryRow {
  item: string;
  size: string;
  qty: number;
  note?: string;
}

/** tablecloth to the floor: the table plus a 0.76 m drop each side, rounded up to the next 0.1 m */
const cloth = (n: number) => Math.ceil((n + 1.52) * 10) / 10;

/** the rental and décor list for a plan, in the order a vendor reads it */
export function inventory(l: VenueLayout | undefined): InventoryRow[] {
  const items = l?.items ?? [];
  const out: InventoryRow[] = [];
  const counts = planCounts(l);
  if (counts.chairs) out.push({ item: "Chairs", size: "Banquet / Chiavari", qty: counts.chairs, note: `${counts.tables} tables, ${counts.chairRows} chair rows` });
  const tables = group(items.filter((i) => i.kind === "round" || i.kind === "rect"), false);
  for (const t of tables) out.push({ item: t.label, size: t.size, qty: t.count });
  // linens and centrepieces follow the tables
  const rounds = items.filter((i) => i.kind === "round");
  const rects = items.filter((i) => i.kind === "rect");
  for (const g of group(rounds, false)) {
    const d = Number(g.size.replace(/[^\d.]/g, ""));
    out.push({ item: "Round tablecloth", size: `Ø ${m(cloth(d))} m`, qty: g.count, note: "to the floor" });
  }
  for (const g of group(rects, false)) {
    const [w, h] = g.size.replace(" m", "").split(" × ").map(Number);
    out.push({ item: "Long tablecloth", size: `${m(cloth(w))} × ${m(cloth(h))} m`, qty: g.count, note: "to the floor" });
    out.push({ item: "Table runner", size: `${m(w + 0.6)} m long`, qty: g.count });
  }
  if (rounds.length) out.push({ item: "Centrepiece", size: "per round table", qty: rounds.length });
  // the rest, one line per item and size
  const extra: Partial<Record<LayoutKind, string>> = { aisle: "runner carpet", dance: "floor panels", stage: "platform with steps and skirt", mandap: "with pillars and canopy" };
  for (const z of group(items.filter((i) => !isTable(i) && i.kind !== "label" && i.kind !== "wall"), false)) {
    const [w, h] = z.size.startsWith("Ø") ? [0, 0] : z.size.replace(" m", "").split(" × ").map(Number);
    const area = w && h ? `${m(w * h)} m²` : "";
    out.push({ item: z.label, size: z.kind === "dance" && area ? `${z.size} (${area})` : z.size, qty: z.count, ...(extra[z.kind] ? { note: extra[z.kind] } : {}) });
  }
  return out;
}

/** every chosen table (round, long, chair row) set to n chairs, within each kind's maximum */
export function setSeatsFor(items: LayoutItem[], ids: string[], n: number): LayoutItem[] {
  const pick = new Set(ids);
  return items.map((i) => (pick.has(i.id) && isTable(i) ? { ...i, seats: Math.max(1, Math.min(SEATS_MAX[i.kind] ?? 24, Math.round(n))) } : i));
}

/**
 * Spreads `target` guests over the chosen tables as evenly as their maximums allow (earlier tables get the extra
 * chair). Returns the items and how many guests didn't fit.
 */
export function fitSeats(items: LayoutItem[], ids: string[], target: number): { items: LayoutItem[]; short: number } {
  const tables = items.filter((i) => ids.includes(i.id) && isTable(i));
  if (!tables.length) return { items, short: Math.max(0, target) };
  const want = new Map(tables.map((t) => [t.id, 0]));
  let left = Math.max(0, Math.round(target));
  // round-robin, one chair at a time, skipping full tables
  while (left > 0) {
    let placed = false;
    for (const t of tables) {
      if (!left) break;
      const cur = want.get(t.id)!;
      if (cur < (SEATS_MAX[t.kind] ?? 24)) {
        want.set(t.id, cur + 1);
        left--;
        placed = true;
      }
    }
    if (!placed) break;
  }
  return { items: items.map((i) => (want.has(i.id) ? { ...i, seats: Math.max(1, want.get(i.id)!) } : i)), short: left };
}
