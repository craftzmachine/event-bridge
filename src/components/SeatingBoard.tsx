// Seat the guests on the floor plan: drag a household (or tap it, then tap a table) onto a table or a seat;
// auto-seat fills the rest keeping households and groups together. Uses the same SVG drawing as the layout editor.
import { useMemo, useState, type PointerEvent as RPointerEvent } from "react";
import type { LayoutItem, Proposal } from "../types";
import { useConfig } from "../config/context";
import { KINDS } from "../lib/layout";
import { SIDES } from "../lib/guestList";
import { autoSeat, freeSeats, guestOf, householdsFor, issues, normalise, seatAt, seatedKeys, tablesOf, tidy, unseat, type Plan } from "../lib/seating";
import { ItemShape, Room } from "./layout/FloorPlan";
import { usePanZoom } from "./layout/usePanZoom";
import EmptyState from "./EmptyState";

type Update = (fn: (cur: Proposal) => Proposal) => void;
const SIDE_FILL: Record<string, string> = { bride: "var(--gold)", groom: "var(--ink-2)", both: "var(--taupe)", "": "var(--stone)" };

export default function SeatingBoard({ p, fnId, onUpdate }: { p: Proposal; fnId: string; onUpdate: Update }) {
  const { brand } = useConfig();
  const layout = p.layouts?.[fnId];
  const tables = useMemo(() => tablesOf(layout), [layout]);
  const { plan, displaced } = useMemo(() => normalise(p.seating?.[fnId], tables), [p.seating, fnId, tables]);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const households = useMemo(() => householdsFor(p, fnId, unconfirmed), [p, fnId, unconfirmed]);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [openTable, setOpenTable] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ guestId: string; x: number; y: number } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const pz = usePanZoom(layout ?? { w: 30, h: 20 });

  const seated = seatedKeys(plan);
  const byId = new Map(households.map((h) => [h.guest.id, h]));
  const allGuests = new Map((p.guestList?.guests ?? []).map((g) => [g.id, g]));
  const toSeat = households.map((h) => ({ h, left: h.people.filter((x) => !seated.has(x.key)) })).filter((x) => x.left.length);
  const shown = toSeat.filter((x) => !q.trim() || x.h.guest.name.toLowerCase().includes(q.trim().toLowerCase()));
  const totalPeople = households.reduce((n, h) => n + h.people.length, 0);
  const capacity = tables.reduce((n, t) => n + (t.seats ?? 0), 0);
  const problems = issues(p, fnId, plan, displaced);

  const save = (next: Plan) => onUpdate((cur) => ({ ...cur, seating: { ...(cur.seating ?? {}), [fnId]: next } }));

  /** seat a household's unseated people (or all of them, to move) at a table, from a seat if given */
  const place = (guestId: string, tableId: string, seat?: number) => {
    const h = byId.get(guestId);
    if (!h) return;
    const notYet = h.people.filter((x) => !seated.has(x.key)).map((x) => x.key);
    const keys = notYet.length ? notYet : h.people.map((x) => x.key);
    const t = tables.find((x) => x.id === tableId);
    const next = seatAt(plan, tableId, keys, seat);
    if (!next) {
      setNote(`${t?.label || "That table"} has ${freeSeats(plan, tableId)} free seat${freeSeats(plan, tableId) === 1 ? "" : "s"}; ${h.guest.name} need${keys.length === 1 ? "s" : ""} ${keys.length}.`);
      return;
    }
    setNote("");
    save(next);
    setPicked(null);
  };

  // dragging a household from the list: a chip follows the pointer, and the drop target is whatever table is under it
  const startDrag = (e: RPointerEvent<HTMLElement>, guestId: string) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* the pointer already ended */
    }
    setDragging({ guestId, x: e.clientX, y: e.clientY });
  };
  const moveDrag = (e: RPointerEvent<HTMLElement>) => dragging && setDragging({ ...dragging, x: e.clientX, y: e.clientY });
  const endDrag = (e: RPointerEvent<HTMLElement>) => {
    if (!dragging) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const g = el?.closest("[data-table]") as SVGGElement | null;
    const seat = el?.getAttribute("data-seat");
    if (g) place(dragging.guestId, g.dataset.table!, seat != null ? Number(seat) : undefined);
    else if (!g) setPicked((cur) => (cur === dragging.guestId ? null : dragging.guestId));
    setDragging(null);
  };

  if (!layout || !tables.length)
    return (
      <EmptyState icon="pin" title={layout ? "No tables in this plan" : "Draw the floor plan first"} actions={<a className="btn-primary" href={`#/events/${p.id}/layout`}>Open the layout</a>}>
        Seating uses the tables on this function's floor plan. Add round tables, long tables or chair rows there, then come back to seat your guests.
      </EmptyState>
    );

  const table = openTable ? tables.find((t) => t.id === openTable) : null;
  const fillFor = (t: LayoutItem) => (i: number) => {
    const k = plan[t.id]?.[i];
    if (!k) return undefined;
    return SIDE_FILL[allGuests.get(guestOf(k))?.side ?? ""];
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="grid content-start gap-3 rounded-lg border border-line bg-card p-4 lg:max-h-[78vh] lg:overflow-auto">
        <div>
          <h3 className="m-0 text-sm font-medium text-ink-2">To seat</h3>
          <p className="m-0 mt-1 text-xs text-stone">{seated.size} of {totalPeople} seated · {capacity} seats</p>
        </div>
        <label className="check min-h-0 text-xs">
          <input type="checkbox" checked={unconfirmed} onChange={(e) => setUnconfirmed(e.target.checked)} />
          Include guests who haven't replied or said maybe
        </label>
        <input className="search" type="search" placeholder="Search guests" aria-label="Search guests to seat" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {shown.map(({ h, left }) => (
            <li key={h.guest.id}>
              <button type="button" aria-pressed={picked === h.guest.id}
                onPointerDown={(e) => startDrag(e, h.guest.id)} onPointerMove={moveDrag} onPointerUp={endDrag}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPicked(picked === h.guest.id ? null : h.guest.id); } }}
                className={`flex w-full cursor-grab touch-none items-center gap-2 rounded-md border border-solid px-3 py-2 text-left text-sm ${picked === h.guest.id ? "border-gold bg-gold-soft" : "border-line bg-paper"}`}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SIDE_FILL[h.guest.side] }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-ink">{h.guest.name}</span>
                {!h.confirmed && <span className="text-xs text-stone">?</span>}
                <span className="tabular-nums text-xs text-ink-2">{left.length}</span>
              </button>
            </li>
          ))}
          {!shown.length && <li className="py-4 text-center text-xs text-stone">{toSeat.length ? "No one matches." : totalPeople ? "Everyone has a seat." : "No confirmed guests yet. Tick the box above to seat people ahead of their reply."}</li>}
        </ul>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone" aria-label="Key">
          {SIDES.filter((s) => s.id).map((s) => <span key={s.id} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: SIDE_FILL[s.id] }} />{s.label}</span>)}
        </div>
      </aside>

      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button type="button" className="btn-primary btn-sm" disabled={!toSeat.length} onClick={() => {
            const r = autoSeat(plan, tables, households);
            save(r.plan);
            setNote(r.left ? `${r.left} still need a seat: add tables or seats in the layout.` : "Everyone has a seat. Drag anyone to move them.");
          }}>Auto-seat</button>
          <button type="button" className="btn-ghost btn-sm" disabled={!seated.size} onClick={() => window.confirm("Take everyone off their seats at this function?") && save(unseat(plan, [...seated]))}>Clear all</button>
          {problems.some((x) => x.kind === "not-coming") && <button type="button" className="btn-ghost btn-sm" onClick={() => save(tidy(p, fnId, plan))}>Remove people not coming</button>}
          <button type="button" className="btn-ghost btn-sm ml-auto" disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              const { downloadSeating } = await import("../lib/exportSeating");
              await downloadSeating(p, fnId, layout, plan, brand);
            } finally {
              setBusy(false);
            }
          }}>{busy ? "Preparing…" : "Download seating PDF"}</button>
        </div>
        {(note || picked) && (
          <p className="m-0 mb-2 text-sm text-gold-text" role="status">
            {picked ? `Now tap a table for ${byId.get(picked)?.guest.name}.` : note}
          </p>
        )}
        <div className="overflow-hidden rounded-lg border border-line bg-paper-2" style={{ touchAction: "none" }}>
          <svg ref={pz.svg} viewBox={pz.viewBox} className="block aspect-[16/10] w-full select-none" role="application" aria-label="Seating plan. Choose a guest, then a table." tabIndex={0}
            onPointerDown={(e) => { setOpenTable(null); pz.startPan(e); }} onPointerMove={(e) => { pz.movePan(e); }} onPointerUp={pz.endPan} onPointerCancel={pz.endPan}>
            <Room layout={layout} grid={false} />
            {layout.items.map((it) => {
              const isT = tables.some((t) => t.id === it.id);
              const taken = isT ? (plan[it.id] ?? []).filter(Boolean).length : 0;
              return (
                <g key={it.id} data-table={isT ? it.id : undefined} onPointerDown={isT ? (e) => e.stopPropagation() : undefined}>
                  <ItemShape it={it} focusable={isT} selected={openTable === it.id} seatFill={isT ? fillFor(it) : undefined}
                    title={isT ? `${it.label || KINDS[it.kind].label}, ${taken} of ${it.seats} seated` : undefined}
                    handlers={isT ? {
                      onClick: () => (picked ? place(picked, it.id) : setOpenTable(it.id)),
                      onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); picked ? place(picked, it.id) : setOpenTable(it.id); } },
                    } : undefined} />
                </g>
              );
            })}
          </svg>
        </div>

        {table && (
          <section className="mt-3 rounded-lg border border-line bg-card p-4" aria-labelledby="table-title">
            <div className="mb-2 flex items-center gap-2">
              <h3 id="table-title" className="m-0 mr-auto font-serif text-xl text-ink">{table.label || KINDS[table.kind].label} <span className="text-sm text-stone">· {(plan[table.id] ?? []).filter(Boolean).length} of {table.seats}</span></h3>
              <button type="button" className="link-btn" onClick={() => save(unseat(plan, (plan[table.id] ?? []).filter((k): k is string => !!k)))}>Clear table</button>
              <button type="button" className="vd-close" aria-label="Close" onClick={() => setOpenTable(null)}>×</button>
            </div>
            <ol className="m-0 grid gap-1 pl-5 text-sm sm:grid-cols-2">
              {(plan[table.id] ?? []).map((k, i) => (
                <li key={i} className="text-ink">
                  {k ? (
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">{allGuests.get(guestOf(k))?.name ?? "Guest"}</span>
                      <button type="button" className="link-btn text-xs" onClick={() => save(unseat(plan, [k]))}>Unseat</button>
                    </span>
                  ) : <span className="text-stone">Empty</span>}
                </li>
              ))}
            </ol>
          </section>
        )}

        {problems.length > 0 && (
          <section className="mt-3 rounded-lg border border-danger-line bg-danger-soft p-4 text-sm text-danger-ink" aria-label="Needs attention">
            <ul className="m-0 grid gap-1 pl-5">{problems.slice(0, 8).map((x, i) => <li key={i}>{x.text}</li>)}</ul>
            {problems.length > 8 && <p className="m-0 mt-1">…and {problems.length - 8} more.</p>}
          </section>
        )}
      </div>

      {dragging && (
        <div className="pointer-events-none fixed z-50 rounded-md border border-solid border-gold bg-card px-3 py-1.5 text-sm text-ink shadow-lg" style={{ left: dragging.x + 12, top: dragging.y + 12 }}>
          {byId.get(dragging.guestId)?.guest.name}
        </div>
      )}
    </div>
  );
}

