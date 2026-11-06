// Internal cost and margin. Costs are the company's own figures: they never reach the preview, the exports or
// the shared page (see onlyShown in proposalPage.ts), and they never go in public/config.
import type { Catalog, Line, Proposal } from "../types";
import { computeTotals, lineAmount } from "./totals";
import { matchElement, norm, parseNumber, type Cell } from "./excelImport";

export const DEFAULT_MIN_MARGIN = 20;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A line's cost: qty × the cost per unit; null when no cost was entered. */
export const lineCost = (l: Line): number | null => (typeof l.cost === "number" ? r2(l.qty * l.cost) : null);

export interface LineMargin {
  line: Line;
  price: number;
  cost: number;
  margin: number;
  /** margin ÷ price; null for a line priced at zero */
  pct: number | null;
}

export interface MarginSummary {
  /** what the client pays before GST: the Grand Total (co-ordination and round-off included) */
  revenue: number;
  /** cost of the included lines that have one */
  cost: number;
  margin: number;
  pct: number | null;
  /** included, priced lines, and how many of them have a cost */
  priced: number;
  costed: number;
  lines: LineMargin[];
}

/**
 * The margin on what's in the Grand Total. Lines without a cost are left out of the cost (and counted in
 * `priced − costed`), so the figure is only complete once every priced line has one.
 */
export function marginOf(p: Proposal, gstPct: number): MarginSummary {
  const included = p.lines.filter((l) => !l.optional && l.rate !== null);
  const lines: LineMargin[] = included
    .filter((l) => lineCost(l) !== null)
    .map((l) => {
      const price = lineAmount(l);
      const cost = lineCost(l)!;
      return { line: l, price, cost, margin: r2(price - cost), pct: price ? (price - cost) / price : null };
    });
  const revenue = computeTotals(p, gstPct).grandTotal;
  const cost = r2(lines.reduce((s, x) => s + x.cost, 0));
  return { revenue, cost, margin: r2(revenue - cost), pct: revenue ? (revenue - cost) / revenue : null, priced: included.length, costed: lines.length, lines };
}

/**
 * A cost sheet: rows of element name and cost per unit, as an Excel or CSV export. The name is the row's first
 * text cell and the cost its last number; rows whose name isn't a catalogue element are reported, not guessed.
 */
export function readCostSheet(rows: Cell[][], catalog: Catalog): { costs: Record<string, number>; matched: number; unmatched: string[] } {
  const costs: Record<string, number> = {};
  const unmatched: string[] = [];
  for (const row of rows) {
    const name = row.find((c) => typeof c === "string" && /[a-z]/i.test(c) && parseNumber(c) === null) as string | undefined;
    const cost = [...row].reverse().map((c) => parseNumber(c)).find((n): n is number => n !== null && n >= 0);
    if (!name || cost === undefined || /^(element|item|name|description|particulars)$/.test(norm(name))) continue;
    const el = matchElement(name, catalog);
    if (el) costs[el.id] = cost;
    else unmatched.push(name.trim());
  }
  return { costs, matched: Object.keys(costs).length, unmatched };
}

/** Comma-separated values, with quoted fields ("Mandap, jasmine", 12000). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** Fills in costs from the sheet for lines that don't have one yet. */
export function applyCosts(lines: Line[], costs: Record<string, number>): Line[] {
  return lines.map((l) => (l.cost == null && l.elementId && costs[l.elementId] !== undefined ? { ...l, cost: costs[l.elementId] } : l));
}
