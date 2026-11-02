import type { Catalog, Line, Proposal } from "../types";
import { safeFilePart } from "./format";

const labels = (p: Proposal, catalog: Catalog) => ({
  style: catalog.ceremonyStyles.find((s) => s.id === p.style)?.label ?? "",
  type: catalog.eventTypes.find((t) => t.id === p.eventType)?.label ?? "Event",
});

/** "Hindu Wedding", "Christian Engagement"… */
export function proposalTitle(p: Proposal, catalog: Catalog): string {
  const { style, type } = labels(p, catalog);
  return `${style} ${type}`.trim();
}

export function exportFileName(p: Proposal, catalog: Catalog, ext: "xlsx" | "pdf" = "xlsx"): string {
  const { style, type } = labels(p, catalog);
  const parts = ["Proposal", safeFilePart(p.client.name), style && safeFilePart(style), safeFilePart(type), p.client.date || "TBC"];
  return `${parts.filter(Boolean).join("_")}.${ext}`;
}

/** "Venue, Location" — without repeating the location when the venue name already ends with it. */
export function venueLine(p: Proposal): string {
  const { venue, location } = p.client;
  if (venue && location && venue.toLowerCase().includes(location.toLowerCase())) return venue;
  return [venue, location].filter(Boolean).join(", ");
}

/** Lines grouped by catalogue category order; categories with no lines are left out. */
export function groupLines(lines: Line[], catalog: Catalog) {
  const order = [...catalog.categories].sort((a, b) => a.order - b.order);
  const known = new Set(order.map((c) => c.id));
  const groups = order
    .map((c) => ({ id: c.id, label: c.label, lines: lines.filter((l) => l.category === c.id) }))
    .filter((g) => g.lines.length);
  const other = lines.filter((l) => !known.has(l.category));
  if (other.length) groups.push({ id: "other", label: "Other Elements", lines: other });
  return groups;
}
