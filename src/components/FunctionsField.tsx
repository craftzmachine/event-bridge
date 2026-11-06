import { useState } from "react";
import type { Proposal } from "../types";
import { uid } from "../state/proposals";
import { eventDates } from "../lib/proposal";
import { formatDate } from "../lib/format";
import { FUNCTION_PRESETS, functionsOf, removeFunction } from "../lib/functions";

type Set = (patch: Partial<Proposal> | ((cur: Proposal) => Partial<Proposal>)) => void;

/**
 * Step one: the functions of a multi-function celebration, each on one of the event dates. With none, the proposal
 * stays one list. The first function added takes every element already chosen.
 */
export default function FunctionsField({ p, set }: { p: Proposal; set: Set }) {
  const fs = functionsOf(p);
  const dates = eventDates(p);
  const [custom, setCustom] = useState("");
  const add = (label: string) => {
    const name = label.trim();
    if (!name) return;
    set((cur) => {
      const list = functionsOf(cur);
      // a new function takes the next date not yet used, else the last date
      const used = new Set(list.map((f) => f.date));
      const ds = eventDates(cur);
      const date = ds.find((d) => !used.has(d)) ?? ds[ds.length - 1] ?? "";
      const f = { id: `f-${uid()}`, label: name, date };
      // the first function takes the elements already chosen
      return { functions: [...list, f], lines: list.length ? cur.lines : cur.lines.map((l) => ({ ...l, fn: f.id })) };
    });
    setCustom("");
  };
  const update = (id: string, patch: { label?: string; date?: string }) =>
    set((cur) => ({ functions: functionsOf(cur).map((f) => (f.id === id ? { ...f, ...patch } : f)) }));

  return (
    <fieldset className="field field-wide fns">
      <legend>Functions <small>(optional)</small></legend>
      <p className="hint">For a celebration over several functions, add each one. Every element then belongs to a function, and each gets its own subtotal.</p>
      {fs.length > 0 && (
        <ol className="fns-list">
          {fs.map((f) => (
            <li key={f.id}>
              <input aria-label="Function name" value={f.label} maxLength={60} onChange={(e) => update(f.id, { label: e.target.value })} />
              <select aria-label={`Date of ${f.label}`} value={dates.includes(f.date) ? f.date : ""} onChange={(e) => update(f.id, { date: e.target.value })}>
                <option value="">Date to be confirmed</option>
                {dates.map((d) => (
                  <option key={d} value={d}>{formatDate(d)}</option>
                ))}
              </select>
              <button type="button" className="icon-btn icon-danger" aria-label={`Remove ${f.label}`}
                onClick={() => set((cur) => removeFunction(cur, f.id))}>×</button>
            </li>
          ))}
        </ol>
      )}
      <div className="chips">
        {FUNCTION_PRESETS.filter((x) => !fs.some((f) => f.label.toLowerCase() === x.toLowerCase())).map((x) => (
          <button key={x} type="button" className="chip" onClick={() => add(x)}>+ {x}</button>
        ))}
      </div>
      <div className="fns-custom">
        <input aria-label="Another function" placeholder="Another function, e.g. Welcome dinner" value={custom} maxLength={60}
          onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add(custom))} />
        <button type="button" className="btn-ghost btn-sm" disabled={!custom.trim()} onClick={() => add(custom)}>Add</button>
      </div>
      {!dates.length && fs.length > 0 && <p className="hint">Add the event dates above to give each function its date.</p>}
    </fieldset>
  );
}
