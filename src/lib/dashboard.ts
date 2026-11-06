// The team dashboard's figures, from this device's proposals. Pure, so they're tested in Node.
import type { Brand, Catalog, Proposal, ProposalStatus, Venue } from "../types";
import { computeTotals } from "./totals";
import { inMonth, pipelineSummary, proposalStatus, STATUSES } from "./status";
import { eventDates, proposalTitle } from "./proposal";
import { functionsOf } from "./functions";
import { capacityWarning } from "./guests";
import { dueItems, schedule } from "./payments";
import { marginOf } from "./margin";
import { todayISO } from "./format";

const value = (p: Proposal, gstPct: number) => computeTotals(p, gstPct).grandTotal;

/** This month and last month side by side. */
export function monthCompare(list: Proposal[], gstPct: number, now = new Date()) {
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  return { now: pipelineSummary(list, gstPct, now), last: pipelineSummary(list, gstPct, last), lastMonth: last };
}

/** Count and value at each status, in the order the work moves. */
export function pipeline(list: Proposal[], gstPct: number): { status: ProposalStatus; label: string; count: number; value: number }[] {
  return STATUSES.map((s) => {
    const at = list.filter((p) => proposalStatus(p) === s.id);
    return { status: s.id, label: s.label, count: at.length, value: at.reduce((t, p) => t + value(p, gstPct), 0) };
  });
}

export interface UpcomingEvent {
  key: string;
  date: string;
  /** the function's name, or the proposal's occasion */
  label: string;
  proposal: Proposal;
  status: ProposalStatus;
  capacity: string | null;
}

/** Every dated function (or event date) in the next `days` days, of proposals not lost. */
export function upcoming(list: Proposal[], catalog: Catalog, venues: Venue[], now = new Date(), days = 90): UpcomingEvent[] {
  const from = todayISO(now);
  const until = todayISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
  const out: UpcomingEvent[] = [];
  for (const p of list) {
    const status = proposalStatus(p);
    if (status === "lost") continue;
    const fs = functionsOf(p).filter((f) => f.date);
    const items = fs.length ? fs.map((f) => ({ date: f.date, label: f.label })) : eventDates(p).map((d) => ({ date: d, label: proposalTitle(p, catalog) || "Event" }));
    for (const it of items)
      if (it.date >= from && it.date <= until)
        out.push({ key: `${p.id}:${it.date}:${it.label}`, ...it, proposal: p, status, capacity: capacityWarning(p, venues) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
}

/** Overdue and soon-due milestones of accepted proposals, and what came in this month. */
export function paymentsOverview(list: Proposal[], brand: Brand, now = new Date()) {
  const today = todayISO(now);
  const accepted = list.filter((p) => proposalStatus(p) === "accepted");
  const due = accepted.flatMap((p) => dueItems(p, brand, today).map((m) => ({ ...m, proposal: p })));
  const received = list.flatMap((p) => (p.payments?.received ?? []).filter((x) => inMonth(`${x.date}T12:00:00`, now)));
  return {
    overdue: due.filter((m) => m.state === "overdue").sort((a, b) => a.due.localeCompare(b.due)),
    dueSoon: due.filter((m) => m.state === "due").sort((a, b) => a.due.localeCompare(b.due)),
    receivedThisMonth: received.reduce((t, x) => t + x.amount, 0),
    receivedCount: received.length,
    outstanding: accepted.reduce((t, p) => t + Math.max(0, schedule(p, brand, today).balance), 0),
  };
}

/** The margin across proposals accepted this month that have costs: total margin ÷ total quoted. */
export function marginThisMonth(list: Proposal[], gstPct: number, now = new Date()): { pct: number; count: number } | null {
  const ms = list
    .filter((p) => proposalStatus(p) === "accepted" && inMonth(p.statusAt, now))
    .map((p) => marginOf(p, gstPct))
    .filter((m) => m.costed > 0 && m.revenue > 0);
  if (!ms.length) return null;
  return { pct: ms.reduce((t, m) => t + m.margin, 0) / ms.reduce((t, m) => t + m.revenue, 0), count: ms.length };
}

/** Wins by occasion (style × event type), with how many were decided, for "what's selling". */
export function selling(list: Proposal[], catalog: Catalog, gstPct: number) {
  const rows = new Map<string, { label: string; won: number; decided: number; value: number }>();
  for (const p of list) {
    const status = proposalStatus(p);
    if (status !== "accepted" && status !== "lost") continue;
    const label = proposalTitle(p, catalog) || "Occasion not set";
    const r = rows.get(label) ?? { label, won: 0, decided: 0, value: 0 };
    r.decided++;
    if (status === "accepted") {
      r.won++;
      r.value += value(p, gstPct);
    }
    rows.set(label, r);
  }
  return [...rows.values()].sort((a, b) => b.value - a.value || b.won - a.won);
}
