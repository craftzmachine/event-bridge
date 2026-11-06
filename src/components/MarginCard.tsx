import { useRef, useState } from "react";
import type { Line, Proposal } from "../types";
import { useConfig } from "../config/context";
import { applyCosts, DEFAULT_MIN_MARGIN, marginOf, parseCsv, readCostSheet } from "../lib/margin";
import { formatINR } from "../lib/format";
import { readCosts, readMinMargin, writeCosts, writeMinMargin } from "../state/costs";

const pctText = (x: number | null) => (x === null ? "—" : `${Math.round(x * 1000) / 10}%`);

/**
 * Review step, for the team only: cost, margin and a warning below the minimum. Costs come from each line's
 * internal cost or a cost sheet loaded on this device; none of it is shown to the client or exported.
 */
export default function MarginCard({ p, setLines }: { p: Proposal; setLines: (fn: (ls: Line[]) => Line[]) => void }) {
  const { catalog, brand } = useConfig();
  const fileRef = useRef<HTMLInputElement>(null);
  const [min, setMin] = useState(() => readMinMargin(DEFAULT_MIN_MARGIN));
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  const m = marginOf(p, brand.gstPct);
  const sheet = readCosts();
  const fillable = p.lines.some((l) => l.cost == null && l.elementId && sheet[l.elementId] !== undefined);
  const low = m.pct !== null && m.costed > 0 && m.pct * 100 < min;

  async function load(file: File | undefined) {
    if (!file) return;
    setMsg("");
    try {
      let rows: (string | number | boolean | Date | null)[][];
      if (/\.csv$/i.test(file.name)) rows = parseCsv(await file.text());
      else {
        const { readWorkbook } = await import("../lib/readWorkbook");
        const book = await readWorkbook(file.name, await file.arrayBuffer());
        rows = book.sheets.flatMap((s) => s.rows.map((r) => r ?? []));
      }
      const r = readCostSheet(rows, catalog);
      if (!r.matched) return setMsg("No catalogue elements were found in that file. It needs a row per element: its name, then its cost.");
      const next = { ...readCosts(), ...r.costs };
      writeCosts(next);
      setLines((ls) => applyCosts(ls, next));
      setMsg(`Loaded costs for ${r.matched} element${r.matched === 1 ? "" : "s"}${r.unmatched.length ? `; ${r.unmatched.length} row${r.unmatched.length === 1 ? "" : "s"} didn't match a catalogue element (${r.unmatched.slice(0, 3).join(", ")}${r.unmatched.length > 3 ? "…" : ""})` : ""}.`);
    } catch (e) {
      setMsg(`Couldn't read that file: ${(e as Error).message}`);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className={`side-card margin ${low ? "is-low" : ""}`}>
      <h3>Margin <small>· only you see this</small></h3>
      {m.costed === 0 ? (
        <p className="hint">Add each element's internal cost (in the element's details), or load a cost sheet, to see the margin.</p>
      ) : (
        <>
          <dl className="margin-figs">
            <div><dt>Quote</dt><dd>{formatINR(m.revenue)}</dd></div>
            <div><dt>Cost</dt><dd>{formatINR(m.cost)}</dd></div>
            <div><dt>Margin</dt><dd>{formatINR(m.margin)} <small>{pctText(m.pct)}</small></dd></div>
          </dl>
          {m.costed < m.priced && <p className="hint">{m.priced - m.costed} of {m.priced} priced elements have no cost yet, so the margin is higher than it will be.</p>}
          {low && <p className="notice" role="status">The margin is below your minimum of {min}%. Check the rates before sharing.</p>}
          <button className="link-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? "Hide" : "Show"} each element's margin</button>
          {open && (
            <table className="margin-lines">
              <thead><tr><th>Element</th><th>Price</th><th>Cost</th><th>Margin</th></tr></thead>
              <tbody>
                {[...m.lines].sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0)).map((x) => (
                  <tr key={x.line.uid} className={x.pct !== null && x.pct * 100 < min ? "is-low" : ""}>
                    <td>{x.line.name}</td>
                    <td>{formatINR(x.price)}</td>
                    <td>{formatINR(x.cost)}</td>
                    <td>{pctText(x.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      <div className="margin-tools">
        <label className="margin-min">
          <span>Minimum margin</span>
          <input type="number" min={1} max={95} step={1} value={min} onChange={(e) => {
            const n = Math.min(95, Math.max(1, Math.round(Number(e.target.value) || DEFAULT_MIN_MARGIN)));
            setMin(n);
            writeMinMargin(n);
          }} />
          <span>%</span>
        </label>
        <button className="btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>Load cost sheet</button>
        {fillable && <button className="btn-ghost btn-sm" onClick={() => setLines((ls) => applyCosts(ls, sheet))}>Fill in costs from the sheet</button>}
        <input ref={fileRef} type="file" accept=".xlsx,.csv" hidden onChange={(e) => load(e.target.files?.[0])} />
      </div>
      {msg && <p className="hint" role="status">{msg}</p>}
    </div>
  );
}
