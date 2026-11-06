import type { Proposal, ProposalStatus } from "../types";
import { computeTotals } from "./totals";

export const STATUSES: { id: ProposalStatus; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "sent", label: "Sent" },
  { id: "accepted", label: "Accepted" },
  { id: "lost", label: "Lost" },
];

const KNOWN = new Set(STATUSES.map((s) => s.id));

/** Drafts saved before statuses existed, or with an unknown value, count as drafts. */
export function proposalStatus(p: Pick<Proposal, "status">): ProposalStatus {
  return p.status && KNOWN.has(p.status) ? p.status : "draft";
}

export const statusLabel = (s: ProposalStatus) => STATUSES.find((x) => x.id === s)!.label;

/** The patch for a status change: `sentAt` is set the first time it leaves draft and kept after that. */
export function statusPatch(p: Pick<Proposal, "sentAt">, status: ProposalStatus, now = new Date()): Pick<Proposal, "status" | "statusAt" | "sentAt"> {
  const at = now.toISOString();
  return { status, statusAt: at, sentAt: status === "draft" ? p.sentAt : p.sentAt ?? at };
}

/** True when an ISO timestamp falls in the same local calendar month as `now`. */
export function inMonth(iso: string | undefined, now: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !isNaN(d.getTime()) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export interface PipelineSummary {
  sent: { count: number; value: number };
  accepted: { count: number; value: number };
  /** accepted ÷ (accepted + lost), across all time; null until something is accepted or lost */
  winRate: number | null;
}

/**
 * This month's figures for the Studio home: what went to clients (by when it was first sent)
 * and what was accepted (by when it was accepted). Values are each proposal's Grand Total.
 */
export function pipelineSummary(list: Proposal[], gstPct: number, now = new Date()): PipelineSummary {
  const value = (p: Proposal) => computeTotals(p, gstPct).grandTotal;
  const sent = list.filter((p) => proposalStatus(p) !== "draft" && inMonth(p.sentAt, now));
  const accepted = list.filter((p) => proposalStatus(p) === "accepted" && inMonth(p.statusAt, now));
  const won = list.filter((p) => proposalStatus(p) === "accepted").length;
  const lost = list.filter((p) => proposalStatus(p) === "lost").length;
  return {
    sent: { count: sent.length, value: sent.reduce((s, p) => s + value(p), 0) },
    accepted: { count: accepted.length, value: accepted.reduce((s, p) => s + value(p), 0) },
    winRate: won + lost ? won / (won + lost) : null,
  };
}

/** Case- and accent-insensitive match on the client's name, the reference and the venue. */
export function matchesSearch(p: Proposal, query: string): boolean {
  const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = fold(query.trim());
  if (!q) return true;
  return [p.client.name, p.ref, p.client.venue, p.client.location].some((f) => f && fold(f).includes(q));
}
