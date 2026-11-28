// The Layers panel: every item front to back, grouped by tier (labels, walls, furniture, floor), with show/hide,
// lock, rename and order. Clicking a row selects (Shift adds), so items buried under others are always reachable.
import { useState } from "react";
import type { LayoutItem } from "../../types";
import { KINDS, TIER_NAMES, drawOrder, tierOf } from "../../lib/layout";
import KindIcon from "./KindIcon";

type Order = "front" | "back" | "forward" | "backward";

export default function LayersPanel({ items, sel, onSelect, onPatch, onOrder, onClose }: {
  items: LayoutItem[];
  sel: string[];
  onSelect: (ids: string[]) => void;
  onPatch: (id: string, patch: Partial<LayoutItem>) => void;
  onOrder: (how: Order) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const find = q.trim().toLowerCase();
  // front first, as a drawing app lists layers
  const rows = drawOrder(items).reverse().filter((i) => !find || `${i.label ?? ""} ${KINDS[i.kind].label}`.toLowerCase().includes(find));
  const tiers = [3, 2, 1, 0].map((t) => ({ t, rows: rows.filter((i) => tierOf(i.kind) === t) })).filter((g) => g.rows.length);
  const size = (i: LayoutItem) => (KINDS[i.kind].round ? `Ø ${i.w}` : `${i.w} × ${i.h}`);
  const btn = "grid h-7 w-7 shrink-0 place-items-center rounded-sm border-0 bg-transparent text-xs text-ink-2 hover:bg-gold-soft disabled:opacity-40";

  return (
    <section className="rounded-lg border border-line bg-card p-4" aria-label="Layers">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="m-0 mr-auto text-sm font-medium text-ink-2">Layers <span className="text-xs text-stone">· {items.length}</span></h3>
        <button type="button" className="link-btn text-xs" onClick={onClose}>Hide</button>
      </div>
      <input className="search mb-2" type="search" placeholder="Find an item" aria-label="Find an item in the plan" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mb-2 grid grid-cols-4 gap-1" role="group" aria-label="Order of the selected items">
        {([["front", "Bring to front (Ctrl+Shift+])", "⤒ Front"], ["forward", "Bring forward (Ctrl+])", "↑ Up"], ["backward", "Send backward (Ctrl+[)", "↓ Down"], ["back", "Send to back (Ctrl+Shift+[)", "⤓ Back"]] as const).map(([how, label, text]) => (
          <button key={how} type="button" disabled={!sel.length} title={`${label}, within its group`} aria-label={label} onClick={() => onOrder(how)}
            className="whitespace-nowrap rounded-sm border border-solid border-line bg-paper px-1 py-1 text-[11px] text-ink-2 hover:border-gold disabled:opacity-40">
            {text}
          </button>
        ))}
      </div>
      <div className="grid max-h-80 gap-2 overflow-y-auto pr-1">
        {tiers.map((g) => (
          <div key={g.t}>
            <p className="m-0 mb-1 text-[11px] font-medium text-stone">{TIER_NAMES[g.t]}</p>
            <ul className="m-0 grid list-none gap-0.5 p-0">
              {g.rows.map((i) => {
                const on = sel.includes(i.id);
                return (
                  <li key={i.id} className={`flex items-center gap-1.5 rounded-sm px-1.5 py-1 ${on ? "bg-gold-soft" : "hover:bg-paper"} ${i.hidden ? "opacity-50" : ""}`}>
                    <KindIcon kind={i.kind} />
                    {renaming === i.id ? (
                      <input autoFocus className="min-w-0 flex-1 rounded-sm border border-line bg-card px-1.5 py-0.5 text-xs" defaultValue={i.label ?? ""} maxLength={40} aria-label="Name"
                        onBlur={(e) => { if (e.target.value !== (i.label ?? "")) onPatch(i.id, { label: e.target.value }); setRenaming(null); }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenaming(null); }} />
                    ) : (
                      <button type="button" aria-pressed={on} title="Click to select, Shift-click to add, double-click to rename"
                        className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left text-xs text-ink"
                        onClick={(e) => onSelect(e.shiftKey ? (on ? sel.filter((x) => x !== i.id) : [...sel, i.id]) : [i.id])}
                        onDoubleClick={() => setRenaming(i.id)}>
                        {i.label || KINDS[i.kind].label}
                        <span className="ml-1 text-stone">{size(i)}{i.seats ? ` · ${i.seats}` : ""}</span>
                      </button>
                    )}
                    <button type="button" className={btn} aria-pressed={!!i.hidden} title={i.hidden ? "Show" : "Hide"} aria-label={`${i.hidden ? "Show" : "Hide"} ${i.label || KINDS[i.kind].label}`}
                      onClick={() => { onPatch(i.id, { hidden: i.hidden ? undefined : true }); if (!i.hidden && on) onSelect(sel.filter((x) => x !== i.id)); }}>
                      {i.hidden ? "◌" : "👁"}
                    </button>
                    <button type="button" className={btn} aria-pressed={!!i.locked} title={i.locked ? "Unlock" : "Lock"} aria-label={`${i.locked ? "Unlock" : "Lock"} ${i.label || KINDS[i.kind].label}`}
                      onClick={() => onPatch(i.id, { locked: i.locked ? undefined : true })}>
                      {i.locked ? "🔒" : "🔓"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {!rows.length && <p className="m-0 py-3 text-center text-xs text-stone">{items.length ? "Nothing matches." : "The plan is empty."}</p>}
      </div>
      <p className="m-0 mt-2 text-[11px] text-stone">Floor items always sit under furniture; order moves an item within its group. Hidden items still count and print.</p>
    </section>
  );
}
