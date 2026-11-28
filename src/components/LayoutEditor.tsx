// The interactive venue floor plan for one function, on a Konva canvas (layout/PlanCanvas.tsx): drag tables with
// smart guides, resize and rotate them with handles (seats follow the size), a toolbar over the selection, drag items
// in from the palette, right-click menu, copy/paste, lock, undo/redo. Saved through onSave when a gesture ends.
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { LayoutItem, LayoutKind, Proposal, VenueLayout } from "../types";
import { useConfig } from "../config/context";
import { GRID, ITEMS_MAX, KINDS, PALETTE_GROUPS, ROOM_MAX, SIZE_PRESETS, ROOM_MIN, SEATS_MAX, STARTERS, arrayItems, reorder as reorderItems, clampToRoom, clashes, cloneItems, emptyLayout, isTable, layoutCapacity, newItem, renumberTables, resizeItem, snap, starterLayout } from "../lib/layout";
import { safeFilePart } from "../lib/format";
import { usePlanView } from "./layout/planView";
import { confirmedHeadcount } from "../lib/guestList";
import { venueCapacity } from "../lib/guests";
import { removeTemplate, saveTemplate, templatesFor } from "../state/layouts";
import type { CanvasHandle, MenuRequest } from "./layout/PlanCanvas";
import type { TutorialEvent } from "../lib/planTutorial";
import { fitSeats, setSeatsFor } from "../lib/inventory";
import CountsPanel from "./layout/CountsPanel";
import KindIcon from "./layout/KindIcon";
import LayersPanel from "./layout/LayersPanel";
import { saveBackdrop, useBackdropUrl } from "../state/backdrops";
import { calibrate, placeBackdrop, roomForBackdrop } from "../lib/backdrop";

const PlanCanvas = lazy(() => import("./layout/PlanCanvas"));

const r2 = (n: number) => Math.round(n * 100) / 100;
const HISTORY = 80;

export default function LayoutEditor({ p, fnId, onSave, onEvent, full = false }: { p: Proposal; fnId: string; onSave: (l: VenueLayout | undefined) => void; onEvent?: (e: TutorialEvent) => void; full?: boolean }) {
  const saved = p.layouts?.[fnId];
  return saved ? <Editor key={fnId} initial={saved} p={p} onSave={onSave} onEvent={onEvent} full={full} /> : <div className={full ? "min-h-0 flex-1 overflow-auto" : undefined}><Start p={p} onPick={onSave} /></div>;
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

type Menu = MenuRequest & { left: number; top: number };

function Editor({ initial, p, onSave, onEvent, full }: { initial: VenueLayout; p: Proposal; onSave: (l: VenueLayout | undefined) => void; onEvent?: (e: TutorialEvent) => void; full: boolean }) {
  // fullscreen on a phone: the side panels fold away behind a button
  const [panels, setPanels] = useState(false);
  const [layers, setLayers] = useState(false);
  const { venues, brand } = useConfig();
  const emit = (e: TutorialEvent) => onEvent?.(e);
  const [pop, setPop] = useState<"tables" | "inventory" | "background" | null>(null);
  // the venue drawing: moving it, and setting its scale from a measured wall
  const [moveBackdrop, setMoveBackdrop] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const backdropFile = useRef<HTMLInputElement>(null);
  const [bulk, setBulk] = useState({ seats: 8, guests: 0, kind: "round" as "round" | "rect" | "all" });
  const [layout, setLayout] = useState(initial);
  const [sel, setSel] = useState<string[]>([]);
  const [past, setPast] = useState<VenueLayout[]>([]);
  const [future, setFuture] = useState<VenueLayout[]>([]);
  const [grid, setGrid] = useState(true);
  const [note, setNote] = useState("");
  const [menu, setMenu] = useState<Menu | null>(null);
  const [ghost, setGhost] = useState<{ kind: LayoutKind; x: number; y: number } | null>(null);
  const [view, setView] = usePlanView();
  // phones and tablets start with the hand (one finger pans); a mouse starts with box selection
  const [tool, setTool] = useState<"select" | "hand" | "measure">(() => (window.matchMedia?.("(pointer: coarse)").matches ? "hand" : "select"));
  const [arrayOpen, setArrayOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [find, setFind] = useState("");
  const canvas = useRef<CanvasHandle>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const latest = useRef(layout);
  latest.current = layout;
  const before = useRef<VenueLayout | null>(null);
  const clipboard = useRef<LayoutItem[]>([]);

  /** a finished change: kept for undo and saved on the proposal */
  const commit = (next: VenueLayout, prev: VenueLayout = latest.current) => {
    setPast((h) => [...h.slice(-HISTORY + 1), prev]);
    setFuture([]);
    setLayout(next);
    onSave(next);
  };
  const undo = () => {
    if (!past.length) return;
    emit("undo");
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
  const setItems = (items: LayoutItem[]) => commit({ ...layout, items });
  const backdropUrl = useBackdropUrl(layout.backdrop?.imageId);
  const setBackdrop = (patch: Partial<NonNullable<VenueLayout["backdrop"]>> | null) =>
    commit(patch === null ? { ...layout, backdrop: undefined } : { ...layout, backdrop: { ...layout.backdrop!, ...patch } });
  const uploadBackdrop = async (file: File) => {
    setSaving(true);
    try {
      const { isPdf, pdfPages, prepareBackdrop } = await import("../lib/backdropImage");
      let page = 1;
      if (isPdf(file)) {
        const n = await pdfPages(file);
        if (n > 1) {
          const a = window.prompt(`This PDF has ${n} pages. Which page is the floor plan?`, "1");
          if (a === null) return;
          page = Math.min(n, Math.max(1, Math.round(Number(a)) || 1));
        }
      }
      const img = await prepareBackdrop(file, page);
      const id = `bd-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      await saveBackdrop(id, img.blob);
      const prev = layout.backdrop;
      // the same drawing again (another device): keep where it was and its scale
      const next = prev && backdropUrl === "missing" ? { ...prev, imageId: id, name: file.name } : { ...placeBackdrop(id, img, layout, file.name), ...(prev ? { opacity: prev.opacity } : {}) };
      commit({ ...layout, backdrop: next });
      setNote(prev && backdropUrl === "missing" ? "Drawing restored." : "Drawing added. Use Set the scale on a wall you know, then trace over it.");
    } catch (e) {
      setNote((e as Error).message || "That file couldn't be used.");
    } finally {
      setSaving(false);
    }
  };
  const onMeasured = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    if (!calibrating || !layout.backdrop) return;
    const answer = window.prompt(`You measured ${Math.hypot(b.x - a.x, b.y - a.y).toFixed(2)} m on the drawing. How long is it really, in metres?`);
    setCalibrating(false);
    setTool("select");
    const m = Number(answer?.replace(",", "."));
    if (!answer || !(m > 0)) return setNote("Scale not changed.");
    commit({ ...layout, backdrop: calibrate(layout.backdrop, a, b, m) });
    setNote(`Drawing scaled: that length is now ${m} m.`);
  };
  const patchItems = (ids: string[], fn: (it: LayoutItem) => LayoutItem) => setItems(layout.items.map((it) => (ids.includes(it.id) ? clampToRoom(fn(it), layout) : it)));

  const selected = layout.items.filter((i) => sel.includes(i.id));
  // however several got selected (box, Shift-click, Ctrl+A, the menu), the tutorial counts it
  const many = sel.length > 1;
  useEffect(() => {
    if (many) emit("multi");
  }, [many]);
  const one = selected.length === 1 ? selected[0] : null;
  const movable = sel.filter((id) => !layout.items.find((i) => i.id === id)?.locked);
  const clash = useMemo(() => clashes(layout.items.filter((i) => !i.hidden)), [layout.items]);
  const capacity = layoutCapacity(layout);
  const coming = confirmedHeadcount(p);
  const venueMax = (p.client.venue ? venueCapacity(venues.venues, p.client.venue) : null)?.capacity ?? null;

  const addAt = (kind: LayoutKind, at?: { x: number; y: number }) => {
    if (layout.items.length >= ITEMS_MAX) return setNote(`A plan holds up to ${ITEMS_MAX} items.`);
    const c = at ?? canvas.current?.viewCentre() ?? { x: layout.w / 2, y: layout.h / 2 };
    const it = clampToRoom(newItem(kind, { x: Math.min(Math.max(c.x, 0.5), layout.w - 0.5), y: Math.min(Math.max(c.y, 0.5), layout.h - 0.5) }, layout.items), layout);
    setItems([...layout.items, it]);
    setSel([it.id]);
    emit(`add:${kind}`);
  };
  const remove = (ids = sel) => {
    if (!ids.length) return;
    setItems(layout.items.filter((i) => !ids.includes(i.id)));
    setSel([]);
  };
  const paste = (src: LayoutItem[], at?: { x: number; y: number }) => {
    if (!src.length) return;
    const cx = src.reduce((t, i) => t + i.x, 0) / src.length;
    const cy = src.reduce((t, i) => t + i.y, 0) / src.length;
    const dx = at ? snap(at.x - cx) : 1;
    const dy = at ? snap(at.y - cy) : 1;
    const items = [...layout.items];
    for (const c of cloneItems(src, dx, dy)) items.push(clampToRoom({ ...c, locked: false, label: isTable(c) && c.label?.startsWith("Table ") ? newItem(c.kind, c, items).label : c.label }, layout));
    setItems(items);
    setSel(items.slice(-src.length).map((c) => c.id));
  };
  const duplicate = (ids = sel) => paste(layout.items.filter((i) => ids.includes(i.id)));
  const nudge = (dx: number, dy: number) => patchItems(movable, (it) => ({ ...it, x: r2(it.x + dx), y: r2(it.y + dy) }));
  const rotateBy = (d: number, ids = movable) => patchItems(ids, (it) => ({ ...it, rot: (((it.rot + d) % 360) + 360) % 360 }));
  const setSeats = (it: LayoutItem, n: number) => {
    patchItems([it.id], (x) => ({ ...x, seats: Math.max(1, Math.min(SEATS_MAX[x.kind] ?? 24, n)) }));
    emit("seats");
  };
  // chairs for many tables at once: the selection, or every table of a kind
  const bulkIds = (kind: "round" | "rect" | "all") =>
    (sel.length > 1 ? selected : layout.items).filter((i) => isTable(i) && !i.locked && (kind === "all" || i.kind === kind)).map((i) => i.id);
  const applySeats = (ids: string[], n: number) => {
    if (!ids.length) return setNote("No tables to change.");
    setItems(setSeatsFor(layout.items, ids, n));
    setNote(`${ids.length} ${ids.length === 1 ? "item" : "items"} set to ${n} seats.`);
    emit("bulkSeats");
  };
  const seatGuests = (ids: string[], n: number) => {
    if (!ids.length) return setNote("No tables to change.");
    const r = fitSeats(layout.items, ids, n);
    setItems(r.items);
    setNote(r.short ? `${r.short} guests don't fit: add tables or use bigger ones.` : `${n} seats spread over ${ids.length} tables.`);
    emit("bulkSeats");
  };
  const toggleLock = (ids = sel) => {
    const lock = layout.items.some((i) => ids.includes(i.id) && !i.locked);
    setItems(layout.items.map((i) => (ids.includes(i.id) ? { ...i, locked: lock || undefined } : i)));
  };
  const reorder = (ids: string[], how: "front" | "back" | "forward" | "backward") => {
    if (ids.length) setItems(reorderItems(layout.items, ids, how));
  };

  // keyboard shortcuts while the editor has focus
  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
    const mod = e.ctrlKey || e.metaKey;
    const step = e.shiftKey ? 1 : GRID;
    const key = e.key.toLowerCase();
    if (mod && key === "z") (e.shiftKey ? redo : undo)();
    else if (mod && key === "y") redo();
    else if (mod && key === "d") duplicate();
    else if (mod && key === "c") clipboard.current = selected.map((i) => ({ ...i }));
    else if (mod && key === "v") paste(clipboard.current);
    else if (mod && key === "a") setSel(layout.items.filter((i) => !i.hidden).map((i) => i.id));
    else if (mod && e.key === "]") reorder(sel, e.shiftKey ? "front" : "forward");
    else if (mod && e.key === "[") reorder(sel, e.shiftKey ? "back" : "backward");
    else if (mod && (e.code === "BracketRight" || e.code === "BracketLeft")) reorder(sel, e.code === "BracketRight" ? (e.shiftKey ? "front" : "forward") : e.shiftKey ? "back" : "backward");
    else if (e.key === "Escape") {
      setMenu(null);
      setSel([]);
      if (tool === "measure") setTool("select");
      setCalibrating(false);
      setMoveBackdrop(false);
    } else if (!mod && key === "m") setTool((t) => (t === "measure" ? "select" : "measure"));
    else if (!mod && key === "v") setTool("select");
    else if (!mod && key === "h") setTool("hand");
    else if (!mod && key === "l") setLayers((x) => !x);
    else if (!sel.length) return;
    else if (e.key === "ArrowLeft") nudge(-step, 0);
    else if (e.key === "ArrowRight") nudge(step, 0);
    else if (e.key === "ArrowUp") nudge(0, -step);
    else if (e.key === "ArrowDown") nudge(0, step);
    else if (key === "r") rotateBy(e.shiftKey ? -15 : 15);
    else if (e.key === "Delete" || e.key === "Backspace") remove(movable);
    else if (one && isTable(one) && (e.key === "+" || e.key === "=")) setSeats(one, (one.seats ?? 0) + 1);
    else if (one && isTable(one) && e.key === "-") setSeats(one, (one.seats ?? 0) - 1);
    else return;
    e.preventDefault();
  };

  // live changes while dragging or resizing, kept out of the undo history until the gesture ends
  const onEdit = (items: LayoutItem[], phase: "live" | "end") => {
    if (phase === "live") {
      before.current ??= latest.current;
      setLayout({ ...latest.current, items });
      return;
    }
    const prev = before.current ?? latest.current;
    before.current = null;
    commit({ ...latest.current, items }, prev);
    // tell the tutorial what kind of change it was
    const was = new Map(prev.items.map((i) => [i.id, i]));
    const changed = items.filter((i) => was.get(i.id) !== i && was.has(i.id));
    if (changed.some((i) => was.get(i.id)!.w !== i.w || was.get(i.id)!.h !== i.h)) emit("resize");
    else if (changed.some((i) => was.get(i.id)!.rot !== i.rot)) emit("rotate");
    else if (changed.some((i) => was.get(i.id)!.x !== i.x || was.get(i.id)!.y !== i.y)) emit("move");
  };

  // palette: click adds in the middle of the view; drag drops it where you let go
  const paletteDown = (e: RPointerEvent<HTMLButtonElement>, kind: LayoutKind) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const start = { x: e.clientX, y: e.clientY };
    let dragging = false;
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 6) dragging = true;
      if (dragging) setGhost({ kind, x: ev.clientX, y: ev.clientY });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setGhost(null);
      if (!dragging) return addAt(kind);
      const at = canvas.current?.toRoom(ev.clientX, ev.clientY);
      if (at) addAt(kind, { x: snap(at.x), y: snap(at.y) });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const openMenu = (m: MenuRequest) => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r) return;
    if (m.itemId && !sel.includes(m.itemId)) setSel([m.itemId]);
    setMenu({ ...m, left: Math.min(m.clientX - r.left, r.width - 220), top: m.clientY - r.top });
  };
  useEffect(() => {
    if (!menu) {
      return;
    }
    const close = (e: Event) => {
      if (!(e.target as HTMLElement).closest?.("[data-plan-menu]")) setMenu(null);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  const setRoom = (w: number, h: number) => {
    const next = { ...layout, w: Math.max(ROOM_MIN, Math.min(ROOM_MAX, snap(w, 0.5))), h: Math.max(ROOM_MIN, Math.min(ROOM_MAX, snap(h, 0.5))) };
    commit({ ...next, items: next.items.map((i) => clampToRoom(i, next)) });
  };

  return (
    <div ref={wrap} className={full ? "relative grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-3 lg:grid-cols-[minmax(0,1fr)_280px] lg:grid-rows-[minmax(0,1fr)]" : "relative grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]"} onKeyDown={onKey}>
      <div className={full ? "flex min-h-0 min-w-0 flex-col" : "min-w-0"}>
        <div className="mb-2 flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Floor plan tools">
          <span data-tutorial="undo"><ToolBtn label="Undo (Ctrl+Z)" disabled={!past.length} onClick={undo}>↶</ToolBtn></span>
          <ToolBtn label="Redo (Ctrl+Y)" disabled={!future.length} onClick={redo}>↷</ToolBtn>
          <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
          <ToolBtn label="Zoom out" onClick={() => canvas.current?.zoomBy(0.8)}>−</ToolBtn>
          <ToolBtn label="Zoom in" onClick={() => canvas.current?.zoomBy(1.25)}>+</ToolBtn>
          <ToolBtn label="Fit the room" onClick={() => canvas.current?.fit()}>Fit</ToolBtn>
          <ToolBtn label={grid ? "Hide the grid" : "Show the grid"} pressed={grid} onClick={() => setGrid(!grid)}>Grid</ToolBtn>
          <ToolBtn label="Rulers" pressed={view.rulers} onClick={() => setView({ rulers: !view.rulers })}>Rulers</ToolBtn>
          <ToolBtn label={view.look === "realistic" ? "Show plain shapes" : "Show furniture"} pressed={view.look === "realistic"} onClick={() => setView({ look: view.look === "realistic" ? "simple" : "realistic" })}>
            {view.look === "realistic" ? "Realistic" : "Simple"}
          </ToolBtn>
          <span className="flex overflow-hidden rounded-sm border border-solid border-line" role="group" aria-label="Drag on the floor to">
            <ToolBtn bare label="Select: drag a box to select (V)" pressed={tool === "select"} onClick={() => setTool("select")}>⬚ Select</ToolBtn>
            <ToolBtn bare label="Hand: drag to move the view (H, or hold Space)" pressed={tool === "hand"} onClick={() => setTool("hand")}>✋ Hand</ToolBtn>
          </span>
          <ToolBtn label="Measure a distance (M)" pressed={tool === "measure"} onClick={() => setTool(tool === "measure" ? "select" : "measure")}>📏 Measure</ToolBtn>
          <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
          <ToolBtn label="Add a grid of tables" onClick={() => setArrayOpen(true)}>▦ Grid of tables</ToolBtn>
          <ToolBtn label="Number the tables left to right, top to bottom" onClick={() => setItems(renumberTables(layout.items))}>1·2·3 Renumber</ToolBtn>
          <span data-tutorial="bulk-seats"><ToolBtn label="Set chairs for many tables" pressed={pop === "tables"} onClick={() => setPop(pop === "tables" ? null : "tables")}>Tables ▾</ToolBtn></span>
          <ToolBtn label="Venue drawing to trace over" pressed={pop === "background" || moveBackdrop || calibrating} onClick={() => setPop(pop === "background" ? null : "background")}>🗺 Background ▾</ToolBtn>
          <span data-tutorial="inventory"><ToolBtn label="Inventory for the vendor" pressed={pop === "inventory"} onClick={() => setPop(pop === "inventory" ? null : "inventory")}>Inventory ▾</ToolBtn></span>
          <ToolBtn label="Download the plan as an image" disabled={saving} onClick={async () => {
            setSaving(true);
            try {
              const { downloadPlanImage } = await import("../lib/planImage");
              const title = [p.client.name || "Floor plan", p.client.venue].filter(Boolean).join(" · ");
              await downloadPlanImage(layout, {}, title, `Floor_plan_${safeFilePart(p.client.name) || "event"}.png`);
            } catch (e) {
              setNote((e as Error).message);
            } finally {
              setSaving(false);
            }
          }}>{saving ? "Saving…" : "⤓ Image"}</ToolBtn>
          {full && <span className="lg:hidden"><ToolBtn label={panels ? "Hide the side panels" : "Show the side panels"} pressed={panels} onClick={() => setPanels(!panels)}>☰ Panels</ToolBtn></span>}
          <ToolBtn label="Layers: every item, show, hide, lock and order (L)" pressed={layers} onClick={() => { setLayers(!layers); if (!layers) setPanels(true); }}>☰ Layers</ToolBtn>
          <span className="ml-auto text-xs text-stone" aria-live="polite">{layout.items.length} items · {capacity} seats{clash.size ? ` · ${clash.size} overlapping` : ""}</span>
        </div>
        {pop === "tables" && (
          <div data-plan-menu className="mb-2 grid gap-3 rounded-md border border-solid border-line bg-card p-3 text-sm sm:grid-cols-2">
            <div className="grid gap-2">
              <p className="m-0 text-xs text-ink-2">{sel.length > 1 ? `The ${selected.length} selected items` : "Every table of a kind"}</p>
              <div className="flex flex-wrap items-center gap-2">
                <select className="rounded-sm border border-line bg-card px-2 py-1.5" aria-label="Which tables" value={bulk.kind} onChange={(e) => setBulk({ ...bulk, kind: e.target.value as typeof bulk.kind })}>
                  <option value="round">Round tables</option>
                  <option value="rect">Long tables</option>
                  <option value="all">All tables and rows</option>
                </select>
                <span className="text-ink-2">to</span>
                <input className="w-16 rounded-sm border border-line bg-card px-2 py-1.5" type="number" min={1} max={40} aria-label="Seats each" value={bulk.seats} onChange={(e) => setBulk({ ...bulk, seats: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
                <span className="text-ink-2">seats</span>
                <button type="button" className="btn-primary btn-sm" onClick={() => applySeats(bulkIds(bulk.kind), bulk.seats)}>Set</button>
              </div>
            </div>
            <div className="grid gap-2">
              <p className="m-0 text-xs text-ink-2">Seat a number of guests across those tables</p>
              <div className="flex flex-wrap items-center gap-2">
                <input className="w-20 rounded-sm border border-line bg-card px-2 py-1.5" type="number" min={1} aria-label="Guests" placeholder={String(Math.max(coming, p.client.guests ?? 0) || 100)} value={bulk.guests || ""} onChange={(e) => setBulk({ ...bulk, guests: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                <span className="text-ink-2">guests</span>
                <button type="button" className="btn-ghost btn-sm" onClick={() => seatGuests(bulkIds(bulk.kind), bulk.guests || Math.max(coming, p.client.guests ?? 0) || 100)}>Spread seats</button>
              </div>
            </div>
          </div>
        )}
        {pop === "background" && (
          <div data-plan-menu className="mb-2 grid gap-3 rounded-md border border-solid border-line bg-card p-3 text-sm">
            <input ref={backdropFile} type="file" accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" hidden
              onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void uploadBackdrop(file); }} />
            {!layout.backdrop ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-auto text-ink-2">Put the venue's floor plan (a photo, scan or PDF page) under your plan, set its scale from one wall you know, and trace over it.</span>
                <button type="button" className="btn-primary btn-sm" disabled={saving} onClick={() => backdropFile.current?.click()}>{saving ? "Preparing…" : "Upload image or PDF"}</button>
              </div>
            ) : (
              <>
                {backdropUrl === "missing" && (
                  <p className="m-0 rounded-sm bg-danger-soft px-2 py-1.5 text-xs text-danger-ink">
                    The drawing{layout.backdrop.name ? ` "${layout.backdrop.name}"` : ""} isn't on this device. Upload it again; it goes back where it was, at the same scale.
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-ink-2">
                    Opacity
                    <input type="range" min={10} max={100} step={5} value={Math.round(layout.backdrop.opacity * 100)} aria-label="Drawing opacity"
                      onChange={(e) => setLayout({ ...layout, backdrop: { ...layout.backdrop!, opacity: Number(e.target.value) / 100 } })}
                      onPointerUp={() => onSave(latest.current)} onKeyUp={() => onSave(latest.current)} />
                  </label>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setBackdrop({ hidden: layout.backdrop!.hidden ? undefined : true })}>{layout.backdrop.hidden ? "Show" : "Hide"}</button>
                  <button type="button" className={`btn-sm ${moveBackdrop ? "btn-primary" : "btn-ghost"}`} aria-pressed={moveBackdrop} disabled={!!layout.backdrop.hidden} onClick={() => { setMoveBackdrop(!moveBackdrop); setSel([]); }}>{moveBackdrop ? "Done moving" : "Move it"}</button>
                  <button type="button" className={`btn-sm ${calibrating ? "btn-primary" : "btn-ghost"}`} aria-pressed={calibrating} disabled={!!layout.backdrop.hidden} onClick={() => {
                    const on = !calibrating;
                    setCalibrating(on);
                    setTool(on ? "measure" : "select");
                    setMoveBackdrop(false);
                    if (on) setNote("Drag along a wall or length you know on the drawing; you'll be asked how long it really is.");
                  }}>📏 Set the scale</button>
                  <button type="button" className="btn-ghost btn-sm" title="Resize the room to the drawing and move the drawing to the corner" onClick={() => commit(roomForBackdrop(layout))}>Fit the room to it</button>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-stone">
                  <span className="mr-auto">{layout.backdrop.name ? `${layout.backdrop.name} · ` : ""}{layout.backdrop.w} × {layout.backdrop.h} m on the plan</span>
                  <button type="button" className="link-btn" disabled={saving} onClick={() => backdropFile.current?.click()}>{backdropUrl === "missing" ? "Upload it again" : "Replace"}</button>
                  <button type="button" className="link-btn link-danger" onClick={() => { setMoveBackdrop(false); setCalibrating(false); setBackdrop(null); }}>Remove</button>
                </div>
              </>
            )}
          </div>
        )}
        {pop === "inventory" && (
          <div data-plan-menu className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-solid border-line bg-card p-3 text-sm">
            <span className="mr-auto text-ink-2">Chairs, tables, linens, centrepieces and décor with sizes, for the rental vendor.</span>
            {(["pdf", "xlsx"] as const).map((k) => (
              <button key={k} type="button" className="btn-ghost btn-sm" disabled={saving} onClick={async () => {
                setSaving(true);
                try {
                  const { downloadInventory } = await import("../lib/exportInventory");
                  await downloadInventory(k, p.client.name || "Floor plan", p.client.venue, layout, brand);
                  emit("inventory");
                } catch (e) {
                  setNote((e as Error).message);
                } finally {
                  setSaving(false);
                }
              }}>{k === "pdf" ? "⤓ PDF" : "⤓ Excel"}</button>
            ))}
          </div>
        )}
        <div tabIndex={0} data-tutorial="canvas" className={`rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-gold${full ? " min-h-0 flex-1" : ""}`}>
          <Suspense fallback={<div className="grid h-80 place-items-center rounded-lg border border-line bg-paper-2 text-sm text-stone">Opening the floor plan…</div>}>
            <PlanCanvas
              ref={canvas}
              fill={full}
              backdrop={layout.backdrop && !layout.backdrop.hidden && backdropUrl && backdropUrl !== "missing" ? { url: backdropUrl, ...layout.backdrop } : null}
              backdropEdit={moveBackdrop}
              onBackdropMove={(x, y) => setBackdrop({ x, y })}
              onMeasured={onMeasured}
              layout={layout}
              mode="edit"
              selected={sel}
              clash={clash}
              grid={grid}
              look={view.look}
              rulers={view.rulers}
              minimap
              tool={tool}
              ariaLabel={`Floor plan, ${layout.w} by ${layout.h} metres. Select an item, then use the arrow keys to move it, R to rotate, plus and minus for seats, Delete to remove.`}
              onSelect={(ids) => { setSel(ids); setMenu(null); }}
              onEdit={onEdit}
              onMenu={openMenu}
              overlay={(b) => (
                <SelectionBar box={b} items={selected} onSeats={(n) => one && setSeats(one, n)} onRotate={() => rotateBy(90)} onDuplicate={() => duplicate()} onLock={() => toggleLock()} onDelete={() => remove()} />
              )}
            />
          </Suspense>
        </div>
        <p className={full ? "sr-only" : "m-0 mt-2 text-xs text-stone"}>
          Click a table or any of its chairs to select it · drag across empty floor to select several (left to right: wholly inside; right to left: anything touched; Shift adds) · Alt-click picks the item underneath · drag to move (hold Alt to place freely) · handles resize, the top knob rotates · Space-drag, the middle button, the Hand tool or two fingers pan · scroll or pinch to zoom · right-click for more.
        </p>
        {/* the same items as a list, for keyboards and screen readers */}
        <ul className="sr-only">
          {layout.items.map((it) => (
            <li key={it.id}>
              <button type="button" aria-pressed={sel.includes(it.id)} onClick={() => setSel([it.id])}>
                {`${it.label || KINDS[it.kind].label}${it.seats ? `, ${it.seats} seats` : ""}, at ${it.x} by ${it.y} metres${it.locked ? ", locked" : ""}`}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <aside className={full ? `grid content-start gap-4 overflow-y-auto lg:min-h-0 ${panels ? "max-lg:max-h-[42dvh]" : "max-lg:hidden"}` : "grid content-start gap-4"}>
        <section className="rounded-lg border border-line bg-card p-4">
          <h3 className="m-0 mb-1 text-sm font-medium text-ink-2">Add</h3>
          <p className="m-0 mb-2 text-xs text-stone">Click, or drag onto the plan.</p>
          <input className="search mb-2" type="search" placeholder="Find an item" aria-label="Find an item to add" value={find} onChange={(e) => setFind(e.target.value)} />
          <div className="grid gap-3" data-tutorial="palette">
            {PALETTE_GROUPS.map((g) => {
              const kinds = g.kinds.filter((k) => !find.trim() || KINDS[k].label.toLowerCase().includes(find.trim().toLowerCase()));
              if (!kinds.length) return null;
              return (
                <div key={g.title}>
                  <p className="m-0 mb-1 text-[11px] font-medium text-stone">{g.title}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {kinds.map((k) => (
                      <button key={k} type="button" data-tutorial={`add-${k}`} className="flex touch-none items-center gap-2 rounded-sm border border-solid border-line bg-paper px-2 py-2 text-left text-xs text-ink hover:border-gold"
                        onPointerDown={(e) => paletteDown(e, k)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); addAt(k); } }}>
                        <KindIcon kind={k} />
                        {KINDS[k].label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {one ? (
          <Inspector it={one} onPreset={(s) => { patchItems([one.id], (it) => ({ ...it, w: s.w, h: s.h, ...(s.seats ? { seats: s.seats } : {}) })); emit("preset"); }} onChange={(patch) => patchItems([one.id], (it) => (patch.w !== undefined || patch.h !== undefined ? { ...resizeItem({ ...it, ...patch }, patch.w ?? it.w, patch.h ?? it.h, false), ...("seats" in patch ? { seats: patch.seats } : {}) } : { ...it, ...patch }))}
            onDuplicate={() => duplicate()} onDelete={() => remove()} onLock={() => toggleLock()} />
        ) : selected.length > 1 ? (
          <section className="rounded-lg border border-line bg-card p-4">
            <h3 className="m-0 mb-3 text-sm font-medium text-ink-2">{selected.length} selected</h3>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <button type="button" className="btn-ghost btn-sm" onClick={() => align("left")}>Align left</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => align("top")}>Align top</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => align("centre")}>Centre in a column</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => align("middle")}>Line up in a row</button>
              <button type="button" className="btn-ghost btn-sm" disabled={selected.length < 3} onClick={distribute}>Space evenly</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => duplicate()}>Duplicate</button>
            </div>
            {selected.some(isTable) && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <span className="text-ink-2">Seats each</span>
                <input className="w-16 rounded-sm border border-line bg-card px-2 py-1" type="number" min={1} max={40} aria-label="Seats each for the selected tables" value={bulk.seats} onChange={(e) => setBulk({ ...bulk, seats: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
                <button type="button" className="btn-ghost btn-sm" onClick={() => applySeats(selected.filter((i) => isTable(i) && !i.locked).map((i) => i.id), bulk.seats)}>Apply</button>
              </div>
            )}
            <button type="button" className="link-btn link-danger mt-3" onClick={() => remove()}>Remove {selected.length} items</button>
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

        {layers && (
          <LayersPanel items={layout.items} sel={sel} onSelect={setSel} onClose={() => setLayers(false)} onOrder={(how) => reorder(sel, how)}
            onPatch={(id, patch) => setItems(layout.items.map((i) => (i.id === id ? { ...i, ...patch } : i)))} />
        )}

        <CountsPanel layout={layout} onOpen={() => emit("inventory")} />

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

      {menu && (
        <div data-plan-menu role="menu" className="absolute z-30 grid w-52 gap-0.5 rounded-md border border-solid border-line bg-card p-1 text-sm" style={{ left: menu.left, top: menu.top }}>
          {menu.itemId ? (
            <>
              <MenuItem onClick={() => { duplicate(); setMenu(null); }} hint="Ctrl+D">Duplicate</MenuItem>
              <MenuItem onClick={() => { clipboard.current = selected.map((i) => ({ ...i })); setMenu(null); }} hint="Ctrl+C">Copy</MenuItem>
              <MenuItem onClick={() => { rotateBy(90, sel); setMenu(null); }} hint="R">Rotate 90°</MenuItem>
              <MenuItem onClick={() => { reorder(sel, "forward"); setMenu(null); }} hint="Ctrl+]">Bring forward</MenuItem>
              <MenuItem onClick={() => { reorder(sel, "front"); setMenu(null); }} hint="Ctrl+Shift+]">Bring to front</MenuItem>
              <MenuItem onClick={() => { reorder(sel, "backward"); setMenu(null); }} hint="Ctrl+[">Send backward</MenuItem>
              <MenuItem onClick={() => { reorder(sel, "back"); setMenu(null); }} hint="Ctrl+Shift+[">Send to back</MenuItem>
              <MenuItem onClick={() => { toggleLock(); setMenu(null); }}>{selected.every((i) => i.locked) ? "Unlock" : "Lock in place"}</MenuItem>
              <MenuItem danger onClick={() => { remove(); setMenu(null); }} hint="Del">Delete</MenuItem>
            </>
          ) : (
            <>
              <MenuItem disabled={!clipboard.current.length} onClick={() => { paste(clipboard.current, menu.room); setMenu(null); }} hint="Ctrl+V">Paste here</MenuItem>
              <MenuItem onClick={() => { addAt("round", menu.room); setMenu(null); }}>Add a round table here</MenuItem>
              <MenuItem onClick={() => { addAt("rect", menu.room); setMenu(null); }}>Add a long table here</MenuItem>
              <MenuItem onClick={() => { setSel(layout.items.filter((i) => !i.hidden).map((i) => i.id)); setMenu(null); }} hint="Ctrl+A">Select all</MenuItem>
              <MenuItem onClick={() => { setItems(renumberTables(layout.items)); setMenu(null); }}>Renumber tables</MenuItem>
              <MenuItem onClick={() => { canvas.current?.fit(); setMenu(null); }}>Fit the room</MenuItem>
            </>
          )}
        </div>
      )}
      {arrayOpen && (
        <ArrayDialog onClose={() => setArrayOpen(false)} onAdd={(kind, rows, cols, gapX, gapY, seats) => {
          const at = canvas.current?.viewCentre() ?? { x: layout.w / 2, y: layout.h / 2 };
          const made = arrayItems(kind, rows, cols, gapX, gapY, at, layout.items, seats).map((i) => clampToRoom(i, layout));
          if (layout.items.length + made.length > ITEMS_MAX) return setNote(`A plan holds up to ${ITEMS_MAX} items.`);
          setItems([...layout.items, ...made]);
          setSel(made.map((i) => i.id));
          setArrayOpen(false);
        }} />
      )}
      {ghost && (
        <div className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-md border border-solid border-gold bg-card px-3 py-1.5 text-sm text-ink" style={{ left: ghost.x + 12, top: ghost.y + 12 }}>
          <KindIcon kind={ghost.kind} /> {KINDS[ghost.kind].label}
        </div>
      )}
    </div>
  );

  function align(how: "left" | "centre" | "top" | "middle") {
    const xs = selected.map((s) => s.x - s.w / 2);
    const ys = selected.map((s) => s.y - s.h / 2);
    patchItems(movable, (it) => {
      if (how === "left") return { ...it, x: r2(Math.min(...xs) + it.w / 2) };
      if (how === "top") return { ...it, y: r2(Math.min(...ys) + it.h / 2) };
      if (how === "centre") return { ...it, x: r2(selected.reduce((t, s) => t + s.x, 0) / selected.length) };
      return { ...it, y: r2(selected.reduce((t, s) => t + s.y, 0) / selected.length) };
    });
  }
  function distribute() {
    if (selected.length < 3) return;
    const sorted = [...selected].sort((a, b) => a.x - b.x);
    const x0 = sorted[0].x;
    const step = (sorted[sorted.length - 1].x - x0) / (sorted.length - 1);
    const pos = new Map(sorted.map((s, i) => [s.id, r2(x0 + step * i)]));
    patchItems(movable, (it) => ({ ...it, x: pos.get(it.id) ?? it.x }));
  }
}

/** the toolbar floating above the selection: seats −/+, rotate, duplicate, lock, delete */
function SelectionBar({ box, items, onSeats, onRotate, onDuplicate, onLock, onDelete }: {
  box: { left: number; top: number; right: number; bottom: number };
  items: LayoutItem[];
  onSeats: (n: number) => void;
  onRotate: () => void;
  onDuplicate: () => void;
  onLock: () => void;
  onDelete: () => void;
}) {
  const one = items.length === 1 ? items[0] : null;
  const locked = items.every((i) => i.locked);
  const top = box.top - 52 < 4 ? box.bottom + 10 : box.top - 52;
  const btn = "grid h-8 min-w-8 place-items-center rounded-sm border-0 bg-transparent px-2 text-sm text-ink hover:bg-gold-soft disabled:opacity-40";
  return (
    <div data-tutorial="selection-bar" className="absolute z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-md border border-solid border-line bg-card p-1" style={{ left: Math.max(120, (box.left + box.right) / 2), top }}
      onPointerDown={(e) => e.stopPropagation()} role="toolbar" aria-label="Selected item">
      {one && isTable(one) && (
        <>
          <button type="button" className={btn} aria-label="One seat fewer" disabled={(one.seats ?? 0) <= 1 || one.locked} onClick={() => onSeats((one.seats ?? 0) - 1)}>−</button>
          <span className="min-w-[4.5rem] text-center text-xs tabular-nums text-ink-2">{one.seats} seats</span>
          <button type="button" className={btn} aria-label="One seat more" disabled={(one.seats ?? 0) >= (SEATS_MAX[one.kind] ?? 24) || one.locked} onClick={() => onSeats((one.seats ?? 0) + 1)}>+</button>
          <span className="mx-0.5 h-5 w-px bg-line" aria-hidden="true" />
        </>
      )}
      {!one && <span className="px-2 text-xs text-ink-2">{items.length} selected</span>}
      <button type="button" className={btn} title="Rotate 90°" aria-label="Rotate 90 degrees" disabled={locked} onClick={onRotate}>⟳</button>
      <button type="button" className={btn} title="Duplicate (Ctrl+D)" aria-label="Duplicate" onClick={onDuplicate}>⧉</button>
      <button type="button" className={btn} title={locked ? "Unlock" : "Lock in place"} aria-label={locked ? "Unlock" : "Lock in place"} onClick={onLock}>{locked ? "🔓" : "🔒"}</button>
      <button type="button" className={`${btn} text-danger-ink`} title="Delete" aria-label="Delete" onClick={onDelete}>🗑</button>
    </div>
  );
}

function MenuItem({ children, onClick, hint, danger, disabled }: { children: React.ReactNode; onClick: () => void; hint?: string; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" role="menuitem" disabled={disabled} onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 rounded-sm border-0 bg-transparent px-3 py-1.5 text-left hover:bg-gold-soft disabled:opacity-40 ${danger ? "text-danger-ink" : "text-ink"}`}>
      <span>{children}</span>
      {hint && <span className="text-xs text-stone">{hint}</span>}
    </button>
  );
}

function ToolBtn({ label, children, onClick, disabled, pressed, bare }: { label: string; children: React.ReactNode; onClick: () => void; disabled?: boolean; pressed?: boolean; bare?: boolean }) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}
      className={`grid h-9 min-w-9 place-items-center px-2 text-sm ${bare ? "rounded-none border-0" : "rounded-sm border border-solid"} ${pressed ? "border-gold bg-gold-soft text-ink" : "border-line bg-card text-ink"}`}>
      {children}
    </button>
  );
}

function Inspector({ it, onChange, onPreset, onDuplicate, onDelete, onLock }: { it: LayoutItem; onChange: (p: Partial<LayoutItem>) => void; onPreset: (s: { w: number; h: number; seats?: number }) => void; onDuplicate: () => void; onDelete: () => void; onLock: () => void }) {
  const k = KINDS[it.kind];
  const presets = SIZE_PRESETS[it.kind] ?? [];
  return (
    <section className="rounded-lg border border-line bg-card p-4">
      <h3 className="m-0 mb-3 text-sm font-medium text-ink-2">{k.label}{it.locked ? " · locked" : ""}</h3>
      <div className="grid grid-cols-2 gap-2">
        <label className="field col-span-2">
          <span>Label</span>
          <input key={it.id} defaultValue={it.label ?? ""} maxLength={40} onBlur={(e) => e.target.value !== (it.label ?? "") && onChange({ label: e.target.value })} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        </label>
        {isTable(it) && <NumField label="Seats" value={it.seats ?? 0} min={1} max={SEATS_MAX[it.kind] ?? 24} step={1} onCommit={(n) => onChange({ seats: Math.round(n) })} />}
        <NumField label="Rotation (°)" value={it.rot} min={0} max={359} step={15} onCommit={(n) => onChange({ rot: ((Math.round(n) % 360) + 360) % 360 })} />
        <NumField label={k.round ? "Diameter (m)" : "Width (m)"} value={it.w} min={0.4} max={60} step={GRID} onCommit={(n) => onChange(k.round ? { w: n, h: n } : { w: n })} />
        {!k.round && <NumField label="Length (m)" value={it.h} min={0.1} max={60} step={GRID} onCommit={(n) => onChange({ h: n })} />}
      </div>
      {presets.length > 0 && (
        <div className="mt-3" data-tutorial="presets">
          <p className="m-0 mb-1 text-xs text-ink-2">Common sizes</p>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((s) => {
              const on = Math.abs(s.w - it.w) < 0.01 && Math.abs(s.h - it.h) < 0.01;
              return (
                <button key={s.label} type="button" aria-pressed={on} onClick={() => onPreset(s)}
                  className={`rounded-sm border border-solid px-2 py-1 text-xs ${on ? "border-gold bg-gold-soft text-ink" : "border-line bg-paper text-ink-2 hover:border-gold"}`}>
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost btn-sm" onClick={onDuplicate}>Duplicate</button>
        <button type="button" className="btn-ghost btn-sm" onClick={onLock}>{it.locked ? "Unlock" : "Lock"}</button>
        <button type="button" className="link-btn link-danger" onClick={onDelete}>Remove</button>
      </div>
    </section>
  );
}

function NumField({ label, value, min, max, step = 0.5, onCommit }: { label: string; value: number; min: number; max: number; step?: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);
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

/** "Add a grid of tables": kind, rows × columns, the gap between them and seats per table */
function ArrayDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (kind: LayoutKind, rows: number, cols: number, gapX: number, gapY: number, seats: number) => void }) {
  const [kind, setKind] = useState<LayoutKind>("round");
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(4);
  const [gap, setGap] = useState(1.2);
  const [seats, setSeats] = useState(KINDS.round.seats ?? 10);
  const kinds: LayoutKind[] = ["round", "rect", "row"];
  return (
    <div data-plan-menu role="dialog" aria-label="Add a grid of tables" className="absolute left-1/2 top-16 z-40 grid w-[min(22rem,calc(100%-2rem))] -translate-x-1/2 gap-3 rounded-lg border border-solid border-line bg-card p-4">
      <h3 className="m-0 font-serif text-xl text-ink">Add a grid of tables</h3>
      <div className="flex gap-1">
        {kinds.map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); setSeats(KINDS[k].seats ?? 8); }}
            className={`flex-1 rounded-sm border border-solid px-2 py-1.5 text-xs ${kind === k ? "border-gold bg-gold-soft text-ink" : "border-line bg-paper text-ink-2"}`}>
            {KINDS[k].label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Rows" value={rows} min={1} max={30} step={1} onCommit={(n) => setRows(Math.round(n))} />
        <NumField label="Columns" value={cols} min={1} max={30} step={1} onCommit={(n) => setCols(Math.round(n))} />
        <NumField label="Gap between (m)" value={gap} min={0} max={10} step={0.1} onCommit={setGap} />
        <NumField label="Seats each" value={seats} min={1} max={SEATS_MAX[kind] ?? 24} step={1} onCommit={(n) => setSeats(Math.round(n))} />
      </div>
      <p className="m-0 text-xs text-stone">{rows * cols} {rows * cols === 1 ? "item" : "items"} · {rows * cols * seats} seats, placed in the middle of the view. The gap is between chairs.</p>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary btn-sm" onClick={() => onAdd(kind, rows, cols, gap, gap, seats)}>Add {rows * cols}</button>
      </div>
    </div>
  );
}
