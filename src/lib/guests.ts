// Guest count: per-guest quantities and the venue capacity check.
import type { Line, Proposal, Venue } from "../types";
import { largestCapacity } from "./venues";

/** ⌈guests × perGuest⌉, never below zero. A factor like 0.1 means one per ten guests. */
export function guestQty(guests: number, perGuest: number): number {
  return Math.max(0, Math.ceil(guests * perGuest - 1e-9));
}

/** Lines that follow the guest count get the new quantity; the rest are untouched. */
export function applyGuests(lines: Line[], guests: number | null | undefined): Line[] {
  if (!guests || guests <= 0) return lines;
  let changed = false;
  const next = lines.map((l) => {
    if (!l.perGuest) return l;
    const qty = guestQty(guests, l.perGuest);
    if (qty === l.qty) return l;
    changed = true;
    return { ...l, qty };
  });
  return changed ? next : lines;
}

/** The directory venue matching the typed name (as step one matches it), with its largest capacity. */
export function venueCapacity(venues: Venue[], name: string): { venue: Venue; capacity?: number } | null {
  const v = venues.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
  return v ? { venue: v, capacity: largestCapacity(v) } : null;
}

/** A warning when more guests are expected than the venue's largest space holds, else null. */
export function capacityWarning(p: Pick<Proposal, "client">, venues: Venue[]): string | null {
  const guests = p.client.guests;
  if (!guests || !p.client.venue) return null;
  const match = venueCapacity(venues, p.client.venue);
  if (!match?.capacity || guests <= match.capacity) return null;
  return `${guests.toLocaleString("en-IN")} guests is more than ${match.venue.name} holds: its largest space takes up to ${match.capacity.toLocaleString("en-IN")}. Check the space, or split the functions.`;
}
