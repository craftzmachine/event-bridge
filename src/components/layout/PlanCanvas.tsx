// The floor plan on a Konva canvas, shared by the Layout editor (mode "edit") and the Seating board (mode "seat").
// Units are metres: the stage is scaled to pixels, so items keep the same x, y, w, h, rot as the saved plan.
// Colours come from the theme's CSS tokens and are re-read when the theme changes. Loaded lazily with Konva.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import Konva from "konva";
import { Circle, Ellipse, Group, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { LayoutItem, VenueLayout } from "../../types";
import { KINDS, bounds, clampToRoom, isTable, resizeItem, seatPositions, snap, snapGuides, type Guide } from "../../lib/layout";

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
}

const coarse = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
const r2 = (n: number) => Math.round(n * 100) / 100;

const PlanCanvas = forwardRef<CanvasHandle, Props>(function PlanCanvas(props, ref) {
  const { layout, mode, selected = [], clash, grid = true, seatTone, seatTitle, highlight, tableTitle, onSelect, onEdit, onTableClick, onMenu, overlay, ariaLabel } = props;
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
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const pinch = useRef<{ dist: number; scale: number; mid: { x: number; y: number }; pos: { x: number; y: number } } | null>(null);
  const press = useRef<number | null>(null);
  const fitted = useRef(false);
  const big = coarse();

  // the canvas follows its container's width; height keeps a 16:10 plan, at least 320 px
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = Math.max(280, el.clientWidth);
      setSize({ w, h: Math.max(320, Math.round(Math.min(w * 0.62, window.innerHeight * 0.72))) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
  }));

  // the transformer wraps the selected, unlocked items (edit mode)
  const editable = mode === "edit" ? selected.filter((id) => !layout.items.find((i) => i.id === id)?.locked) : [];
  const single = editable.length === 1 ? layout.items.find((i) => i.id === editable[0]) : undefined;
  useEffect(() => {
    const t = tr.current;
    if (!t) return;
    t.nodes(editable.map((id) => nodes.current.get(id)).filter((n): n is Konva.Group => !!n));
    t.getLayer()?.batchDraw();
  });

  // ---- drag: snap to the grid and to other items' edges and centres; several selected items move together ----
  const dragStart = useRef<{ id: string; x: number; y: number; others: Map<string, { x: number; y: number }> } | null>(null);
  const onDragStart = (e: KonvaEventObject<DragEvent>, it: LayoutItem) => {
    setBusy(true);
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

  // ---- stage: wheel zoom, drag to pan, Shift-drag to select a box, pinch on touch, right-click / long-press menu ----
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
    if (mode === "edit" && isFloor(e) && (e.evt as MouseEvent).shiftKey && pos) {
      st.draggable(false);
      const p = toRoomPx(pos);
      setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      return;
    }
    // long-press opens the menu on touch screens
    if ("touches" in e.evt && e.evt.touches.length === 1 && onMenu && pos) {
      const t = e.evt.touches[0];
      const target = e.target.findAncestor(".item") as Konva.Group | undefined;
      press.current = window.setTimeout(() => {
        onMenu({ itemId: target?.getAttr("itemId"), clientX: t.clientX, clientY: t.clientY, room: toRoomPx(pos) });
        press.current = null;
      }, 550);
    }
  };
  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current);
    press.current = null;
  };
  const onMove = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    cancelPress();
    const st = stage.current;
    if (!st) return;
    if ("touches" in e.evt && e.evt.touches.length === 2) {
      e.evt.preventDefault();
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
    if (marquee) {
      const pos = st.getPointerPosition();
      if (pos) {
        const p = toRoomPx(pos);
        setMarquee({ ...marquee, x1: p.x, y1: p.y });
      }
    }
  };
  const onUp = () => {
    cancelPress();
    pinch.current = null;
    stage.current?.draggable(true);
    if (!marquee) return;
    const x0 = Math.min(marquee.x0, marquee.x1);
    const x1 = Math.max(marquee.x0, marquee.x1);
    const y0 = Math.min(marquee.y0, marquee.y1);
    const y1 = Math.max(marquee.y0, marquee.y1);
    setMarquee(null);
    if (x1 - x0 < 0.1 && y1 - y0 < 0.1) return;
    onSelect?.(layout.items.filter((it) => {
      const b = bounds(it);
      return b.x0 >= x0 && b.x1 <= x1 && b.y0 >= y0 && b.y1 <= y1;
    }).map((i) => i.id));
  };
  const onClickStage = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (isFloor(e) && !marquee) onSelect?.([]);
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

  return (
    <div ref={box} className="relative w-full select-none overflow-hidden rounded-lg border border-line" style={{ background: c.paper2, touchAction: "none", height: size.h }}
      role="application" aria-label={ariaLabel} onContextMenu={(e) => e.preventDefault()}>
      <Stage ref={stage} width={size.w} height={size.h} x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale}
        draggable onDragEnd={(e) => { if (e.target === stage.current) setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() })); }}
        onWheel={onWheel} onMouseDown={onDown} onTouchStart={onDown} onMouseMove={onMove} onTouchMove={onMove} onMouseUp={onUp} onTouchEnd={onUp}
        onClick={onClickStage} onTap={onClickStage} onContextMenu={onContext}
        style={{ cursor: marquee ? "crosshair" : "grab" }}>
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
          {layout.items.map((it) => (
            <ItemNode key={it.id} it={it} c={c} mode={mode} selected={selected.includes(it.id)} clash={!!clash?.has(it.id)} highlight={highlight === it.id}
              seatTone={seatTone} title={tableTitle}
              register={(n) => { if (n) nodes.current.set(it.id, n); else nodes.current.delete(it.id); }}
              onSelect={(additive) => onSelect?.(additive ? (selected.includes(it.id) ? selected.filter((x) => x !== it.id) : [...selected, it.id]) : [it.id])}
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
          {marquee && (
            <Rect x={Math.min(marquee.x0, marquee.x1)} y={Math.min(marquee.y0, marquee.y1)} width={Math.abs(marquee.x1 - marquee.x0)} height={Math.abs(marquee.y1 - marquee.y0)}
              fill={c.goldSoft} opacity={0.35} stroke={c.gold} strokeWidth={1} dash={[6, 4]} strokeScaleEnabled={false} listening={false} />
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
    </div>
  );
});

export default PlanCanvas;

const TONE: Record<Tone, keyof Colors> = { gold: "gold", ink2: "ink2", taupe: "taupe", stone: "stone" };
const FONT = "Inter, system-ui, sans-serif";

function ItemNode({ it, c, mode, selected, clash, highlight, seatTone, title, register, onSelect, onDragStart, onDragMove, onDragEnd, onTable, onSeatHover }: {
  it: LayoutItem;
  c: Colors;
  mode: "edit" | "seat";
  selected: boolean;
  clash: boolean;
  highlight: boolean;
  seatTone?: (it: LayoutItem, seat: number) => Tone | undefined;
  title?: (it: LayoutItem) => string;
  register: (n: Konva.Group | null) => void;
  onSelect: (additive: boolean) => void;
  onDragStart: (e: KonvaEventObject<DragEvent>, it: LayoutItem) => void;
  onDragMove: (e: KonvaEventObject<DragEvent>, it: LayoutItem) => void;
  onDragEnd: () => void;
  onTable?: (itemId: string, seat?: number) => void;
  onSeatHover: (seat: number, on: boolean) => void;
}) {
  const k = KINDS[it.kind];
  const table = isTable(it);
  const seats = table ? seatPositions(it) : [];
  const stroke = clash ? c.danger : highlight ? c.accent : selected && mode === "seat" ? c.accent : k.zone ? c.taupe : c.gold;
  const fill = it.kind === "label" ? "transparent" : k.zone ? c.goldSoft : c.card;
  const font = Math.max(0.22, Math.min(0.5, Math.min(it.w, it.h) * (it.kind === "round" ? 0.22 : 0.35)));
  const chair = it.kind === "row" ? Math.min(0.22, it.w / Math.max(1, it.seats ?? 1) / 2.4) : 0.22;

  // the Transformer frames the table itself, not its chairs: report the body as the group's own box
  const setRef = useCallback((n: Konva.Group | null) => {
    if (n && !n.getAttr("patched")) {
      const base = Konva.Group.prototype.getClientRect;
      n.getClientRect = function (cfg?: Parameters<typeof base>[0]) {
        if (cfg?.skipTransform) {
          const w = this.getAttr("bodyW") as number;
          const h = this.getAttr("bodyH") as number;
          return { x: -w / 2, y: -h / 2, width: w, height: h };
        }
        return base.call(this, cfg);
      };
      n.setAttr("patched", true);
    }
    register(n);
  }, []);

  const label = it.kind === "wall" ? "" : it.label || k.label;
  return (
    <Group ref={setRef} name="item" itemId={it.id} bodyW={it.w} bodyH={it.h} x={it.x} y={it.y} rotation={it.rot}
      draggable={mode === "edit" && !it.locked}
      onMouseDown={(e) => { if (mode === "edit" && e.evt.button === 0) { e.cancelBubble = true; if (e.evt.shiftKey || !selected) onSelect(e.evt.shiftKey); } }}
      onTouchStart={(e) => { if (mode === "edit") { e.cancelBubble = true; if (!selected) onSelect(false); } }}
      onDragStart={(e) => onDragStart(e, it)} onDragMove={(e) => onDragMove(e, it)} onDragEnd={onDragEnd}
      onClick={(e) => { if (mode === "seat" && table) { e.cancelBubble = true; onTable?.(it.id, e.target.getAttr("seat")); } }}
      onTap={(e) => { if (mode === "seat" && table) { e.cancelBubble = true; onTable?.(it.id, e.target.getAttr("seat")); } }}
      onMouseEnter={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = mode === "edit" ? (it.locked ? "not-allowed" : "move") : table ? "pointer" : "grab"; }}
      onMouseLeave={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = "grab"; }}>
      {seats.map((s, i) => {
        const tone = seatTone?.(it, i);
        return (
          <Circle key={i} seat={i} x={s.x} y={s.y} radius={chair} fill={tone ? c[TONE[tone]] : c.paper2} stroke={c.taupe} strokeWidth={1} strokeScaleEnabled={false}
            perfectDrawEnabled={false} listening={mode === "seat"}
            onMouseEnter={() => onSeatHover(i, true)} onMouseLeave={() => onSeatHover(i, false)} />
        );
      })}
      {it.kind === "row" ? (
        <Rect x={-it.w / 2} y={-it.h / 2} width={it.w} height={it.h} fill="rgba(0,0,0,0.001)" stroke={selected || clash || highlight ? stroke : undefined} strokeWidth={1.5} strokeScaleEnabled={false} />
      ) : k.round ? (
        <Ellipse radiusX={it.w / 2} radiusY={it.h / 2} fill={fill} stroke={stroke} strokeWidth={highlight || clash ? 2.5 : 1.5} strokeScaleEnabled={false} />
      ) : (
        <Rect x={-it.w / 2} y={-it.h / 2} width={it.w} height={it.h} cornerRadius={k.zone ? 0.12 : 0.06} fill={it.kind === "label" ? "rgba(0,0,0,0.001)" : fill}
          stroke={it.kind === "label" ? (selected ? c.gold : undefined) : stroke} strokeWidth={highlight || clash ? 2.5 : 1.5} strokeScaleEnabled={false}
          dash={it.kind === "entrance" ? [8, 5] : undefined} />
      )}
      {label && (
        <Group rotation={-it.rot} listening={false}>
          {it.kind === "row" ? (
            <Text x={-it.w / 2} y={-it.h / 2 - 0.4} width={it.w} align="center" text={label} fontSize={0.26} fill={c.stone} fontFamily={FONT} />
          ) : (
            <Text x={-Math.max(it.w, it.h) / 2} y={-font} width={Math.max(it.w, it.h)} height={font * 2} align="center" verticalAlign="middle" text={title && table && mode === "seat" ? title(it) : label}
              fontSize={it.kind === "label" ? Math.min(0.6, it.h * 0.7) : font} fill={it.kind === "label" ? c.ink : c.ink2} fontFamily={FONT} wrap="none" ellipsis />
          )}
        </Group>
      )}
      {it.locked && mode === "edit" && <Text x={it.w / 2 - 0.35} y={-it.h / 2 - 0.05} text="🔒" fontSize={0.3} listening={false} />}
    </Group>
  );
}
