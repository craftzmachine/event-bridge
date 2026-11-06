// The family's budget against the quote, and lower-priced swaps when it's over.
import type { Catalog, CatalogElement, Line, Proposal } from "../types";
import { elementFits } from "../config/context";
import { computeTotals } from "./totals";

export type BudgetState = { kind: "none" } | { kind: "under" | "near" | "over"; budget: number; total: number; diff: number; ratio: number };

/** "near" = within 5% under the budget; "over" = above it. */
export function budgetState(total: number, budget: number | null | undefined): BudgetState {
  if (!budget || budget <= 0) return { kind: "none" };
  const ratio = total / budget;
  const kind = ratio > 1 ? "over" : ratio >= 0.95 ? "near" : "under";
  return { kind, budget, total, diff: Math.round((budget - total) * 100) / 100, ratio };
}

export interface Swap {
  line: Line;
  alt: CatalogElement;
  /** how much the Sub Total drops (before co-ordination) */
  saving: number;
}

/**
 * Up to `max` swaps, biggest saving first: for each included, priced catalogue line, a cheaper element from the
 * same category that suits the occasion and isn't already in the proposal.
 */
export function budgetSuggestions(p: Proposal, catalog: Catalog, max = 3): Swap[] {
  const used = new Set(p.lines.map((l) => l.elementId).filter(Boolean));
  const out: Swap[] = [];
  for (const line of p.lines) {
    if (line.optional || line.rate === null || !line.elementId) continue;
    const best = catalog.elements
      .filter((e) => e.category === line.category && !used.has(e.id) && e.defaultPrice !== null && e.defaultPrice < line.rate! && elementFits(e, p.eventType, p.style))
      .sort((a, b) => b.defaultPrice! - a.defaultPrice!)[0]; // the closest cheaper option, not the cheapest
    if (best) out.push({ line, alt: best, saving: (line.rate - best.defaultPrice!) * line.qty });
  }
  return out.sort((a, b) => b.saving - a.saving).slice(0, max);
}

/** The swap applied: the cheaper element takes the line's place, keeping its quantity, function and notes. */
export function swapLine(line: Line, fresh: Line): Line {
  return { ...fresh, qty: line.qty, fn: line.fn, notes: line.notes, perGuest: line.perGuest ?? fresh.perGuest, uid: line.uid };
}

export const quoteTotal = (p: Proposal, gstPct: number) => computeTotals(p, gstPct).grandTotal;
