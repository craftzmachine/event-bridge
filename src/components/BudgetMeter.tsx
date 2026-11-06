import type { Line, Proposal } from "../types";
import { useConfig } from "../config/context";
import { lineFromElement } from "../state/proposals";
import { budgetState, budgetSuggestions, swapLine } from "../lib/budget";
import { computeTotals } from "../lib/totals";
import { formatINR, formatINRShort } from "../lib/format";

/**
 * The quote against the family's budget, with lower-priced swaps when it's over. Nothing shows without a budget,
 * except a prompt in the Review step to add one.
 */
export default function BudgetMeter({ p, onSwap, compact = false }: { p: Proposal; onSwap: (uid: string, next: Line) => void; compact?: boolean }) {
  const { catalog, brand } = useConfig();
  const total = computeTotals(p, brand.gstPct).grandTotal;
  const s = budgetState(total, p.client.budget);
  if (s.kind === "none") return compact ? null : <p className="hint budget-none">Add the family's budget in step one to compare the quote with it.</p>;
  const swaps = s.kind === "over" ? budgetSuggestions(p, catalog) : [];
  const fill = Math.min(100, s.ratio * 100);
  const message =
    s.kind === "over"
      ? `${formatINR(-s.diff)} over the budget`
      : s.kind === "near"
        ? `Close to the budget: ${formatINR(s.diff)} left`
        : `${formatINR(s.diff)} under the budget`;
  return (
    <div className={`budget is-${s.kind} ${compact ? "is-compact" : ""}`}>
      <div className="budget-head">
        <span>Budget {formatINRShort(s.budget)}</span>
        <strong>{Math.round(s.ratio * 100)}%</strong>
      </div>
      <div className="budget-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(s.ratio * 100)} aria-label="Quote as a share of the budget">
        <span style={{ width: `${fill}%` }} />
      </div>
      <p className="budget-msg">{message}</p>
      {swaps.length > 0 && (
        <div className="budget-swaps">
          <span className="field-label">Ways to bring it down</span>
          <ul>
            {swaps.map((w) => (
              <li key={w.line.uid}>
                <span>
                  <strong>{w.alt.name}</strong> instead of {w.line.name}
                  <small>saves about {formatINRShort(w.saving)} before co-ordination</small>
                </span>
                <button className="btn-ghost btn-sm" onClick={() => onSwap(w.line.uid, swapLine(w.line, lineFromElement(w.alt)))}>Swap</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
