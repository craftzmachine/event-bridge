// A proposal shared as a web page: a snapshot of exactly what the preview shows, plus the theme the planner chose.
// The server re-checks and cleans it (server/page.ts), and the client's browser renders it with ProposalPage.
import type { Catalog, Choice, Line, Proposal } from "../types";
import type { ThemeId } from "../state/appearance";
import { eventDates } from "./proposal";
import { todayISO } from "./format";

/** The server's limit; checked here first so the planner gets a clear message before uploading. */
export const PAGE_MAX_BYTES = 256 * 1024;

export interface PageSnapshot {
  v: 1;
  theme: ThemeId;
  /** the date printed as "Dated …" on the page: the day it was shared, not the day it's viewed */
  dated: string;
  proposal: Pick<Proposal, "client" | "ref" | "eventType" | "style" | "lines" | "coordinationPct" | "grandTotal" | "terms" | "notes">;
  catalog: Pick<Catalog, "eventTypes" | "ceremonyStyles" | "categories">;
}

const onlyShown = (l: Line): Line => ({
  ...l,
  elementId: null,
  // upgrades the planner didn't include or offer are internal, so they stay out of the page
  upgrades: l.upgrades.filter((u) => u.mode !== "off"),
});
const pick = (list: Choice[], id: string | null) => list.filter((c) => c.id === id).map(({ id, label, image }) => ({ id, label, blurb: "", image }));

export function pageSnapshot(p: Proposal, catalog: Catalog, theme: ThemeId, dated = todayISO()): PageSnapshot {
  const dates = eventDates(p);
  return {
    v: 1,
    theme,
    dated,
    proposal: {
      client: { ...p.client, dates, date: dates[0] ?? "" },
      ref: p.ref,
      eventType: p.eventType,
      style: p.style,
      lines: p.lines.map(onlyShown),
      coordinationPct: p.coordinationPct,
      grandTotal: p.grandTotal,
      terms: p.terms.filter((t) => t.trim()),
      notes: p.notes,
    },
    catalog: {
      eventTypes: pick(catalog.eventTypes, p.eventType),
      ceremonyStyles: pick(catalog.ceremonyStyles, p.style),
      categories: catalog.categories.map(({ id, label, order }) => ({ id, label, order })),
    },
  };
}

/** The snapshot as a Proposal, so the same ProposalPreview draws the planner's preview and the client's page. */
export function snapshotProposal(s: PageSnapshot): Proposal {
  return { ...s.proposal, id: "shared", createdAt: s.dated, updatedAt: s.dated };
}

export const snapshotBytes = (s: PageSnapshot) => new Blob([JSON.stringify(s)]).size;
