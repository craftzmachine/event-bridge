// The client portal: what the family sees of their wedding behind their password link. The proposal page (no
// costs, as pageSnapshot cleans it), their own to-dos from the checklist, the payment schedule, and the
// questionnaires sent to them. server/portal.ts re-checks all of it. Pure, so it's tested in Node.
import type { Brand, Catalog, Proposal, Question } from "../types";
import type { ThemeId } from "../state/appearance";
import { pageSnapshot, type PageSnapshot } from "./proposalPage";
import { dueOf } from "./checklist";
import { schedule, type MilestoneState } from "./payments";
import { cleanAnswers } from "./questionnaires";
import { todayISO } from "./format";

/** keep in step with PORTAL_MAX_BYTES in server/portal.ts */
export const PORTAL_MAX_BYTES = 320 * 1024;

export type PortalAnswers = Record<string, { answers: Record<string, string | string[]>; at: number }>;

export interface PortalData {
  v: 1;
  page: PageSnapshot;
  /** the family's checklist tasks: what, by when, and where it stands */
  tasks: { title: string; due: string; state: "todo" | "doing" | "done" }[];
  payments: { total: number; received: number; milestones: { label: string; amount: number; due: string; state: MilestoneState }[] };
  questionnaires: { id: string; title: string; intro?: string; questions: Question[]; answers: Record<string, string | string[]> }[];
}

export function portalSnapshot(p: Proposal, catalog: Catalog, brand: Brand, theme: ThemeId, today = todayISO()): PortalData {
  const s = schedule(p, brand, today);
  return {
    v: 1,
    page: pageSnapshot(p, catalog, theme, today),
    tasks: (p.checklist ?? []).filter((i) => i.owner === "client").map((i) => ({ title: i.title, due: dueOf(i, p) ?? "", state: i.state })),
    payments: {
      total: s.total,
      received: s.received,
      milestones: s.milestones.map((m) => ({ label: m.label, amount: m.amount, due: m.due, state: m.state })),
    },
    questionnaires: (p.questionnaires ?? []).map((q) => ({ id: q.id, title: q.title, intro: q.intro, questions: q.questions, answers: q.answers })),
  };
}

export const portalBytes = (x: PortalData) => new TextEncoder().encode(JSON.stringify(x)).length;

/**
 * The family's answers from the portal, written onto the proposal's questionnaires when they're newer than what's
 * there. Returns the updated proposal, or null when nothing changed.
 */
export function mergePortalAnswers(p: Proposal, incoming: PortalAnswers | undefined): Proposal | null {
  if (!incoming || !p.questionnaires?.length) return null;
  let changed = false;
  const questionnaires = p.questionnaires.map((q) => {
    const a = incoming[q.id];
    if (!a || !Number.isFinite(a.at)) return q;
    const at = new Date(a.at).toISOString();
    if (q.answeredAt && q.answeredAt >= at) return q;
    changed = true;
    return { ...q, answers: cleanAnswers(q.questions, a.answers), answeredAt: at, answeredBy: "client" as const };
  });
  return changed ? { ...p, questionnaires } : null;
}
