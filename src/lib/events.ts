// The Events list and its countdowns: which proposals count as events (accepted ones, and anything dated that isn't
// lost), whether each is coming up or past, and "in 12 days". Pure, so it's tested in Node.
import type { Proposal } from "../types";
import { eventDates } from "./proposal";
import { proposalStatus } from "./status";

export type EventsTab = "upcoming" | "past" | "all";

const dayNo = (iso: string) => Math.round(new Date(`${iso}T00:00:00`).getTime() / 86_400_000);

/** Days from today to the first event date (negative once it's passed); null while there's no date. */
export function daysUntil(p: Pick<Proposal, "client">, today: string): number | null {
  const first = eventDates(p as Proposal)[0];
  return first ? dayNo(first) - dayNo(today) : null;
}

/** "Today", "Tomorrow", "In 12 days", "On now" (between the first and last date), "3 days ago", "Date to be confirmed" */
export function countdown(p: Pick<Proposal, "client">, today: string): string {
  const dates = eventDates(p as Proposal);
  if (!dates.length) return "Date to be confirmed";
  const d = dayNo(dates[0]) - dayNo(today);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d > 1) return `In ${d} days`;
  const last = dayNo(dates[dates.length - 1]) - dayNo(today);
  if (last >= 0) return "On now";
  return -last === 1 ? "Yesterday" : `${-last} days ago`;
}

/** Past once the last event date has gone by. */
export const isPast = (p: Pick<Proposal, "client">, today: string) => {
  const dates = eventDates(p as Proposal);
  return dates.length > 0 && dates[dates.length - 1] < today;
};

/**
 * The events on the Events page: accepted proposals and any dated proposal still in play (not lost; "all" shows
 * lost ones too). Upcoming soonest first with undated ones last; past most recent first.
 */
export function eventsFor(list: Proposal[], tab: EventsTab, today: string): Proposal[] {
  const inPlay = list.filter((p) => {
    const s = proposalStatus(p);
    if (s === "lost") return tab === "all" && eventDates(p).length > 0;
    return s === "accepted" || eventDates(p).length > 0;
  });
  const first = (p: Proposal) => eventDates(p)[0] ?? "9999";
  if (tab === "past") return inPlay.filter((p) => isPast(p, today)).sort((a, b) => first(b).localeCompare(first(a)));
  const shown = tab === "upcoming" ? inPlay.filter((p) => !isPast(p, today)) : inPlay;
  return shown.sort((a, b) => first(a).localeCompare(first(b)) || (a.client.name || "").localeCompare(b.client.name || ""));
}
