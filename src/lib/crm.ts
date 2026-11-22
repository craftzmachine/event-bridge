// The CRM: enquiries (leads) from first contact to booking, with an activity log and follow-up dates, turned into
// proposals when they're ready, and the clients behind this device's proposals. Pure, so it's tested in Node.
import type { Brand, Proposal } from "../types";
import { newProposal } from "../state/proposals";
import { computeTotals } from "./totals";
import { eventDates } from "./proposal";
import { proposalStatus } from "./status";
import { waNumber } from "./whatsapp";

export type LeadStage = "new" | "contacted" | "meeting" | "proposal" | "won" | "lost";

export const STAGES: { id: LeadStage; label: string }[] = [
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "meeting", label: "Meeting" },
  { id: "proposal", label: "Proposal sent" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
];

export const SOURCES = [
  { id: "instagram", label: "Instagram" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "referral", label: "Referral" },
  { id: "website", label: "Website" },
  { id: "venue", label: "Venue partner" },
  { id: "walk-in", label: "Walk-in" },
  { id: "other", label: "Other" },
];

export interface LeadActivity {
  at: string;
  by: string;
  kind: "call" | "meeting" | "whatsapp" | "note" | "stage";
  text: string;
}

export interface Lead {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  source: string;
  eventType?: string | null;
  /** YYYY-MM-DD, sorted */
  dates: string[];
  guests?: number | null;
  budget?: number | null;
  venue?: string;
  stage: LeadStage;
  lostReason?: string;
  /** YYYY-MM-DD: when to get back to them */
  followUp?: string;
  notes?: string;
  /** the proposal made from this lead */
  proposalId?: string;
  activity: LeadActivity[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export const isLead = (x: unknown): x is Lead => {
  const l = x as Lead;
  return !!l && typeof l === "object" && typeof l.id === "string" && typeof l.name === "string" && STAGES.some((s) => s.id === l.stage) && Array.isArray(l.activity) && Array.isArray(l.dates);
};

export const stageLabel = (s: LeadStage) => STAGES.find((x) => x.id === s)?.label ?? s;
export const sourceLabel = (s: string) => SOURCES.find((x) => x.id === s)?.label ?? s;
export const isOpen = (l: Pick<Lead, "stage">) => l.stage !== "won" && l.stage !== "lost";

/** Moving a lead to another stage, recorded in its log; leaving Lost clears the reason. */
export function moveStage(l: Lead, stage: LeadStage, by: string, now = new Date(), reason?: string): Lead {
  if (l.stage === stage) return l;
  const at = now.toISOString();
  const text = `${stageLabel(l.stage)} → ${stageLabel(stage)}${stage === "lost" && reason?.trim() ? `: ${reason.trim()}` : ""}`;
  return {
    ...l,
    stage,
    lostReason: stage === "lost" ? reason?.trim() || undefined : undefined,
    updatedAt: at,
    activity: [...l.activity, { at, by, kind: "stage", text }],
  };
}

/** A call, meeting, WhatsApp or note in the lead's log, optionally setting the next follow-up. */
export function logActivity(l: Lead, kind: LeadActivity["kind"], text: string, by: string, now = new Date(), followUp?: string): Lead {
  const at = now.toISOString();
  return {
    ...l,
    updatedAt: at,
    followUp: followUp ?? l.followUp,
    activity: [...l.activity, { at, by, kind, text: text.trim() }],
  };
}

/** Open leads whose follow-up date has come, oldest first. */
export function followUpsDue(leads: Lead[], today: string): Lead[] {
  return leads.filter((l) => isOpen(l) && l.followUp && l.followUp <= today).sort((a, b) => (a.followUp ?? "").localeCompare(b.followUp ?? ""));
}

/** A new proposal with what the lead already told us: name, number, dates, guests, budget and venue. */
export function leadToProposal(l: Lead, brand: Brand, takenRefs: Iterable<string>): Proposal {
  const p = newProposal(brand, takenRefs, l.venue ? { venue: l.venue, location: "" } : undefined);
  const dates = [...l.dates].sort();
  return {
    ...p,
    eventType: l.eventType ?? null,
    client: { ...p.client, name: l.name.trim(), contact: l.phone?.trim() || l.email?.trim() || "", dates, date: dates[0] ?? "", guests: l.guests ?? null, budget: l.budget ?? null },
  };
}

/**
 * Leads follow their proposals: once a lead's proposal is sent it's at Proposal sent, and accepted or lost
 * proposals make it Won or Lost. Returns only the leads that changed.
 */
export function syncWithProposals(leads: Lead[], proposals: Proposal[], by: string, now = new Date()): Lead[] {
  const out: Lead[] = [];
  for (const l of leads) {
    const p = l.proposalId ? proposals.find((x) => x.id === l.proposalId) : undefined;
    if (!p) continue;
    const s = proposalStatus(p);
    const want: LeadStage | null = s === "accepted" ? "won" : s === "lost" ? "lost" : s === "sent" && (l.stage === "new" || l.stage === "contacted" || l.stage === "meeting") ? "proposal" : null;
    if (want && want !== l.stage) out.push(moveStage(l, want, by, now, want === "lost" ? "Proposal marked lost" : undefined));
  }
  return out;
}

export interface Client {
  key: string;
  name: string;
  contact: string;
  proposals: Proposal[];
  /** accepted proposals' Grand Totals */
  booked: number;
  /** the latest event date across their proposals */
  lastDate?: string;
}

/** Everyone behind this device's proposals, one row per person (matched by mobile number, else by name). */
export function clientsFrom(proposals: Proposal[], gstPct: number): Client[] {
  const m = new Map<string, Client>();
  for (const p of proposals) {
    const name = p.client.name.trim();
    if (!name && !p.client.contact.trim()) continue;
    const key = waNumber(p.client.contact) ?? `n:${name.toLowerCase().replace(/\s+/g, " ")}`;
    const c = m.get(key) ?? { key, name: name || p.client.contact, contact: p.client.contact, proposals: [], booked: 0 };
    c.proposals.push(p);
    if (proposalStatus(p) === "accepted") c.booked += computeTotals(p, gstPct).grandTotal;
    const last = eventDates(p).at(-1);
    if (last && (!c.lastDate || last > c.lastDate)) c.lastDate = last;
    m.set(key, c);
  }
  return [...m.values()].sort((a, b) => (b.lastDate ?? "").localeCompare(a.lastDate ?? "") || a.name.localeCompare(b.name));
}

const fold = (s: string | undefined) => (s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function searchLeads(leads: Lead[], q: string): Lead[] {
  const f = fold(q.trim());
  return leads
    .filter((l) => !f || [l.name, l.phone, l.email, l.venue, l.notes].some((x) => fold(x).includes(f)))
    .sort((a, b) => (a.followUp ?? "9").localeCompare(b.followUp ?? "9") || b.updatedAt.localeCompare(a.updatedAt));
}
