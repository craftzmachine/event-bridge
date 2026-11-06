// Who to get back to, and why: built from each proposal's status, its private link's activity and its payments.
// Pure, so the rules are tested in Node.
import type { Brand, Proposal } from "../types";
import { proposalStatus } from "./status";
import { shareFor, type Share } from "./shares";
import { dueItems } from "./payments";
import { eventDates } from "./proposal";
import { formatDate, formatINR, todayISO } from "./format";

const DAY = 86_400_000;

export type FollowUpKind = "changes" | "overdue" | "eventSoon" | "expiring" | "noAnswer" | "unopened";

export interface FollowUp {
  key: string;
  kind: FollowUpKind;
  proposalId: string;
  client: string;
  /** what to do, in a few words */
  title: string;
  /** why, with the dates */
  detail: string;
  /** the client's number, for "Send on WhatsApp" */
  contact: string;
}

/** Most pressing first: the client asked for something, money is late, the event is close, the link is ending. */
const ORDER: FollowUpKind[] = ["changes", "overdue", "eventSoon", "expiring", "noAnswer", "unopened"];

const days = (ms: number) => Math.max(1, Math.round(ms / DAY));
const ago = (ms: number) => (days(ms) === 1 ? "yesterday" : `${days(ms)} days ago`);

export function followUps(list: Proposal[], shares: Share[], brand: Brand, now = Date.now()): FollowUp[] {
  const today = todayISO(new Date(now));
  const out: FollowUp[] = [];
  for (const p of list) {
    const status = proposalStatus(p);
    if (status === "lost") continue;
    const client = p.client.name || "Untitled client";
    const base = { proposalId: p.id, client, contact: p.client.contact };
    const add = (kind: FollowUpKind, title: string, detail: string) => out.push({ ...base, key: `${p.id}:${kind}`, kind, title, detail });
    const s = status === "sent" ? shareFor(p, shares) : undefined;

    if (s && !s.expired) {
      if (s.decision?.kind === "changes")
        add("changes", "Revise the proposal", `Asked for changes ${ago(now - s.decision.at)}${s.decision.comment ? `: “${s.decision.comment.slice(0, 120)}${s.decision.comment.length > 120 ? "…" : ""}”` : "."}`);
      else if (!s.decision && s.views === 0 && now - s.createdAt >= 2 * DAY)
        add("unopened", "Check they received the link", `Shared ${ago(now - s.createdAt)} and not opened yet.`);
      else if (!s.decision && s.views > 0 && s.lastViewedAt && now - s.lastViewedAt >= 3 * DAY)
        add("noAnswer", "Ask what they think", `Opened ${s.views} time${s.views === 1 ? "" : "s"}, last ${ago(now - s.lastViewedAt)}, with no answer.`);
      if (!s.decision && s.expiresAt - now <= 3 * DAY)
        add("expiring", "The link is about to end", `It stops working on ${formatDate(todayISO(new Date(s.expiresAt)))}. Extend it with a new link if they need more time.`);
    }

    const next = eventDates(p).find((d) => d >= today);
    if (status === "sent" && next && new Date(`${next}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime() <= 14 * DAY)
      add("eventSoon", "The event is close and it isn't confirmed", `${formatDate(next)}, and the proposal is still only sent.`);

    if (status === "accepted")
      for (const m of dueItems(p, brand, today).filter((x) => x.state === "overdue"))
        add("overdue", "Payment overdue", `${m.label}: ${formatINR(m.outstanding)} was due on ${formatDate(m.due)}.`);
  }
  return out.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}
