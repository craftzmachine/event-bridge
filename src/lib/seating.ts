// Who sits where at one function: each table's seats hold a person ("<guest id>:<n>", the nth person of a household)
// or null. Pure, so seating.test.ts runs it in Node; the board is src/components/SeatingBoard.tsx.
import type { Guest, LayoutItem, Proposal, VenueLayout } from "../types";
import { comingCount, invitedTo, listOf, statusOf } from "./guestList";
import { isTable } from "./layout";

export type Plan = Record<string, (string | null)[]>;

export interface Person {
  key: string;
  guestId: string;
  name: string;
  side: Guest["side"];
  group?: string;
}

export interface Household {
  guest: Guest;
  people: Person[];
  /** "yes" when they've confirmed; otherwise seated ahead of their reply */
  confirmed: boolean;
}

export const personKey = (guestId: string, n: number) => `${guestId}:${n}`;
export const guestOf = (key: string) => key.slice(0, key.lastIndexOf(":"));

export const tablesOf = (l: VenueLayout | undefined): LayoutItem[] => (l?.items ?? []).filter((i) => isTable(i) && (i.seats ?? 0) > 0);

/**
 * The households to seat at a function: those who said yes (with how many), plus, when asked, those who haven't
 * answered or said maybe (with their full party). Nobody who said no.
 */
export function householdsFor(p: Proposal, fnId: string, includeUnconfirmed: boolean): Household[] {
  const out: Household[] = [];
  for (const g of listOf(p).guests) {
    if (!invitedTo(p, g).includes(fnId)) continue;
    const st = statusOf(g, fnId);
    if (st === "no") continue;
    const confirmed = st === "yes";
    if (!confirmed && !includeUnconfirmed) continue;
    const n = confirmed ? comingCount(g, fnId) : g.invited;
    const people = Array.from({ length: n }, (_, i) => ({ key: personKey(g.id, i), guestId: g.id, name: n > 1 ? `${g.name} (${i + 1})` : g.name, side: g.side, group: g.group }));
    out.push({ guest: g, people, confirmed });
  }
  return out;
}

/** The saved plan fitted to the tables as they are now; people on removed tables or lost seats are let go. */
export function normalise(raw: Plan | undefined, tables: LayoutItem[]): { plan: Plan; displaced: string[] } {
  const plan: Plan = {};
  const displaced: string[] = [];
  const seen = new Set<string>();
  for (const t of tables) {
    const seats = Array.from({ length: t.seats ?? 0 }, (_, i) => {
      const k = raw?.[t.id]?.[i] ?? null;
      if (!k || seen.has(k)) return null;
      seen.add(k);
      return k;
    });
    plan[t.id] = seats;
    raw?.[t.id]?.slice(t.seats ?? 0).forEach((k) => k && !seen.has(k) && displaced.push(k));
  }
  for (const [id, seats] of Object.entries(raw ?? {})) if (!plan[id]) seats.forEach((k) => k && !seen.has(k) && displaced.push(k));
  return { plan, displaced };
}

export const seatedKeys = (plan: Plan) => new Set(Object.values(plan).flat().filter((k): k is string => !!k));
export const freeSeats = (plan: Plan, tableId: string) => (plan[tableId] ?? []).filter((k) => !k).length;
export const tableOf = (plan: Plan, key: string) => Object.keys(plan).find((t) => plan[t].includes(key));

export function unseat(plan: Plan, keys: string[]): Plan {
  const drop = new Set(keys);
  return Object.fromEntries(Object.entries(plan).map(([t, s]) => [t, s.map((k) => (k && drop.has(k) ? null : k))]));
}

/**
 * Seats people at a table, starting at `seat` (or the first free seat) and filling free seats round the table.
 * Anyone already elsewhere moves. Returns null when the table hasn't room for all of them.
 */
export function seatAt(plan: Plan, tableId: string, keys: string[], seat?: number): Plan | null {
  const cleared = unseat(plan, keys);
  const seats = [...(cleared[tableId] ?? [])];
  if (seats.filter((k) => !k).length < keys.length) return null;
  const order = seats.map((_, i) => ((seat ?? 0) + i) % seats.length);
  let n = 0;
  for (const i of order) {
    if (n >= keys.length) break;
    if (!seats[i]) seats[i] = keys[n++];
  }
  return { ...cleared, [tableId]: seats };
}

/**
 * Fills empty seats with everyone not yet seated, a household at a time: largest households first, each at a table
 * that already has their group (or side) when one has room, else the emptiest table; a household is split across
 * tables only when no table can take it whole.
 */
export function autoSeat(plan: Plan, tables: LayoutItem[], households: Household[]): { plan: Plan; left: number } {
  let next = { ...plan };
  const seated = seatedKeys(next);
  const todo = households
    .map((h) => ({ h, people: h.people.filter((x) => !seated.has(x.key)) }))
    .filter((x) => x.people.length)
    .sort((a, b) => (a.h.guest.group ?? "").localeCompare(b.h.guest.group ?? "") || a.h.guest.side.localeCompare(b.h.guest.side) || b.people.length - a.people.length);
  const groupAt = new Map<string, Set<string>>();
  const note = (t: string, h: Household) => {
    const s = groupAt.get(t) ?? new Set();
    s.add(`g:${h.guest.group ?? ""}`);
    s.add(`s:${h.guest.side}`);
    groupAt.set(t, s);
  };
  for (const t of tables) for (const k of next[t.id] ?? []) if (k) {
    const h = households.find((x) => x.guest.id === guestOf(k));
    if (h) note(t.id, h);
  }
  let left = 0;
  for (const { h, people } of todo) {
    const fits = tables.filter((t) => freeSeats(next, t.id) >= people.length);
    const score = (t: LayoutItem) => {
      const s = groupAt.get(t.id);
      return (h.guest.group && s?.has(`g:${h.guest.group}`) ? 4 : 0) + (h.guest.side && s?.has(`s:${h.guest.side}`) ? 2 : 0) + (s ? 0 : 1);
    };
    const best = fits.sort((a, b) => score(b) - score(a) || freeSeats(next, a.id) - freeSeats(next, b.id))[0];
    if (best) {
      next = seatAt(next, best.id, people.map((x) => x.key))!;
      note(best.id, h);
      continue;
    }
    // no single table has room: spread them over the tables with the most free seats
    let rest = people.map((x) => x.key);
    for (const t of [...tables].sort((a, b) => freeSeats(next, b.id) - freeSeats(next, a.id))) {
      const n = Math.min(freeSeats(next, t.id), rest.length);
      if (!n) continue;
      next = seatAt(next, t.id, rest.slice(0, n))!;
      note(t.id, h);
      rest = rest.slice(n);
      if (!rest.length) break;
    }
    left += rest.length;
  }
  return { plan: next, left };
}

export interface SeatingIssue {
  kind: "not-coming" | "split" | "displaced";
  text: string;
}

/** What needs the planner's eye: seated people who no longer come, households split over tables, people who lost a seat. */
export function issues(p: Proposal, fnId: string, plan: Plan, displaced: string[]): SeatingIssue[] {
  const out: SeatingIssue[] = [];
  const guests = new Map(listOf(p).guests.map((g) => [g.id, g]));
  const byGuest = new Map<string, Set<string>>();
  for (const [t, seats] of Object.entries(plan))
    for (const k of seats) if (k) {
      const s = byGuest.get(guestOf(k)) ?? new Set();
      s.add(t);
      byGuest.set(guestOf(k), s);
    }
  for (const [gid, ts] of byGuest) {
    const g = guests.get(gid);
    const seatedN = [...ts].reduce((n, t) => n + plan[t].filter((k) => k && guestOf(k) === gid).length, 0);
    if (!g || statusOf(g, fnId) === "no" || !invitedTo(p, g).includes(fnId)) out.push({ kind: "not-coming", text: `${g?.name ?? "A removed guest"} is seated but isn't coming.` });
    else if (statusOf(g, fnId) === "yes" && seatedN > comingCount(g, fnId)) out.push({ kind: "not-coming", text: `${g.name}: ${seatedN} seated, ${comingCount(g, fnId)} coming.` });
    if (g && ts.size > 1) out.push({ kind: "split", text: `${g.name} are split over ${ts.size} tables.` });
  }
  const lost = new Set(displaced.map(guestOf));
  for (const gid of lost) out.push({ kind: "displaced", text: `${guests.get(gid)?.name ?? "Someone"} lost their seat when a table changed.` });
  return out;
}

/** a plan with people who can't be seated any more (no longer coming, or beyond their count) taken off */
export function tidy(p: Proposal, fnId: string, plan: Plan): Plan {
  const guests = new Map(listOf(p).guests.map((g) => [g.id, g]));
  const drop: string[] = [];
  for (const seats of Object.values(plan))
    for (const k of seats) {
      if (!k) continue;
      const g = guests.get(guestOf(k));
      const n = Number(k.slice(k.lastIndexOf(":") + 1));
      const allowed = !g || !invitedTo(p, g).includes(fnId) || statusOf(g, fnId) === "no" ? 0 : statusOf(g, fnId) === "yes" ? comingCount(g, fnId) : g.invited;
      if (n >= allowed) drop.push(k);
    }
  return drop.length ? unseat(plan, drop) : plan;
}
