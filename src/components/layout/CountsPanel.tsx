// The editor's live counts: tables by size and seats, total chairs, and the zones with their sizes.
import { useState } from "react";
import type { VenueLayout } from "../../types";
import { planCounts } from "../../lib/inventory";

export default function CountsPanel({ layout, onOpen }: { layout: VenueLayout; onOpen?: () => void }) {
  const [open, setOpen] = useState(true);
  const c = planCounts(layout);
  return (
    <section className="rounded-lg border border-line bg-card p-4" aria-labelledby="counts-title">
      <button type="button" className="flex w-full items-center justify-between border-0 bg-transparent p-0 text-left" aria-expanded={open}
        onClick={() => { setOpen(!open); if (!open) onOpen?.(); }}>
        <h3 id="counts-title" className="m-0 text-sm font-medium text-ink-2">Counts</h3>
        <span className="text-xs text-stone">{open ? "Hide" : "Show"}</span>
      </button>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[[c.tables, "tables"], [c.chairs, "chairs"], [c.chairRows, "chair rows"]].map(([n, l]) => (
          <div key={l as string} className="rounded-sm bg-paper-2 px-1 py-2">
            <div className="font-serif text-2xl leading-none text-ink tabular-nums">{n}</div>
            <div className="mt-1 text-[11px] text-stone">{l}</div>
          </div>
        ))}
      </div>
      {open && (
        <dl className="m-0 mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
          {c.rows.map((r) => (
            <div key={`${r.kind}${r.size}${r.seats}`} className="contents">
              <dt className="text-ink-2">{r.label} {r.size}{r.seats ? ` · ${r.seats} seats` : ""}</dt>
              <dd className="m-0 text-right tabular-nums text-ink">× {r.count}</dd>
            </div>
          ))}
          {c.zones.map((r) => (
            <div key={`${r.kind}${r.size}`} className="contents">
              <dt className="text-ink-2">{r.label} {r.size}</dt>
              <dd className="m-0 text-right tabular-nums text-ink">× {r.count}</dd>
            </div>
          ))}
          {!c.rows.length && !c.zones.length && <dd className="col-span-2 m-0 text-stone">Nothing in the plan yet.</dd>}
        </dl>
      )}
    </section>
  );
}
