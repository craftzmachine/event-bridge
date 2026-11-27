// The interactive venue floor plan for one function: add tables, stage, mandap and more; drag, rotate, resize;
// undo and redo; start from a template sized for the guests or a plan saved for this venue. Drawn in SVG, in metres.
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { LayoutItem, LayoutKind, Proposal, VenueLayout } from "../types";
import { useConfig } from "../config/context";
import { GRID, ITEMS_MAX, KINDS, PALETTE, ROOM_MAX, ROOM_MIN, STARTERS, bounds, clampToRoom, clashes, cloneItems, emptyLayout, isTable, layoutCapacity, newItem, snap, starterLayout } from "../lib/layout";
import { confirmedHeadcount } from "../lib/guestList";
import { venueCapacity } from "../lib/guests";
import { removeTemplate, saveTemplate, templatesFor } from "../state/layouts";
import { ItemShape, Room } from "./layout/FloorPlan";
import { usePanZoom } from "./layout/usePanZoom";

type Drag =
  | { kind: "move"; start: { x: number; y: number }; orig: Map<string, { x: number; y: number }>; moved: boolean }
  | { kind: "rotate"; id: string }
  | { kind: "resize"; id: string }
  | { kind: "marquee"; start: { x: number; y: number }; now: { x: number; y: number } };

const r2 = (n: number) => Math.round(n * 100) / 100;
const HISTORY = 80;

export default function LayoutEditor({ p, fnId, onSave }: { p: Proposal; fnId: string; onSave: (l: VenueLayout | undefined) => void }) {
  const saved = p.layouts?.[fnId];
  return saved ? <Editor key={fnId} initial={saved} p={p} onSave={onSave} /> : <Start p={p} onPick={onSave} />;
}

/** No plan yet: pick a starter sized for the guests, a saved venue plan, or an empty room. */
function Start({ p, onPick }: { p: Proposal; onPick: (l: VenueLayout) => void }) {
  const guests = Math.max(confirmedHeadcount(p), p.client.guests ?? 0) || 100;
  const [, refresh] = useState(0);
  const templates = templatesFor(p.client.venue);
  return (
    <section className="rounded-lg border border-line bg-card p-5 sm:p-6">
      <h2 className="m-0 font-serif text-2xl text-ink">Start the floor plan</h2>
      <p className="m-0 mt-1 text-sm text-ink-2">Sized for {guests} guests. Everything can be moved, resized and changed afterwards.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {STARTERS.map((s) => (
          <button key={s.id} type="button" className="rounded-md border border-solid border-line bg-paper p-4 text-left transition-colors hover:border-gold" onClick={() => onPick(starterLayout(s.id, guests))}>
            <span className="block font-serif text-xl text-ink">{s.label}</span>
            <span className="mt-1 block text-xs text-ink-2">{s.hint}</span>
          </button>
        ))}
      </div>
      {templates.length > 0 && (
        <>
          <h3 className="m-0 mt-6 text-sm font-medium text-ink-2">Saved plans</h3>
          <ul className="m-0 mt-2 grid list-none gap-2 p-0 sm:grid-cols-2">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
                <button type="button" className="link-btn min-w-0 flex-1 truncate text-left text-ink no-underline" onClick={() => onPick({ ...t.layout, items: cloneItems(t.layout.items) })}>
                  {t.name} <span className="text-xs text-stone">· {t.venue || "any venue"} · {t.layout.items.length} items</span>
                </button>
                <button type="button" className="link-btn link-danger" aria-label={`Delete saved plan ${t.name}`} onClick={() => { removeTemplate(t.id); refresh((n) => n + 1); }}>×</button>
              </li>
            ))}
          </ul>
        </>
      )}
      <button type="button" className="btn-ghost mt-5" onClick={() => onPick(emptyLayout())}>Start with an empty 30 × 20 m room</button>
    </section>
  );
}

function Editor({ initial, p, onSave }: { initial: VenueLayout; p: Proposal; onSave: (l: VenueLayout | undefined) => void }) {
  const { venues } = useConfig();
  const [layout, setLayout] = useState(initial);
  const [sel, setSel] = useState<string[]>([]);
  const [past, setPast] = useState<VenueLayout[]>([]);
  const [future, setFuture] = useState<VenueLayout[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [grid, setGrid] = useState(true);
  const [note, setNote] = useState("");
  const pz = usePanZoom(layout);
  const latest = useRef(layout);
  latest.current = layout;

  /** a finished change: kept for undo and saved on the proposal */
  const commit = (next: VenueLayout, before: VenueLayout = latest.current) => {
    setPast((h) => [...h.slice(-HISTORY + 1), before]);
    setFuture([]);
    setLayout(next);
    onSave(next);
  };
  const undo = () => {
    if (!past.length) return;
    setFuture((f) => [layout, ...f]);
    const prev = past[past.length - 1];
    setPast((h) => h.slice(0, -1));
    setLayout(prev);
    onSave(prev);
  };
  const redo = () => {
    if (!future.length) return;
    setPast((h) => [...h, layout]);
    const [next, ...rest] = future;
    setFuture(rest);
    setLayout(next);
    onSave(next);
  };
  const patchItems = (ids: string[], fn: (it: LayoutItem) => LayoutItem) => commit({ ...layout, items: layout.items.map((it) => (ids.includes(it.id) ? clampToRoom(fn(it), layout) : it)) });

  const selected = layout.items.filter((i) => sel.includes(i.id));
  const one = selected.length === 1 ? selected[0] : null;
  const clash = useMemo(() => clashes(layout.items), [layout.items]);
  const capacity = layoutCapacity(layout);
  const coming = confirmedHeadcount(p);
  const venue = p.client.venue ? venueCapacity(venues.venues, p.client.venue) : null;
  const venueMax = venue?.capacity ?? null;

  const add = (kind: LayoutKind) => {
    if (layout.items.length >= ITEMS_MAX) return setNote(`A plan holds up to ${ITEMS_MAX} items.`);
    const c = { x: pz.view.x + pz.view.w / 2, y: pz.view.y + pz.view.h / 2 };
    const it = clampToRoom(newItem(kind, { x: Math.min(Math.max(c.x, 1), layout.w - 1), y: Math.min(Math.max(c.y, 1), layout.h - 1) }, layout.items), layout);
    commit({ ...layout, items: [...layout.items, it] });
    setSel([it.id]);
  };
  const remove = () => {
    if (!sel.length) return;
    commit({ ...layout, items: layout.items.filter((i) => !sel.includes(i.id)) });
    setSel([]);
  };
  const duplicate = () => {
    if (!selected.length) return;
    const copies = cloneItems(selected, 1, 1).map((c, i) => ({ ...c, label: isTable(c) && selected[i].label?.startsWith("Table ") ? undefined : c.label }));
    const items = [...layout.items];
    for (const c of copies) items.push(clampToRoom({ ...c, label: c.label ?? newItem(c.kind, c, items).label }, layout));
    commit({ ...layout, items });
    setSel(items.slice(-copies.length).map((c) => c.id));
  };
  const nudge = (dx: number, dy: number) => patchItems(sel, (it) => ({ ...it, x: r2(it.x + dx), y: r2(it.y + dy) }));
  const rotateBy = (d: number) => patchItems(sel, (it) => ({ ...it, rot: (((it.rot + d) % 360) + 360) % 360 }));

  // keyboard shortcuts while the editor has focus
  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
    const mod = e.ctrlKey || e.metaKey;
    const step = e.shiftKey ? 1 : GRID;
    if (mod && e.key.toLowerCase() === "z") (e.shiftKey ? redo : undo)();
    else if (mod && e.key.toLowerCase() === "y") redo();
    else if (mod && e.key.toLowerCase() === "d") duplicate();
    else if (mod && e.key.toLowerCase() === "a") setSel(layout.items.map((i) => i.id));
    else if (!sel.length) return;
    else if (e.key === "ArrowLeft") nudge(-step, 0);
    else if (e.key === "ArrowRight") nudge(step, 0);
    else if (e.key === "ArrowUp") nudge(0, -step);
    else if (e.key === "ArrowDown") nudge(0, step);
    else if (e.key.toLowerCase() === "r") rotateBy(e.shiftKey ? -15 : 15);
    else if (e.key === "Delete" || e.key === "Backspace") remove();
    else if (e.key === "Escape") setSel([]);
    else return;
    e.preventDefault();
  };

  // ---- pointer: items move, handles rotate/resize, the floor pans or (with Shift) selects a box ----
  const onItemDown = (e: RPointerEvent<SVGGElement>, it: LayoutItem) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget.ownerSVGElement ?? e.currentTarget).setPointerCapture?.(e.pointerId);
    let ids = sel;
    if (e.shiftKey) ids = sel.includes(it.id) ? sel.filter((x) => x !== it.id) : [...sel, it.id];
    else if (!sel.includes(it.id)) ids = [it.id];
    setSel(ids);
    const orig = new Map(layout.items.filter((i) => ids.includes(i.id)).map((i) => [i.id, { x: i.x, y: i.y }]));
    setDrag({ kind: "move", start: pz.toRoom(e.clientX, e.clientY), orig, moved: false });
    latestBefore.current = layout;
  };
  const latestBefore = useRef(layout);
  const onHandleDown = (e: RPointerEvent<SVGElement>, kind: "rotate" | "resize", id: string) => {
    e.stopPropagation();
    (e.currentTarget.ownerSVGElement ?? e.currentTarget).setPointerCapture?.(e.pointerId);
    latestBefore.current = layout;
    setDrag({ kind, id });
  };
  const onFloorDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (e.shiftKey) {
      const at = pz.toRoom(e.clientX, e.clientY);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* the pointer already ended */
      }
      setDrag({ kind: "marquee", start: at, now: at });
      return;
    }
    setSel([]);
    pz.startPan(e);
  };
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    if (!drag) {
      pz.movePan(e);
      return;
    }
    const at = pz.toRoom(e.clientX, e.clientY);
    if (drag.kind === "move") {
      const dx = at.x - drag.start.x;
      const dy = at.y - drag.start.y;
      if (!drag.moved && Math.hypot(dx, dy) < 0.05) return;
      if (!drag.moved) setDrag({ ...drag, moved: true });
      setLayout((l) => ({
        ...l,
        items: l.items.map((it) => {
          const o = drag.orig.get(it.id);
          if (!o) return it;
          const nx = e.altKey ? o.x + dx : snap(o.x + dx);
          const ny = e.altKey ? o.y + dy : snap(o.y + dy);
          return clampToRoom({ ...it, x: r2(nx), y: r2(ny) }, l);
        }),
      }));
    } else if (drag.kind === "rotate") {
      setLayout((l) => ({
        ...l,
        items: l.items.map((it) => {
          if (it.id !== drag.id) return it;
          let a = (Math.atan2(at.y - it.y, at.x - it.x) * 180) / Math.PI + 90;
          a = e.shiftKey ? Math.round(a) : Math.round(a / 15) * 15;
          return clampToRoom({ ...it, rot: ((a % 360) + 360) % 360 }, l);
        }),
      }));
    } else if (drag.kind === "resize") {
      setLayout((l) => ({
        ...l,
        items: l.items.map((it) => {
          if (it.id !== drag.id) return it;
          const a = (-it.rot * Math.PI) / 180;
          const lx = (at.x - it.x) * Math.cos(a) - (at.y - it.y) * Math.sin(a);
          const ly = (at.x - it.x) * Math.sin(a) + (at.y - it.y) * Math.cos(a);
          let w = Math.max(0.4, snap(Math.abs(lx) * 2));
          let h = Math.max(it.kind === "wall" ? 0.1 : 0.4, snap(Math.abs(ly) * 2));
          if (KINDS[it.kind].round) w = h = Math.max(w, h);
          return clampToRoom({ ...it, w: Math.min(w, l.w), h: Math.min(h, l.h) }, l);
        }),
      }));
    } else if (drag.kind === "marquee") setDrag({ ...drag, now: at });
  };
  const onUp = (e: RPointerEvent<SVGSVGElement>) => {
    pz.endPan(e);
    if (!drag) return;
    if (drag.kind === "marquee") {
      const x0 = Math.min(drag.start.x, drag.now.x);
      const x1 = Math.max(drag.start.x, drag.now.x);
      const y0 = Math.min(drag.start.y, drag.now.y);
      const y1 = Math.max(drag.start.y, drag.now.y);
      setSel(layout.items.filter((it) => {
        const b = bounds(it);
        return b.x0 >= x0 && b.x1 <= x1 && b.y0 >= y0 && b.y1 <= y1;
      }).map((i) => i.id));
    } else if (drag.kind !== "move" || drag.moved) commit(latest.current, latestBefore.current);
    setDrag(null);
  };

  const setRoom = (w: number, h: number) => {
    const next = { ...layout, w: Math.max(ROOM_MIN, Math.min(ROOM_MAX, snap(w, 0.5))), h: Math.max(ROOM_MIN, Math.min(ROOM_MAX, snap(h, 0.5))) };
    commit({ ...next, items: next.items.map((i) => clampToRoom(i, next)) });
  };
  const align = (how: "left" | "centre" | "top" | "middle") =>
    patchItems(sel, (it) => {
      const bs = selected.map(bounds);
      if (how === "left") return { ...it, x: r2(it.x - bounds(it).x0 + Math.min(...bs.map((b) => b.x0))) };
      if (how === "top") return { ...it, y: r2(it.y - bounds(it).y0 + Math.min(...bs.map((b) => b.y0))) };
      if (how === "centre") return { ...it, x: r2(selected.reduce((t, s) => t + s.x, 0) / selected.length) };
      return { ...it, y: r2(selected.reduce((t, s) => t + s.y, 0) / selected.length) };
    });
  const distribute = () => {
    if (selected.length < 3) return;
    const sorted = [...selected].sort((a, b) => a.x - b.x);
    const x0 = sorted[0].x;
    const step = (sorted[sorted.length - 1].x - x0) / (sorted.length - 1);
    const pos = new Map(sorted.map((s, i) => [s.id, r2(x0 + step * i)]));
    patchItems(sel, (it) => ({ ...it, x: pos.get(it.id) ?? it.x }));
  };

  const marquee = drag?.kind === "marquee" ? drag : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]" onKeyDown={onKey}>
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Floor plan tools">
          <ToolBtn label="Undo (Ctrl+Z)" disabled={!past.length} onClick={undo}>↶</ToolBtn>
          <ToolBtn label="Redo (Ctrl+Y)" disabled={!future.length} onClick={redo}>↷</ToolBtn>
          <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
          <ToolBtn label="Zoom out" onClick={() => pz.zoomAt(1.25)}>−</ToolBtn>
          <ToolBtn label="Zoom in" onClick={() => pz.zoomAt(0.8)}>+</ToolBtn>
          <ToolBtn label="Fit the room" onClick={pz.fit}>Fit</ToolBtn>
          <ToolBtn label={grid ? "Hide the grid" : "Show the grid"} pressed={grid} onClick={() => setGrid(!grid)}>Grid</ToolBtn>
          <span className="ml-auto text-xs text-stone">{layout.items.length} items · {capacity} seats{clash.size ? ` · ${clash.size} overlapping` : ""}</span>
        </div>
        <div className="overflow-hidden rounded-lg border border-line bg-paper-2" style={{ touchAction: "none" }}>
          <svg
            ref={pz.svg}
            viewBox={pz.viewBox}
            className="block aspect-[16/10] w-full select-none"
            role="application"
            aria-label={`Floor plan, ${layout.w} by ${layout.h} metres. Select an item, then use the arrow keys to move it, R to rotate, Delete to remove.`}
            tabIndex={0}
            onPointerDown={onFloorDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            style={{ cursor: drag?.kind === "move" ? "grabbing" : "grab" }}
          >
            <Room layout={layout} grid={grid} />
            {layout.items.map((it) => (
              <ItemShape key={it.id} it={it} selected={sel.includes(it.id)} clash={clash.has(it.id)} handlers={{
                onPointerDown: onItemDown,
                onKeyDown: (e, item) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSel(e.shiftKey ? [...new Set([...sel, item.id])] : [item.id]);
                  }
                },
              }} />
            ))}
            {one && <Handles it={one} onDown={onHandleDown} />}
            {marquee && (
              <rect x={Math.min(marquee.start.x, marquee.now.x)} y={Math.min(marquee.start.y, marquee.now.y)} width={Math.abs(marquee.now.x - marquee.start.x)} height={Math.abs(marquee.now.y - marquee.start.y)}
                fill="color-mix(in srgb, var(--gold) 12%, transparent)" stroke="var(--gold)" strokeWidth={0.05} strokeDasharray="0.2 0.1" pointerEvents="none" />
            )}
          </svg>
        </div>
        <p className="m-0 mt-2 text-xs text-stone">
          Drag to move (Alt for no snapping) · drag the round handle to rotate, the square one to resize · Shift-click or Shift-drag the floor to select several · drag the floor or pinch to pan and zoom.
        </p>
      </div>

      <aside className="grid content-start gap-4">
        <section className="rounded-lg border border-line bg-card p-4">
          <h3 className="m-0 mb-3 text-sm font-medium text-ink-2">Add</h3>
          <div className="grid grid-cols-2 gap-1.5">
            {PALETTE.map((k) => (
              <button key={k} type="button" className="rounded-sm border border-solid border-line bg-paper px-2 py-2 text-left text-xs text-ink hover:border-gold" onClick={() => add(k)}>
                {KINDS[k].label}
              </button>
            ))}
          </div>
        </section>

        {one ? (
          <Inspector it={one} onChange={(patch) => patchItems([one.id], (it) => ({ ...it, ...patch }))} onDuplicate={duplicate} onDelete={remove} />
        ) : selected.length > 1 ? (
          <section className="rounded-lg border border-line bg-card p-4">
            <h3 className="m-0 mb-3 text-sm font-medium text-ink-2">{selected.length} selected</h3>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <button type="button" className="btn-ghost btn-sm" onClick={() => align("left")}>Align left</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => align("top")}>Align top</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => align("centre")}>Centre in a column</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => align("middle")}>Line up in a row</button>
              <button type="button" className="btn-ghost btn-sm" disabled={selected.length < 3} onClick={distribute}>Space evenly</button>
              <button type="button" className="btn-ghost btn-sm" onClick={duplicate}>Duplicate</button>
            </div>
            <button type="button" className="link-btn link-danger mt-3" onClick={remove}>Remove {selected.length} items</button>
          </section>
        ) : (
          <section className="rounded-lg border border-line bg-card p-4">
            <h3 className="m-0 mb-3 text-sm font-medium text-ink-2">Room</h3>
            <div className="grid grid-cols-2 gap-2">
              <NumField label="Width (m)" value={layout.w} min={ROOM_MIN} max={ROOM_MAX} onCommit={(w) => setRoom(w, layout.h)} />
              <NumField label="Length (m)" value={layout.h} min={ROOM_MIN} max={ROOM_MAX} onCommit={(h) => setRoom(layout.w, h)} />
            </div>
            <dl className="m-0 mt-4 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
              <dt className="text-ink-2">Seats in the plan</dt><dd className="m-0 text-right tabular-nums text-ink">{capacity}</dd>
              {coming > 0 && <><dt className="text-ink-2">Guests coming</dt><dd className={`m-0 text-right tabular-nums ${coming > capacity ? "text-danger-ink" : "text-ink"}`}>{coming}</dd></>}
              {!!p.client.guests && <><dt className="text-ink-2">Expected guests</dt><dd className="m-0 text-right tabular-nums text-ink">{p.client.guests}</dd></>}
              {venueMax && <><dt className="text-ink-2">Venue's largest space</dt><dd className="m-0 text-right tabular-nums text-ink">{venueMax}</dd></>}
            </dl>
            {coming > capacity && <p className="m-0 mt-2 text-xs text-danger-ink">{coming - capacity} more seats needed for everyone who said yes.</p>}
          </section>
        )}

        <section className="rounded-lg border border-line bg-card p-4">
          <h3 className="m-0 mb-2 text-sm font-medium text-ink-2">Plan</h3>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={() => {
              const name = window.prompt("Name this plan, to reuse it for weddings at this venue:", `${p.client.venue || "Venue"} plan`);
              if (name?.trim()) setNote(saveTemplate({ name: name.trim().slice(0, 80), venue: p.client.venue, layout }) ? "Saved. It's offered when a new plan starts." : "This browser wouldn't save it.");
            }}>Save as a venue plan</button>
            <button type="button" className="link-btn link-danger" onClick={() => {
              if (window.confirm("Clear this floor plan and start again? Seating for this function is cleared too.")) onSave(undefined);
            }}>Start again</button>
          </div>
          {note && <p className="m-0 mt-2 text-xs text-gold-text" role="status">{note}</p>}
        </section>
      </aside>
    </div>
  );
}

function ToolBtn({ label, children, onClick, disabled, pressed }: { label: string; children: React.ReactNode; onClick: () => void; disabled?: boolean; pressed?: boolean }) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}
      className={`grid h-9 min-w-9 place-items-center rounded-sm border border-solid px-2 text-sm ${pressed ? "border-gold bg-gold-soft text-ink" : "border-line bg-card text-ink"}`}>
      {children}
    </button>
  );
}

/** rotate (round) and resize (square) handles drawn in the item's frame */
function Handles({ it, onDown }: { it: LayoutItem; onDown: (e: RPointerEvent<SVGElement>, kind: "rotate" | "resize", id: string) => void }) {
  const r = 0.28;
  return (
    <g transform={`translate(${it.x} ${it.y}) rotate(${it.rot})`}>
      <line x1={0} y1={-it.h / 2} x2={0} y2={-it.h / 2 - 0.8} stroke="var(--gold)" strokeWidth={0.04} pointerEvents="none" />
      <circle cx={0} cy={-it.h / 2 - 0.8} r={r} fill="var(--card)" stroke="var(--gold)" strokeWidth={0.06} style={{ cursor: "grab" }} onPointerDown={(e) => onDown(e, "rotate", it.id)}>
        <title>Drag to rotate</title>
      </circle>
      <rect x={it.w / 2 - r} y={it.h / 2 - r} width={r * 2} height={r * 2} fill="var(--card)" stroke="var(--gold)" strokeWidth={0.06} style={{ cursor: "nwse-resize" }} onPointerDown={(e) => onDown(e, "resize", it.id)}>
        <title>Drag to resize</title>
      </rect>
    </g>
  );
}

function Inspector({ it, onChange, onDuplicate, onDelete }: { it: LayoutItem; onChange: (p: Partial<LayoutItem>) => void; onDuplicate: () => void; onDelete: () => void }) {
  const k = KINDS[it.kind];
  return (
    <section className="rounded-lg border border-line bg-card p-4">
      <h3 className="m-0 mb-3 text-sm font-medium text-ink-2">{k.label}</h3>
      <div className="grid grid-cols-2 gap-2">
        <label className="field col-span-2">
          <span>Label</span>
          <input key={it.id} defaultValue={it.label ?? ""} maxLength={40} onBlur={(e) => e.target.value !== (it.label ?? "") && onChange({ label: e.target.value })} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        </label>
        {isTable(it) && <NumField label="Seats" value={it.seats ?? 0} min={1} max={it.kind === "row" ? 40 : 24} step={1} onCommit={(n) => onChange({ seats: Math.round(n) })} />}
        <NumField label="Rotation (°)" value={it.rot} min={0} max={359} step={15} onCommit={(n) => onChange({ rot: ((Math.round(n) % 360) + 360) % 360 })} />
        <NumField label={k.round ? "Diameter (m)" : "Width (m)"} value={it.w} min={0.2} max={60} step={GRID} onCommit={(n) => onChange(k.round ? { w: n, h: n } : { w: n })} />
        {!k.round && <NumField label="Depth (m)" value={it.h} min={0.1} max={60} step={GRID} onCommit={(n) => onChange({ h: n })} />}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-ghost btn-sm" onClick={onDuplicate}>Duplicate</button>
        <button type="button" className="link-btn link-danger" onClick={onDelete}>Remove</button>
      </div>
    </section>
  );
}

function NumField({ label, value, min, max, step = 0.5, onCommit }: { label: string; value: number; min: number; max: number; step?: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const done = () => {
    const n = Number(text);
    if (Number.isFinite(n) && n !== value) onCommit(Math.max(min, Math.min(max, n)));
    else setText(String(value));
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" inputMode="decimal" min={min} max={max} step={step} value={text} onChange={(e) => setText(e.target.value)} onBlur={done} onKeyDown={(e) => e.key === "Enter" && done()} />
    </label>
  );
}
