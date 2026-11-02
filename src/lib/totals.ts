import type { Line, Proposal } from "../types";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** qty × rate plus any upgrades the client has agreed to (mode "include"). */
export function lineAmount(line: Line): number {
  const base = line.rate === null ? 0 : line.qty * line.rate;
  return base + line.upgrades.filter((u) => u.mode === "include").reduce((s, u) => s + u.price, 0);
}

export interface Totals {
  subTotal: number;
  coordination: number;
  beforeRound: number;
  roundOff: number;
  grandTotal: number;
  gst: number;
  totalWithGst: number;
  /** additional-option lines plus offered upgrades — never in the Grand Total */
  optionsTotal: number;
  asPerActuals: Line[];
}

export function computeTotals(p: Pick<Proposal, "lines" | "coordinationPct" | "grandTotal">, gstPct: number): Totals {
  const included = p.lines.filter((l) => !l.optional);
  const subTotal = r2(included.reduce((s, l) => s + lineAmount(l), 0));
  const coordination = r2((subTotal * p.coordinationPct) / 100);
  const beforeRound = r2(subTotal + coordination);
  const grandTotal = p.grandTotal ?? beforeRound;
  const offered = p.lines.flatMap((l) => l.upgrades.filter((u) => u.mode === "offer"));
  const optionsTotal = r2(
    p.lines.filter((l) => l.optional).reduce((s, l) => s + lineAmount(l), 0) + offered.reduce((s, u) => s + u.price, 0),
  );
  const gst = r2((grandTotal * gstPct) / 100);
  return {
    subTotal,
    coordination,
    beforeRound,
    roundOff: r2(grandTotal - beforeRound),
    grandTotal,
    gst,
    totalWithGst: r2(grandTotal + gst),
    optionsTotal,
    asPerActuals: included.filter((l) => l.rate === null),
  };
}

/** Round-off suggestions: down to the nearest ₹10,000 and ₹1,000. */
export function roundOffSuggestions(beforeRound: number): number[] {
  const s = [Math.floor(beforeRound / 10000) * 10000, Math.floor(beforeRound / 1000) * 1000];
  return [...new Set(s)].filter((v) => v > 0 && v !== beforeRound);
}
