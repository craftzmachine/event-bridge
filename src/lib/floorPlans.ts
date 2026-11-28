// Standalone floor plans: a venue layout and a simple guest list that don't belong to any wedding (sales mock-ups,
// venue plans, practice). The same editor is used as for weddings, through asProposal / fromProposal, which present a
// plan in the proposal shape the Layout and Seating tabs already take. Pure, so floorPlans.test.ts checks it.
import type { Guest, Proposal, VenueLayout } from "../types";
import { cloneItems } from "./layout";
import { guestCode } from "./guestList";

export interface FloorPlan {
  id: string;
  name: string;
  venue: string;
  notes: string;
  /** expected guests, for starters and the "seat N guests" tool */
  expected: number | null;
  /** households to seat; everyone counts as coming */
  guests: Guest[];
  layout?: VenueLayout;
  /** table item id → guest key per seat, as in Proposal.seating */
  seating?: Record<string, (string | null)[]>;
  createdAt: string;
  updatedAt: string;
}

export const FLOOR_PLANS_FORMAT = "event-bridge.floor-plans";
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function isFloorPlan(x: unknown): x is FloorPlan {
  const p = x as FloorPlan;
  return !!p && typeof p.id === "string" && typeof p.name === "string" && Array.isArray(p.guests) && (p.layout === undefined || (typeof p.layout === "object" && Array.isArray(p.layout.items)));
}

export function newPlan(name: string, venue = "", expected: number | null = null, now = new Date().toISOString()): FloorPlan {
  return { id: uid(), name: name.trim() || "Untitled plan", venue: venue.trim(), notes: "", expected, guests: [], createdAt: now, updatedAt: now };
}

/** a plan shown in the shape the wedding editor uses: one function (""), every household confirmed */
export function asProposal(plan: FloorPlan): Proposal {
  return {
    id: plan.id,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    client: { name: plan.name, contact: "", date: "", venue: plan.venue, location: "", guests: plan.expected },
    ref: "",
    eventType: null,
    style: null,
    lines: [],
    coordinationPct: 0,
    grandTotal: null,
    terms: [],
    notes: plan.notes,
    guestList: {
      guests: plan.guests.map((g) => ({ ...g, fns: [""], reply: { "": { status: "yes" as const, count: g.invited } } })),
    },
    ...(plan.layout ? { layouts: { "": plan.layout } } : {}),
    ...(plan.seating ? { seating: { "": plan.seating } } : {}),
  };
}

/** what the editor changed, written back onto the plan */
export function fromProposal(plan: FloorPlan, p: Proposal, now = new Date().toISOString()): FloorPlan {
  return {
    ...plan,
    name: p.client.name || plan.name,
    expected: p.client.guests ?? plan.expected,
    guests: (p.guestList?.guests ?? []).map(({ reply: _r, repliedAt: _a, ...g }) => ({ ...g, fns: [""] })),
    layout: p.layouts?.[""],
    seating: p.seating?.[""],
    updatedAt: now,
  };
}

/** a copy with new ids for the plan, its items and its guests (seating follows the new ids) */
export function duplicatePlan(plan: FloorPlan, now = new Date().toISOString()): FloorPlan {
  const items = plan.layout ? cloneItems(plan.layout.items) : [];
  const itemIds = new Map(plan.layout?.items.map((it, i) => [it.id, items[i].id]) ?? []);
  const guestIds = new Map(plan.guests.map((g) => [g.id, uid()]));
  const seating = plan.seating
    ? Object.fromEntries(
        Object.entries(plan.seating)
          .filter(([t]) => itemIds.has(t))
          .map(([t, seats]) => [itemIds.get(t)!, seats.map((k) => (k ? `${guestIds.get(k.slice(0, k.lastIndexOf(":"))) ?? ""}${k.slice(k.lastIndexOf(":"))}` : null))]),
      )
    : undefined;
  return {
    ...plan,
    id: uid(),
    name: `${plan.name} (copy)`,
    guests: plan.guests.map((g) => ({ ...g, id: guestIds.get(g.id)!, code: guestCode() })),
    ...(plan.layout ? { layout: { ...plan.layout, items } } : {}),
    ...(seating ? { seating } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

/** the plan's layout put on a wedding's function (fresh item ids; the wedding's own guests are seated there) */
export function copyIntoWedding(plan: FloorPlan, p: Proposal, fnId: string): Proposal {
  if (!plan.layout) return p;
  const seating = { ...(p.seating ?? {}) };
  delete seating[fnId];
  return { ...p, layouts: { ...(p.layouts ?? {}), [fnId]: { ...plan.layout, items: cloneItems(plan.layout.items) } }, seating };
}

/** a wedding function's layout saved as a standalone plan, without the family's guests */
export function planFromWedding(p: Proposal, fnId: string, label: string, now = new Date().toISOString()): FloorPlan | null {
  const l = p.layouts?.[fnId];
  if (!l) return null;
  return { ...newPlan(`${p.client.name || "Wedding"}${label ? ` · ${label}` : ""}`, p.client.venue, p.client.guests ?? null, now), layout: { ...l, items: cloneItems(l.items) } };
}
