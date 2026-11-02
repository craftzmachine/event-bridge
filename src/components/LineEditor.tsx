import type { Line, UpgradeMode } from "../types";
import { lineAmount } from "../lib/totals";
import { formatINR } from "../lib/format";
import MoneyInput from "./MoneyInput";

const MODES: { id: UpgradeMode; label: string }[] = [
  { id: "off", label: "No" },
  { id: "offer", label: "Offer" },
  { id: "include", label: "Include" },
];

export default function LineEditor({
  line,
  index,
  expanded,
  onToggle,
  onChange,
  onRemove,
  onMove,
}: {
  line: Line;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onChange: (l: Line) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const set = (patch: Partial<Line>) => onChange({ ...line, ...patch });
  const amount = line.rate === null ? "As per actuals" : formatINR(lineAmount(line));
  return (
    <li className={`line ${expanded ? "is-open" : ""} ${line.optional ? "is-optional" : ""}`}>
      <div className="line-head">
        <button className="line-title" onClick={onToggle} aria-expanded={expanded}>
          <span className="line-num">{String(index + 1).padStart(2, "0")}</span>
          <span className="line-name">{line.name}</span>
          <span className="line-amt">{amount}</span>
        </button>
        <div className="line-tools">
          <button className="icon-btn" onClick={() => onMove(-1)} aria-label="Move up">↑</button>
          <button className="icon-btn" onClick={() => onMove(1)} aria-label="Move down">↓</button>
          <button className="icon-btn icon-danger" onClick={onRemove} aria-label={`Remove ${line.name}`}>×</button>
        </div>
      </div>
      {line.optional && !expanded && <p className="line-flag">Additional option · not in Grand Total</p>}
      {expanded && (
        <div className="line-body">
          {line.elementId === null && (
            <label className="field">
              <span>Element</span>
              <input value={line.name} onChange={(e) => set({ name: e.target.value })} />
            </label>
          )}
          <div className="line-grid">
            <label className="field">
              <span>Qty</span>
              <input type="number" min={0} step="any" inputMode="decimal" value={line.qty}
                onChange={(e) => set({ qty: Math.max(0, Number(e.target.value) || 0) })} />
            </label>
            <label className="field">
              <span>Unit</span>
              <input value={line.unit} onChange={(e) => set({ unit: e.target.value })} />
            </label>
            <div className="field field-wide">
              <span>Rate</span>
              {line.rate === null ? (
                <button className="btn-ghost btn-sm" onClick={() => set({ rate: 0 })}>As per actuals · set a price</button>
              ) : (
                <MoneyInput label="Rate" value={line.rate} onChange={(n) => set({ rate: n ?? 0 })} />
              )}
            </div>
          </div>
          {line.rate !== null && (
            <button className="link-btn" onClick={() => set({ rate: null })}>Bill as per actuals instead</button>
          )}
          <label className="field">
            <span>Notes for the client</span>
            <textarea rows={2} value={line.notes} placeholder="e.g. jasmine and marigold, ivory drapes"
              onChange={(e) => set({ notes: e.target.value })} />
          </label>
          {line.upgrades.length > 0 && (
            <div className="upgrades">
              <span className="field-label">Optional upgrades</span>
              {line.upgrades.map((u) => (
                <div className="upgrade" key={u.id}>
                  <span>
                    {u.name} <em>{formatINR(u.price)}</em>
                  </span>
                  <div className="seg" role="radiogroup" aria-label={u.name}>
                    {MODES.map((m) => (
                      <button key={m.id} role="radio" aria-checked={u.mode === m.id} className={u.mode === m.id ? "is-on" : ""}
                        onClick={() => set({ upgrades: line.upgrades.map((x) => (x.id === u.id ? { ...x, mode: m.id } : x)) })}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <p className="hint">Offer: listed as an option. Include: added to this element's price.</p>
            </div>
          )}
          <label className="check">
            <input type="checkbox" checked={line.optional} onChange={(e) => set({ optional: e.target.checked })} />
            <span>Show as an additional option (not in the Grand Total)</span>
          </label>
        </div>
      )}
    </li>
  );
}
