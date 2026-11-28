// The floor plan on a Konva canvas, shared by the Layout editor (mode "edit") and the Seating board (mode "seat").
// Units are metres: the stage is scaled to pixels, so items keep the same x, y, w, h, rot as the saved plan.
// Colours come from the theme's CSS tokens and are re-read when the theme changes. Loaded lazily with Konva.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import Konva from "konva";
import { Group, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { LayoutItem, VenueLayout } from "../../types";
import { KINDS, bounds, boxSelect, clampToRoom, distance, drawOrder, isTable, itemsAt, resizeItem, snap, snapGuides, type Guide } from "../../lib/layout";
import ItemNode, { type Look } from "./ItemNode";
import { Minimap, Rulers } from "./Overlays";

Konva.hitOnDragEnabled = true;

export type Tone = "gold" | "ink2" | "taupe" | "stone";

export interface Colors {
  paper: string;
  paper2: string;
  card: string;
  ink: string;
  ink2: string;
  stone: string;
  taupe: string;
  line: string;
  gold: string;
  goldSoft: string;
  goldText: string;
  accent: string;
  danger: string;
}

const TOKENS: Record<keyof Colors, string> = {
  paper: "--paper", paper2: "--paper-2", card: "--card", ink: "--ink", ink2: "--ink-2", stone: "--stone", taupe: "--taupe",
  line: "--line", gold: "--gold", goldSoft: "--gold-soft", goldText: "--gold-text", accent: "--primary-accent", danger: "--danger",
};

function readColors(): Colors {
  const s = getComputedStyle(document.documentElement);
  const out = {} as Colors;
  for (const [k, v] of Object.entries(TOKENS)) out[k as keyof Colors] = s.getPropertyValue(v).trim() || "#999";
  if (out.accent === "#999" || out.accent.startsWith("var")) out.accent = out.gold;
  return out;
}

/** the theme's colours, read again whenever <html data-theme / data-font> changes */
export function useThemeColors(): Colors {
  const [c, setC] = useState(readColors);
  useEffect(() => {
    const mo = new MutationObserver(() => setC(readColors()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-font", "style", "class"] });
    return () => mo.disconnect();
  }, []);
  return c;
}

export interface CanvasHandle {
  /** room metres under a screen point, or null when it's outside the canvas */
  toRoom: (clientX: number, clientY: number) => { x: number; y: number } | null;
  /** the table (and seat) under a screen point */
  hitAt: (clientX: number, clientY: number) => { itemId: string; seat?: number } | null;
  fit: () => void;
  zoomBy: (factor: number) => void;
  /** the centre of what's on screen, in room metres */
  viewCentre: () => { x: number; y: number };
  /** pan so this room point is in the middle */
  centreOn: (x: number, y: number) => void;
}

export interface MenuRequest {
  itemId?: string;
  clientX: number;
  clientY: number;
  room: { x: number; y: number };
}

interface Props {
  layout: VenueLayout;
  mode: "edit" | "seat";
  selected?: string[];
  clash?: Set<string>;
  grid?: boolean;
  /** seat mode: the colour of a taken seat (undefined = empty) and its hover text */
  seatTone?: (it: LayoutItem, seat: number) => Tone | undefined;
  seatTitle?: (it: LayoutItem, seat: number) => string | undefined;
  /** seat mode: a table to highlight (a drag is over it) */
  highlight?: string | null;
  tableTitle?: (it: LayoutItem) => string;
  onSelect?: (ids: string[]) => void;
  /** edit mode: items changed; "live" while dragging/resizing, "end" when the gesture finishes */
  onEdit?: (items: LayoutItem[], phase: "live" | "end") => void;
  onTableClick?: (itemId: string, seat?: number) => void;
  onMenu?: (m: MenuRequest) => void;
  /** drawn over the canvas above the selection (the floating toolbar); box in px relative to the canvas */
  overlay?: (box: { left: number; top: number; right: number; bottom: number }) => ReactNode;
  ariaLabel: string;
  /** furniture drawn top-down ("realistic", the default) or as plain shapes */
  look?: Look;
  /** seat mode: the guest's name on a seat, shown when zoomed in */
  seatName?: (it: LayoutItem, seat: number) => string | undefined;
  /**
   * What a drag on the floor does: "select" draws a selection box (left to right: wholly inside; right to left:
   * touching), "hand" pans, "measure" draws a dimension line. Space-drag, a middle-button drag and two fingers always pan.
   */
  tool?: "select" | "hand" | "measure";
  /** fill the container's height (fullscreen) instead of keeping a 16:10 plan */
  fill?: boolean;
  rulers?: boolean;
  minimap?: boolean;
}

const coarse = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
const r2 = (n: number) => Math.round(n * 100) / 100;

const PlanCanvas = forwardRef<CanvasHandle, Props>(function PlanCanvas(props, ref) {
  const { layout, mode, selected = [], clash, grid = true, seatTone, seatTitle, highlight, tableTitle, onSelect, onEdit, onTableClick, onMenu, overlay, ariaLabel, look = "realistic", seatName, tool = "select", rulers = false, minimap = false, fill = false } = props;
  const [measure, setMeasure] = useState<{ a: { x: number; y: number }; b: { x: number; y: number }; live: boolean } | null>(null);
  useEffect(() => {
    if (tool !== "measure") setMeasure(null);
  }, [tool]);
  const c = useThemeColors();
  const box = useRef<HTMLDivElement>(null);
  const stage = useRef<Konva.Stage>(null);
  const tr = useRef<Konva.Transformer>(null);
  const nodes = useRef(new Map<string, Konva.Group>());
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [view, setView] = useState({ x: 0, y: 0, scale: 20 });
  const [guides, setGuides] = useState<Guide[]>([]);
  const [badge, setBadge] = useState<{ text: string; x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number; add: boolean } | null>(null);
  const pan = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const [panning, setPanning] = useState(false);
  const [space, setSpace] = useState(false);
  const hover = useRef(false);
  /** a click right after a box selection or a pan isn't "click the floor to clear" */
  const swallow = useRef(false);
  /** pressed on one item of a multi-selection: a click (no drag) narrows to it */
  const pending = useRef<string | null>(null);
  const dragged = useRef(false);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const pinch = useRef<{ dist: number; scale: number; mid: { x: number; y: number }; pos: { x: number; y: number } } | null>(null);
  const press = useRef<number | null>(null);
  const fitted = useRef(false);
  const big = coarse();
  const hitPx = big ? 28 : 16;
  const visible = useMemo(() => drawOrder(layout.items.filter((i) => !i.hidden)), [layout.items]);
  const panMode = tool === "hand" || space;

  // Space held over the plan pans, as in drawing apps
  useEffect(() => {
    const typing = (t: EventTarget | null) => !!(t as HTMLElement)?.closest?.("input, textarea, select, [contenteditable]");
    const down = (e: KeyboardEvent) => {
      if (e.key === " " && hover.current && !typing(e.target)) {
        e.preventDefault();
        setSpace(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === " ") setSpace(false);
    };
    const blur = () => setSpace(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // the canvas follows its container's width; height keeps a 16:10 plan, at least 320 px
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = Math.max(280, el.clientWidth);
      setSize({ w, h: fill ? Math.max(320, el.clientHeight) : Math.max(320, Math.round(Math.min(w * 0.62, window.innerHeight * 0.72))) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fill]);

  const fit = useCallback(() => {
    const pad = 1.2;
    const scale = Math.min(size.w / (layout.w + pad * 2), size.h / (layout.h + pad * 2 + 0.8));
    setView({ scale, x: (size.w - layout.w * scale) / 2, y: (size.h - (layout.h + 0.8) * scale) / 2 });
  }, [size.w, size.h, layout.w, layout.h]);
  useEffect(() => {
    // fit once the container has its real size, and again when the room changes size
    fit();
    fitted.current = true;
  }, [fit]);

  const toRoomPx = (p: { x: number; y: number }) => ({ x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale });
  const zoomAt = (factor: number, at?: { x: number; y: number }) => {
    setView((v) => {
      const scale = Math.max(3, Math.min(200, v.scale * factor));
      const p = at ?? { x: size.w / 2, y: size.h / 2 };
      const rx = (p.x - v.x) / v.scale;
      const ry = (p.y - v.y) / v.scale;
      return { scale, x: p.x - rx * scale, y: p.y - ry * scale };
    });
  };

  useImperativeHandle(ref, () => ({
    toRoom: (cx, cy) => {
      const r = box.current?.getBoundingClientRect();
      if (!r || cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return null;
      return toRoomPx({ x: cx - r.left, y: cy - r.top });
    },
    hitAt: (cx, cy) => {
      const r = box.current?.getBoundingClientRect();
      const st = stage.current;
      if (!r || !st) return null;
      const shape = st.getIntersection({ x: cx - r.left, y: cy - r.top });
      if (!shape) return null;
      const seat = shape.getAttr("seat") as number | undefined;
      const g = shape.findAncestor(".item") as Konva.Group | undefined;
      const itemId = g?.getAttr("itemId") as string | undefined;
      return itemId ? { itemId, ...(seat !== undefined ? { seat } : {}) } : null;
    },
    fit,
    zoomBy: (f) => zoomAt(f),
    viewCentre: () => toRoomPx({ x: size.w / 2, y: size.h / 2 }),
    centreOn: (x, y) => setView((v) => ({ ...v, x: size.w / 2 - x * v.scale, y: size.h / 2 - y * v.scale })),
  }));

  // the transformer wraps the selected, unlocked items (edit mode)
  const editable = mode === "edit" && !panMode ? selected.filter((id) => !layout.items.find((i) => i.id === id)?.locked) : [];
  const single = editable.length === 1 ? layout.items.find((i) => i.id === editable[0]) : undefined;
  useEffect(() => {
    const t = tr.current;
    if (!t) return;
    t.nodes(editable.map((id) => nodes.current.get(id)).filter((n): n is Konva.Group => !!n));
    t.getLayer()?.batchDraw();
  });

  // ---- pressing items: Shift toggles, Alt reaches the item underneath, a click inside a multi-selection narrows it ----
  const pressItem = (it: LayoutItem, mods: { shift: boolean; alt: boolean }) => {
    dragged.current = false;
    pending.current = null;
    if (mods.shift) return onSelect?.(selected.includes(it.id) ? selected.filter((x) => x !== it.id) : [...selected, it.id]);
    if (mods.alt) {
      const pos = stage.current?.getPointerPosition();
      const stack = pos ? itemsAt(layout.items, toRoomPx(pos), hitPx / 2 / view.scale) : [];
      if (stack.length > 1) {
        const cur = selected.length === 1 ? stack.findIndex((i) => i.id === selected[0]) : -1;
        return onSelect?.([stack[cur < 0 ? 1 : (cur + 1) % stack.length].id]);
      }
    }
    if (!selected.includes(it.id)) onSelect?.([it.id]);
    else if (selected.length > 1) pending.current = it.id;
  };
  const releaseItem = (it: LayoutItem) => {
    if (!dragged.current && pending.current === it.id) onSelect?.([it.id]);
    pending.current = null;
  };

  // ---- drag: snap to the grid and to other items' edges and centres; several selected items move together ----
  const dragStart = useRef<{ id: string; x: number; y: number; others: Map<string, { x: number; y: number }> } | null>(null);
  const onDragStart = (e: KonvaEventObject<DragEvent>, it: LayoutItem) => {
    setBusy(true);
    dragged.current = true;
    const ids = selected.includes(it.id) ? selected : [it.id];
    if (!selected.includes(it.id)) onSelect?.([it.id]);
    dragStart.current = {
      id: it.id,
      x: e.target.x(),
      y: e.target.y(),
      others: new Map(ids.filter((x) => x !== it.id).map((x) => [x, { x: nodes.current.get(x)?.x() ?? 0, y: nodes.current.get(x)?.y() ?? 0 }])),
    };
  };
  const onDragMove = (e: KonvaEventObject<DragEvent>, it: LayoutItem) => {
    const n = e.target;
    const free = e.evt.altKey;
    let x = free ? n.x() : snap(n.x());
    let y = free ? n.y() : snap(n.y());
    const moving = bounds({ ...it, x, y });
    const moved = new Set([it.id, ...(dragStart.current?.others.keys() ?? [])]);
    const others = layout.items.filter((o) => !moved.has(o.id) && o.kind !== "label").map(bounds);
    const g = free ? { dx: 0, dy: 0, guides: [] } : snapGuides(moving, others, 0.15, layout);
    x += g.dx;
    y += g.dy;
    const clamped = clampToRoom({ ...it, x, y }, layout);
    n.position({ x: clamped.x, y: clamped.y });
    setGuides(g.guides);
    const s = dragStart.current;
    if (s) {
      const dx = clamped.x - s.x;
      const dy = clamped.y - s.y;
      for (const [id, p] of s.others) nodes.current.get(id)?.position({ x: p.x + dx, y: p.y + dy });
    }
    const pos = stage.current?.getPointerPosition();
    if (pos) setBadge({ text: `${r2(clamped.x).toFixed(2)}, ${r2(clamped.y).toFixed(2)} m`, x: pos.x, y: pos.y });
  };
  const onDragEnd = () => {
    const s = dragStart.current;
    dragStart.current = null;
    setGuides([]);
    setBadge(null);
    setBusy(false);
    if (!s) return;
    const ids = new Set([s.id, ...s.others.keys()]);
    onEdit?.(layout.items.map((i) => {
      if (!ids.has(i.id)) return i;
      const n = nodes.current.get(i.id);
      return n ? clampToRoom({ ...i, x: r2(n.x()), y: r2(n.y()) }, layout) : i;
    }), "end");
  };

  // ---- resize and rotate with the Transformer: the scale is folded back into w/h, so chairs redraw, not stretch ----
  const fold = (it: LayoutItem, n: Konva.Group): LayoutItem => {
    const w = (n.getAttr("bodyW") as number) * n.scaleX();
    const h = (n.getAttr("bodyH") as number) * n.scaleY();
    n.scale({ x: 1, y: 1 });
    const rot = ((Math.round(n.rotation()) % 360) + 360) % 360;
    const sized = it.w === w && it.h === h ? { ...it } : resizeItem(it, w, h);
    return { ...sized, x: r2(n.x()), y: r2(n.y()), rot };
  };
  const onTransform = () => {
    setBusy(true);
    const changed = new Map<string, LayoutItem>();
    for (const id of editable) {
      const it = layout.items.find((i) => i.id === id);
      const n = nodes.current.get(id);
      if (it && n) {
        const next = fold(it, n);
        n.setAttrs({ bodyW: next.w, bodyH: next.h });
        changed.set(id, next);
      }
    }
    const one = changed.size === 1 ? [...changed.values()][0] : null;
    const pos = stage.current?.getPointerPosition();
    if (one && pos) setBadge({ text: `${one.w.toFixed(2)} × ${one.h.toFixed(2)} m · ${one.rot}°${isTable(one) ? ` · ${one.seats} seats` : ""}`, x: pos.x, y: pos.y });
    onEdit?.(layout.items.map((i) => changed.get(i.id) ?? i), "live");
  };
  const onTransformEnd = () => {
    setBadge(null);
    setBusy(false);
    onEdit?.(layout.items.map((i) => {
      if (!editable.includes(i.id)) return i;
      const n = nodes.current.get(i.id);
      return n ? clampToRoom(fold(i, n), layout) : i;
    }), "end");
  };

  // ---- stage: wheel zoom, floor drag selects a box (or pans with the hand tool, Space, the middle button or two
  // fingers), pinch on touch, right-click / long-press menu ----
  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const p = stage.current?.getPointerPosition();
    zoomAt(Math.exp(-Math.sign(e.evt.deltaY) * Math.min(Math.abs(e.evt.deltaY), 120) * 0.0022), p ?? undefined);
  };
  const isFloor = (e: KonvaEventObject<Event>) => e.target === stage.current || e.target.hasName("floor");
  const onDown = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const st = stage.current;
    if (!st) return;
    const pos = st.getPointerPosition();
    const touches = "touches" in e.evt ? e.evt.touches.length : 0;
    if (touches > 1 || !pos) {
      pan.current = null;
      setMarquee(null);
      return;
    }
    const button = touches ? 0 : (e.evt as MouseEvent).button;
    if (button === 2) return;
    swallow.current = false;
    if (tool === "measure" && button === 0) {
      const p = toRoomPx(pos);
      setMeasure({ a: p, b: p, live: true });
      return;
    }
    if (panMode || button === 1 || mode !== "edit") {
      if (button === 1) e.evt.preventDefault();
      pan.current = { x: pos.x, y: pos.y, vx: view.x, vy: view.y, moved: false };
      setPanning(true);
    } else if (button === 0 && (isFloor(e) || (e.target.findAncestor(".item") as Konva.Group | undefined)?.getAttr("locked"))) {
      const p = toRoomPx(pos);
      setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y, add: !touches && (e.evt as MouseEvent).shiftKey });
    }
    // long-press opens the menu on touch screens
    if (touches === 1 && onMenu) {
      const t = (e.evt as TouchEvent).touches[0];
      const target = e.target.findAncestor(".item") as Konva.Group | undefined;
      press.current = window.setTimeout(() => {
        onMenu({ itemId: target?.getAttr("itemId"), clientX: t.clientX, clientY: t.clientY, room: toRoomPx(pos) });
        press.current = null;
        pan.current = null;
        setPanning(false);
        setMarquee(null);
      }, 550);
    }
  };
  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current);
    press.current = null;
  };
  const onMove = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const st = stage.current;
    if (!st) return;
    if ("touches" in e.evt && e.evt.touches.length === 2) {
      cancelPress();
      e.evt.preventDefault();
      pan.current = null;
      if (marquee) setMarquee(null);
      const [a, b] = [e.evt.touches[0], e.evt.touches[1]];
      const r = box.current!.getBoundingClientRect();
      const mid = { x: (a.clientX + b.clientX) / 2 - r.left, y: (a.clientY + b.clientY) / 2 - r.top };
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (!pinch.current) {
        st.stopDrag();
        pinch.current = { dist, scale: view.scale, mid: toRoomPx(mid), pos: mid };
        return;
      }
      const scale = Math.max(3, Math.min(200, pinch.current.scale * (dist / pinch.current.dist)));
      setView({ scale, x: mid.x - pinch.current.mid.x * scale, y: mid.y - pinch.current.mid.y * scale });
      return;
    }
    const pos = st.getPointerPosition();
    if (!pos) return;
    const pn = pan.current;
    if (pn) {
      const dx = pos.x - pn.x;
      const dy = pos.y - pn.y;
      if (!pn.moved && Math.hypot(dx, dy) > 4) {
        pn.moved = true;
        cancelPress();
      }
      if (pn.moved) setView((v) => ({ ...v, x: pn.vx + dx, y: pn.vy + dy }));
      return;
    }
    if (measure?.live) {
      const p = toRoomPx(pos);
      // Shift keeps the line straight across or down
      const straight = (e.evt as MouseEvent).shiftKey ? (Math.abs(p.x - measure.a.x) > Math.abs(p.y - measure.a.y) ? { x: p.x, y: measure.a.y } : { x: measure.a.x, y: p.y }) : p;
      setMeasure({ ...measure, b: straight });
      return;
    }
    if (marquee) {
      const p = toRoomPx(pos);
      if (Math.hypot(p.x - marquee.x0, p.y - marquee.y0) * view.scale > 4) cancelPress();
      setMarquee({ ...marquee, x1: p.x, y1: p.y });
    }
  };
  const boxBig = (m: { x0: number; y0: number; x1: number; y1: number }) => Math.max(Math.abs(m.x1 - m.x0), Math.abs(m.y1 - m.y0)) * view.scale > 4;
  // released anywhere, even outside the canvas
  const onUp = () => {
    cancelPress();
    pinch.current = null;
    if (pan.current) {
      if (pan.current.moved) swallow.current = true;
      pan.current = null;
      setPanning(false);
    }
    if (measure?.live) setMeasure({ ...measure, live: false });
    if (!marquee) return;
    setMarquee(null);
    if (!boxBig(marquee)) return;
    swallow.current = true;
    const ids = boxSelect(layout.items, marquee, marquee.x1 < marquee.x0 ? "touch" : "inside");
    onSelect?.(marquee.add ? [...new Set([...selected, ...ids])] : ids);
  };
  const upRef = useRef(onUp);
  upRef.current = onUp;
  useEffect(() => {
    const up = () => upRef.current();
    window.addEventListener("mouseup", up);
    window.addEventListener("touchend", up);
    window.addEventListener("touchcancel", up);
    return () => {
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchend", up);
      window.removeEventListener("touchcancel", up);
    };
  }, []);
  const onClickStage = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    // the click arrives before the window's mouseup, so look at the gesture itself
    if (!isFloor(e) || pan.current?.moved || (marquee && boxBig(marquee)) || swallow.current) {
      swallow.current = false;
      return;
    }
    onSelect?.([]);
  };
  const onContext = (e: KonvaEventObject<PointerEvent>) => {
    e.evt.preventDefault();
    const pos = stage.current?.getPointerPosition();
    if (!onMenu || !pos) return;
    const g = e.target.findAncestor(".item") as Konva.Group | undefined;
    onMenu({ itemId: g?.getAttr("itemId"), clientX: e.evt.clientX, clientY: e.evt.clientY, room: toRoomPx(pos) });
  };

  // the floating toolbar sits above the selection, in canvas pixels
  const overlayBox = useMemo(() => {
    if (!overlay || busy || !selected.length) return null;
    const bs = layout.items.filter((i) => selected.includes(i.id)).map(bounds);
    if (!bs.length) return null;
    const b = { x0: Math.min(...bs.map((x) => x.x0)), y0: Math.min(...bs.map((x) => x.y0)), x1: Math.max(...bs.map((x) => x.x1)), y1: Math.max(...bs.map((x) => x.y1)) };
    return { left: view.x + b.x0 * view.scale, top: view.y + b.y0 * view.scale, right: view.x + b.x1 * view.scale, bottom: view.y + b.y1 * view.scale };
  }, [overlay, busy, selected, layout.items, view]);

  const gridLines = useMemo(() => {
    if (!grid) return [];
    const out: { pts: number[]; strong: boolean }[] = [];
    for (let x = 1; x < layout.w; x++) out.push({ pts: [x, 0, x, layout.h], strong: x % 5 === 0 });
    for (let y = 1; y < layout.h; y++) out.push({ pts: [0, y, layout.w, y], strong: y % 5 === 0 });
    return out;
  }, [grid, layout.w, layout.h]);

  const cursor = marquee || tool === "measure" ? "crosshair" : panning ? "grabbing" : panMode || mode === "seat" ? "grab" : "default";

  return (
    <div ref={box} className="relative w-full select-none overflow-hidden rounded-lg border border-line" style={{ background: c.paper2, touchAction: "none", height: fill ? "100%" : size.h }}
      role="application" aria-label={ariaLabel} onContextMenu={(e) => e.preventDefault()}
      onMouseEnter={() => { hover.current = true; }} onMouseLeave={() => { hover.current = false; }}>
      <Stage ref={stage} width={size.w} height={size.h} x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale}
        baseCursor={cursor}
        onWheel={onWheel} onMouseDown={onDown} onTouchStart={onDown} onMouseMove={onMove} onTouchMove={onMove}
        onClick={onClickStage} onTap={onClickStage} onContextMenu={onContext}
        style={{ cursor }}>
        <Layer listening={false}>
          <Rect x={0} y={0} width={layout.w} height={layout.h} fill={c.paper} stroke={c.ink2} strokeWidth={2} strokeScaleEnabled={false} />
          {gridLines.map((l, i) => <Line key={i} points={l.pts} stroke={c.line} strokeWidth={l.strong ? 1.2 : 0.6} strokeScaleEnabled={false} perfectDrawEnabled={false} />)}
          <Group x={0.5} y={layout.h + 0.6}>
            <Line points={[0, 0, 5, 0]} stroke={c.ink2} strokeWidth={1.5} strokeScaleEnabled={false} />
            <Line points={[0, -0.15, 0, 0.15]} stroke={c.ink2} strokeWidth={1.5} strokeScaleEnabled={false} />
            <Line points={[5, -0.15, 5, 0.15]} stroke={c.ink2} strokeWidth={1.5} strokeScaleEnabled={false} />
            <Text x={5.3} y={-0.2} text={`5 m · room ${layout.w} × ${layout.h} m`} fontSize={0.38} fill={c.stone} fontFamily="Inter, system-ui, sans-serif" />
          </Group>
        </Layer>
        <Layer>
          {/* an invisible floor so clicks on the room count as "the floor" */}
          <Rect name="floor" x={0} y={0} width={layout.w} height={layout.h} fill="transparent" />
          {visible.map((it) => (
            <ItemNode key={it.id} it={it} hitPx={hitPx} still={panMode} c={c} mode={mode} look={look} zoom={view.scale} selected={selected.includes(it.id)} clash={!!clash?.has(it.id)} highlight={highlight === it.id}
              seatTone={seatTone} seatName={seatName} title={tableTitle}
              register={(n) => { if (n) nodes.current.set(it.id, n); else nodes.current.delete(it.id); }}
              onPress={(m) => pressItem(it, m)} onRelease={() => releaseItem(it)}
              onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd}
              onTable={onTableClick}
              onSeatHover={(seat, on) => {
                const t = on && seatTitle ? seatTitle(it, seat) : undefined;
                const pos = stage.current?.getPointerPosition();
                setTip(t && pos ? { text: t, x: pos.x, y: pos.y } : null);
              }} />
          ))}
          {guides.map((g, i) => (
            <Line key={i} points={g.dir === "v" ? [g.at, g.from - 0.5, g.at, g.to + 0.5] : [g.from - 0.5, g.at, g.to + 0.5, g.at]} stroke={c.accent} strokeWidth={1.5} dash={[6, 4]} strokeScaleEnabled={false} listening={false} />
          ))}
          {measure && distance(measure.a, measure.b) > 0.05 && (
            <Group listening={false}>
              <Line points={[measure.a.x, measure.a.y, measure.b.x, measure.b.y]} stroke={c.danger} strokeWidth={2} strokeScaleEnabled={false} />
              {[measure.a, measure.b].map((p, i) => <Rect key={i} x={p.x - 4 / view.scale} y={p.y - 4 / view.scale} width={8 / view.scale} height={8 / view.scale} fill={c.danger} />)}
              <Group x={(measure.a.x + measure.b.x) / 2} y={(measure.a.y + measure.b.y) / 2}>
                <Rect x={-0.9 * (22 / view.scale) * 2} y={-14 / view.scale} width={1.8 * (22 / view.scale) * 2} height={28 / view.scale} cornerRadius={4 / view.scale} fill={c.ink} opacity={0.85} />
                <Text x={-0.9 * (22 / view.scale) * 2} y={-14 / view.scale} width={1.8 * (22 / view.scale) * 2} height={28 / view.scale} align="center" verticalAlign="middle"
                  text={`${distance(measure.a, measure.b).toFixed(2)} m`} fontSize={14 / view.scale} fill={c.card} fontFamily="Inter, system-ui, sans-serif" />
              </Group>
            </Group>
          )}
          {marquee && (
            <Rect x={Math.min(marquee.x0, marquee.x1)} y={Math.min(marquee.y0, marquee.y1)} width={Math.abs(marquee.x1 - marquee.x0)} height={Math.abs(marquee.y1 - marquee.y0)}
              fill={c.goldSoft} opacity={0.35} stroke={c.gold} strokeWidth={1} dash={marquee.x1 < marquee.x0 ? [6, 4] : undefined} strokeScaleEnabled={false} listening={false} />
          )}
          {mode === "edit" && (
            <Transformer ref={tr}
              rotateEnabled={editable.length === 1}
              resizeEnabled={editable.length === 1}
              keepRatio={!!single && !!KINDS[single.kind].round}
              enabledAnchors={single && KINDS[single.kind].round ? ["top-left", "top-right", "bottom-left", "bottom-right"] : ["top-left", "top-center", "top-right", "middle-right", "middle-left", "bottom-left", "bottom-center", "bottom-right"]}
              rotationSnaps={Array.from({ length: 24 }, (_, i) => i * 15)} rotationSnapTolerance={6}
              anchorSize={big ? 18 : 10} anchorCornerRadius={big ? 9 : 2} anchorStroke={c.gold} anchorFill={c.card} borderStroke={c.gold} borderDash={[4, 3]}
              rotateAnchorOffset={big ? 34 : 26} ignoreStroke flipEnabled={false}
              boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 0.3 * view.scale || Math.abs(newBox.height) < 0.08 * view.scale ? oldBox : newBox)}
              onTransform={onTransform} onTransformEnd={onTransformEnd} />
          )}
        </Layer>
      </Stage>
      {badge && <div className="pointer-events-none absolute z-10 whitespace-nowrap rounded-sm bg-espresso px-2 py-1 text-xs tabular-nums text-on-espresso" style={{ left: badge.x + 14, top: badge.y + 14 }}>{badge.text}</div>}
      {tip && <div className="pointer-events-none absolute z-10 whitespace-nowrap rounded-sm bg-espresso px-2 py-1 text-xs text-on-espresso" style={{ left: tip.x + 12, top: tip.y - 30 }}>{tip.text}</div>}
      {overlayBox && overlay?.(overlayBox)}
      {rulers && <Rulers view={view} size={size} c={c} />}
      {minimap && size.w >= 560 && <Minimap layout={layout} view={view} size={size} c={c} onJump={(x, y) => setView((v) => ({ ...v, x: size.w / 2 - x * v.scale, y: size.h / 2 - y * v.scale }))} />}
    </div>
  );
});

export default PlanCanvas;
