// The functions of a multi-function celebration (Haldi, Mehendi, Muhurtham, Reception…). A proposal without
// functions is one list, as it always was; with them, every line belongs to one, and each gets a subtotal.
import type { EventFunction, Line, Proposal } from "../types";
import { formatDate } from "./format";

export const FUNCTION_PRESETS = ["Engagement", "Haldi", "Mehendi", "Sangeet", "Muhurtham", "Wedding", "Nikah", "Reception"];

export const functionsOf = (p: Pick<Proposal, "functions">): EventFunction[] => (p.functions ?? []).filter((f) => f && f.id);

/** The function a line belongs to: its own if it still exists, else the first one; null when there are none. */
export function fnOf(p: Pick<Proposal, "functions">, l: Pick<Line, "fn">): string | null {
  const fs = functionsOf(p);
  if (!fs.length) return null;
  return l.fn && fs.some((f) => f.id === l.fn) ? l.fn : fs[0].id;
}

/**
 * Lines split by function, in the functions' order. Without functions there is one group with fn = null.
 * `skipEmpty` leaves out functions with no lines (the outputs do; the Builder shows them).
 */
export function byFunction(p: Pick<Proposal, "functions">, lines: Line[], skipEmpty = false): { fn: EventFunction | null; lines: Line[] }[] {
  const fs = functionsOf(p);
  if (!fs.length) return [{ fn: null, lines }];
  const groups = fs.map((f) => ({ fn: f as EventFunction | null, lines: lines.filter((l) => fnOf(p, l) === f.id) }));
  return skipEmpty ? groups.filter((g) => g.lines.length) : groups;
}

/** "Haldi — 12th February 2027", or just "Haldi" while the date isn't fixed. */
export const functionHeading = (f: EventFunction) => (f.date ? `${f.label} — ${formatDate(f.date)}` : f.label);

/** Removing a function moves its lines to the first remaining one (or out of functions altogether). */
export function removeFunction(p: Proposal, id: string): Pick<Proposal, "functions" | "lines"> {
  const functions = functionsOf(p).filter((f) => f.id !== id);
  const to = functions[0]?.id;
  return { functions, lines: p.lines.map((l) => (fnOf(p, l) === id ? { ...l, fn: to } : l)) };
}
