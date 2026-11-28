// One item on the Konva floor plan. "realistic" draws top-down furniture (chairs with backrests, tablecloths with
// numbered badges, a chequered dance floor, mandap pillars, a stage skirt…); "simple" draws plain shapes. Colours come
// from the theme tokens passed in `c`. The Group reports only the table's body as its box (see PlanCanvas).
import { useCallback, useMemo } from "react";
import Konva from "konva";
import { Arc, Circle, Ellipse, Group, Line, Rect, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { LayoutItem } from "../../types";
import { KINDS, isTable, seatPositions, tableNumber } from "../../lib/layout";
import type { Colors, Tone } from "./PlanCanvas";

export type Look = "realistic" | "simple";
const TONE: Record<Tone, keyof Colors> = { gold: "gold", ink2: "ink2", taupe: "taupe", stone: "stone" };
const FONT = "Inter, system-ui, sans-serif";

/** a 1 m × 1 m chequer for the dance floor, drawn once per colour pair */
const patterns = new Map<string, HTMLCanvasElement>();
function chequer(a: string, b: string): HTMLCanvasElement {
  const key = `${a}|${b}`;
  let cv = patterns.get(key);
  if (!cv) {
    cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const g = cv.getContext("2d")!;
    g.fillStyle = a;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = b;
    g.fillRect(0, 0, 32, 32);
    g.fillRect(32, 32, 32, 32);
    patterns.set(key, cv);
  }
  return cv;
}

export interface ItemNodeProps {
  it: LayoutItem;
  c: Colors;
  mode: "edit" | "seat";
  look: Look;
  /** stage pixels per metre, to decide when names fit */
  zoom: number;
  selected: boolean;
  clash: boolean;
  highlight: boolean;
  seatTone?: (it: LayoutItem, seat: number) => Tone | undefined;
  seatName?: (it: LayoutItem, seat: number) => string | undefined;
  title?: (it: LayoutItem) => string;
  register: (n: Konva.Group | null) => void;
  /** pressed in edit mode (mouse down or touch); the canvas decides what that selects */
  onPress: (mods: { shift: boolean; alt: boolean }) => void;
  /** a click or tap without a drag, in edit mode */
  onRelease: () => void;
  /** smallest hit target in screen pixels, so tiny items stay easy to pick */
  hitPx: number;
  /** the hand tool or Space is on: items neither drag nor take presses, so the drag pans */
  still?: boolean;
  onDragStart: (e: KonvaEventObject<DragEvent>, it: LayoutItem) => void;
  onDragMove: (e: KonvaEventObject<DragEvent>, it: LayoutItem) => void;
  onDragEnd: () => void;
  onTable?: (itemId: string, seat?: number) => void;
  onSeatHover: (seat: number, on: boolean) => void;
}

export default function ItemNode(props: ItemNodeProps) {
  const { it, c, mode, look, zoom, selected, clash, highlight, seatTone, seatName, title, register, onPress, onRelease, hitPx, still = false, onDragStart, onDragMove, onDragEnd, onTable, onSeatHover } = props;
  const k = KINDS[it.kind];
  const table = isTable(it);
  const real = look === "realistic";
  const seats = table ? seatPositions(it) : [];
  const stroke = clash ? c.danger : highlight ? c.accent : selected && mode === "seat" ? c.accent : k.zone ? c.taupe : c.gold;
  const sw = highlight || clash ? 2.5 : 1.5;
  const font = Math.max(0.22, Math.min(0.5, Math.min(it.w, it.h) * (it.kind === "round" ? 0.22 : 0.35)));
  const chair = it.kind === "row" ? Math.min(0.24, it.w / Math.max(1, it.seats ?? 1) / 2.2) : 0.24;
  const num = tableNumber(it.label);
  const shadow = real ? { shadowColor: "#000", shadowOpacity: 0.22, shadowBlur: 6, shadowOffset: { x: 0.04, y: 0.07 }, shadowForStrokeEnabled: false } : {};
  const showNames = mode === "seat" && !!seatName && zoom >= 35;

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

  const floor = useMemo(() => (it.kind === "dance" && real ? chequer(c.card, c.goldSoft) : null), [it.kind, real, c.card, c.goldSoft]);
  const label = it.kind === "wall" ? "" : it.label || k.label;
  // chairs take clicks in edit mode too, so pressing a chair picks up its table
  const seatProps = (i: number) => ({ seat: i, perfectDrawEnabled: false, onMouseEnter: () => onSeatHover(i, true), onMouseLeave: () => onSeatHover(i, false) });

  return (
    <Group ref={setRef} name="item" itemId={it.id} locked={!!it.locked} bodyW={it.w} bodyH={it.h} x={it.x} y={it.y} rotation={it.rot}
      draggable={mode === "edit" && !it.locked && !still}
      // a locked item lets the press through, so a box selection can start on it
      onMouseDown={(e) => { if (mode === "edit" && !still && e.evt.button === 0) { if (!it.locked) e.cancelBubble = true; onPress({ shift: e.evt.shiftKey, alt: e.evt.altKey }); } }}
      onTouchStart={(e) => { if (mode === "edit" && !still && e.evt.touches.length === 1) { if (!it.locked) e.cancelBubble = true; onPress({ shift: false, alt: false }); } }}
      onDragStart={(e) => onDragStart(e, it)} onDragMove={(e) => onDragMove(e, it)} onDragEnd={onDragEnd}
      onClick={(e) => { if (mode === "edit" && e.evt.button === 0) onRelease(); if (mode === "seat" && table) { e.cancelBubble = true; onTable?.(it.id, e.target.getAttr("seat")); } }}
      onTap={(e) => { if (mode === "edit") onRelease(); if (mode === "seat" && table) { e.cancelBubble = true; onTable?.(it.id, e.target.getAttr("seat")); } }}
      onMouseEnter={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = still ? s.getAttr("baseCursor") : mode === "edit" ? (it.locked ? "not-allowed" : "move") : table ? "pointer" : "grab"; }}
      onMouseLeave={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = s.getAttr("baseCursor") ?? "default"; }}>

      {/* an invisible, bigger target for items that would be tiny on screen */}
      {Math.min(it.w, it.h) * zoom < hitPx && (
        <Rect x={-Math.max(it.w, hitPx / zoom) / 2} y={-Math.max(it.h, hitPx / zoom) / 2} width={Math.max(it.w, hitPx / zoom)} height={Math.max(it.h, hitPx / zoom)} fill="transparent" perfectDrawEnabled={false} />
      )}

      {/* chairs: a seat with a backrest on the side away from the table */}
      {seats.map((s, i) => {
        const tone = seatTone?.(it, i);
        const fill = tone ? c[TONE[tone]] : c.paper2;
        if (!real) return <Circle key={i} x={s.x} y={s.y} radius={chair * 0.9} fill={fill} stroke={c.taupe} strokeWidth={1} strokeScaleEnabled={false} {...seatProps(i)} />;
        return (
          <Group key={i} x={s.x} y={s.y} rotation={s.a}>
            <Rect x={-chair} y={-chair * 0.9} width={chair * 2} height={chair * 1.9} cornerRadius={chair * 0.45} fill={fill} stroke={c.taupe} strokeWidth={1} strokeScaleEnabled={false} {...seatProps(i)} />
            <Rect x={-chair * 1.05} y={-chair * 1.25} width={chair * 2.1} height={chair * 0.55} cornerRadius={chair * 0.25} fill={c.taupe} {...seatProps(i)} />
          </Group>
        );
      })}

      {/* the body */}
      {it.kind === "row" ? (
        <Rect x={-it.w / 2} y={-it.h / 2} width={it.w} height={it.h} fill="rgba(0,0,0,0.001)" stroke={selected || clash || highlight ? stroke : undefined} strokeWidth={1.5} strokeScaleEnabled={false} />
      ) : k.round && k.zone ? (
        <>
          <Ellipse radiusX={it.w / 2} radiusY={it.h / 2} fill={it.kind === "pillar" ? c.paper2 : c.goldSoft} stroke={stroke} strokeWidth={sw} strokeScaleEnabled={false} {...shadow} />
          {real && <ZoneDetail it={it} c={c} />}
        </>
      ) : k.round ? (
        <>
          <Ellipse radiusX={it.w / 2} radiusY={it.h / 2} stroke={stroke} strokeWidth={sw} strokeScaleEnabled={false} {...shadow}
            {...(real
              ? { fillRadialGradientStartPoint: { x: -it.w * 0.12, y: -it.h * 0.15 }, fillRadialGradientStartRadius: 0, fillRadialGradientEndPoint: { x: 0, y: 0 }, fillRadialGradientEndRadius: Math.max(it.w, it.h) / 2, fillRadialGradientColorStops: [0, c.card, 0.75, c.card, 1, c.goldSoft] }
              : { fill: c.card })} />
          {real && <Ellipse radiusX={it.w / 2 - 0.08} radiusY={it.h / 2 - 0.08} stroke={c.goldSoft} strokeWidth={1} strokeScaleEnabled={false} listening={false} />}
        </>
      ) : it.kind === "rect" ? (
        <>
          <Rect x={-it.w / 2} y={-it.h / 2} width={it.w} height={it.h} cornerRadius={0.06} fill={c.card} stroke={stroke} strokeWidth={sw} strokeScaleEnabled={false} {...shadow} />
          {real && <Rect x={-it.w / 2 + 0.1} y={-Math.min(0.18, it.h / 5)} width={Math.max(0, it.w - 0.2)} height={Math.min(0.36, it.h / 2.5)} fill={c.goldSoft} listening={false} />}
        </>
      ) : it.kind === "label" ? (
        <Rect x={-it.w / 2} y={-it.h / 2} width={it.w} height={it.h} fill="rgba(0,0,0,0.001)" stroke={selected ? c.gold : undefined} strokeWidth={1} strokeScaleEnabled={false} />
      ) : it.kind === "wall" ? (
        <Rect x={-it.w / 2} y={-it.h / 2} width={it.w} height={it.h} fill={c.ink2} stroke={clash || selected ? stroke : undefined} strokeWidth={1.5} strokeScaleEnabled={false} />
      ) : (
        <>
          <Rect x={-it.w / 2} y={-it.h / 2} width={it.w} height={it.h} cornerRadius={0.12} stroke={stroke} strokeWidth={sw} strokeScaleEnabled={false}
            dash={it.kind === "entrance" ? [8, 5] : undefined}
            {...(it.kind === "entrance" ? {} : shadow)}
            {...(floor ? { fillPatternImage: floor as unknown as HTMLImageElement, fillPatternScale: { x: 1 / 64, y: 1 / 64 }, fillPatternRepeat: "repeat" } : { fill: it.kind === "entrance" ? "rgba(0,0,0,0.001)" : c.goldSoft })} />
          {real && <ZoneDetail it={it} c={c} />}
        </>
      )}

      {/* the table's number, or the item's name */}
      {label && (
        <Group rotation={-it.rot} listening={false}>
          {it.kind === "row" ? (
            <Text x={-it.w / 2} y={-it.h / 2 - 0.4} width={it.w} align="center" text={label} fontSize={0.26} fill={c.stone} fontFamily={FONT} />
          ) : real && table && num !== null && !(mode === "seat" && title) ? (
            <>
              <Circle radius={Math.min(0.32, Math.min(it.w, it.h) * 0.22)} fill={c.gold} />
              <Text x={-0.5} y={-0.5} width={1} height={1} align="center" verticalAlign="middle" text={String(num)} fontSize={Math.min(0.32, Math.min(it.w, it.h) * 0.22)} fontStyle="bold" fill={c.card} fontFamily={FONT} />
            </>
          ) : (
            <Text x={-Math.max(it.w, it.h) / 2} y={-font} width={Math.max(it.w, it.h)} height={font * 2} align="center" verticalAlign="middle" text={title && table && mode === "seat" ? title(it) : label}
              fontSize={it.kind === "label" ? Math.min(0.6, it.h * 0.7) : font} fill={it.kind === "label" ? c.ink : c.ink2} fontFamily={FONT} wrap="none" ellipsis fontStyle={k.zone && real ? "bold" : "normal"} />
          )}
        </Group>
      )}

      {/* guests' first names next to their chairs, once zoomed in */}
      {showNames &&
        seats.map((s, i) => {
          const name = seatName?.(it, i);
          if (!name) return null;
          const a = ((s.a - 90) * Math.PI) / 180;
          return (
            <Group key={`n${i}`} x={s.x + Math.cos(a) * 0.5} y={s.y + Math.sin(a) * 0.5} rotation={-it.rot} listening={false}>
              <Text x={-0.6} y={-0.12} width={1.2} align="center" text={name.split(/\s+/)[0]} fontSize={0.2} fill={c.ink} fontFamily={FONT} wrap="none" ellipsis />
            </Group>
          );
        })}
      {it.locked && mode === "edit" && <Text x={it.w / 2 - 0.35} y={-it.h / 2 - 0.05} text="🔒" fontSize={0.3} listening={false} />}
    </Group>
  );
}

/** small top-down details that make zones read at a glance */
function ZoneDetail({ it, c }: { it: LayoutItem; c: Colors }) {
  const w = it.w / 2;
  const h = it.h / 2;
  const line = { stroke: c.gold, strokeWidth: 1, strokeScaleEnabled: false, listening: false } as const;
  switch (it.kind) {
    case "stage":
      // skirt inset and steps at the front edge
      return (
        <>
          <Rect x={-w + 0.15} y={-h + 0.15} width={Math.max(0, it.w - 0.3)} height={Math.max(0, it.h - 0.3)} cornerRadius={0.08} {...line} dash={[4, 3]} />
          {[0, 1, 2].map((s) => <Line key={s} points={[-0.6, h + 0.1 + s * 0.15, 0.6, h + 0.1 + s * 0.15]} {...line} />)}
        </>
      );
    case "mandap":
      // four pillars and a garland ring
      return (
        <>
          {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([dx, dy], i) => <Circle key={i} x={dx * (w - 0.35)} y={dy * (h - 0.35)} radius={0.2} fill={c.gold} listening={false} />)}
          <Circle radius={Math.min(w, h) * 0.55} {...line} dash={[3, 3]} />
          <Circle radius={Math.min(w, h) * 0.25} fill={c.card} {...line} />
        </>
      );
    case "buffet":
    case "bar": {
      const n = Math.max(2, Math.min(8, Math.floor(it.w / 0.9)));
      return <>{Array.from({ length: n }, (_, i) => <Ellipse key={i} x={-w + (it.w / n) * (i + 0.5)} y={0} radiusX={Math.min(0.3, it.w / n / 2.6)} radiusY={Math.min(0.2, h * 0.6)} fill={c.card} {...line} />)}</>;
    }
    case "dj":
      return (
        <>
          <Circle x={-w * 0.45} radius={Math.min(0.35, h * 0.6)} fill={c.card} {...line} />
          <Circle x={w * 0.45} radius={Math.min(0.35, h * 0.6)} fill={c.card} {...line} />
        </>
      );
    case "photo":
      return <Rect x={-w + 0.25} y={-h + 0.25} width={Math.max(0, it.w - 0.5)} height={Math.max(0, it.h - 0.5)} {...line} />;
    case "aisle": {
      // a runner: gold borders down the long sides and petals scattered along it
      const long = it.h >= it.w;
      const n = Math.max(2, Math.min(40, Math.floor(Math.max(it.w, it.h) / 0.8)));
      return (
        <>
          <Rect x={-w + 0.08} y={-h + 0.08} width={Math.max(0, it.w - 0.16)} height={Math.max(0, it.h - 0.16)} {...line} />
          {Array.from({ length: n }, (_, i) => {
            const t = -0.5 + (i + 0.5) / n;
            const side = i % 2 ? 0.22 : -0.22;
            return <Circle key={i} x={long ? side * it.w : t * it.w} y={long ? t * it.h : side * it.h} radius={0.06} fill={c.gold} listening={false} />;
          })}
        </>
      );
    }
    case "pillar":
      return <Circle radius={Math.min(w, h) * 0.6} {...line} />;
    case "plant":
      return <>{Array.from({ length: 6 }, (_, i) => <Circle key={i} x={Math.cos((i / 6) * Math.PI * 2) * w * 0.5} y={Math.sin((i / 6) * Math.PI * 2) * h * 0.5} radius={Math.min(w, h) * 0.22} fill={c.card} {...line} />)}</>;
    case "sofa": {
      // backrest along the top edge and seat cushions
      const n = Math.max(1, Math.round(it.w / 0.75));
      return (
        <>
          <Rect x={-w} y={-h} width={it.w} height={it.h * 0.28} cornerRadius={0.08} fill={c.taupe} listening={false} />
          {Array.from({ length: n }, (_, i) => (
            <Rect key={i} x={-w + 0.06 + (it.w - 0.12) * (i / n)} y={-h + it.h * 0.32} width={(it.w - 0.12) / n - 0.06} height={it.h * 0.6} cornerRadius={0.08} fill={c.card} {...line} />
          ))}
        </>
      );
    }
    case "screen":
      return <Rect x={-w + 0.04} y={-h + 0.04} width={Math.max(0, it.w - 0.08)} height={Math.max(0, it.h - 0.08)} fill={c.ink} listening={false} />;
    case "desk":
      return <Line points={[-w + 0.15, h * 0.4, w - 0.15, h * 0.4]} {...line} />;
    case "gifts":
      return <>{[-0.5, 0, 0.5].map((f, i) => <Rect key={i} x={f * w - 0.15} y={-0.15} width={0.3} height={0.3} fill={c.card} {...line} />)}</>;
    case "kids":
      return (
        <>
          <Rect x={-w + 0.2} y={-h + 0.2} width={Math.max(0, it.w - 0.4)} height={Math.max(0, it.h - 0.4)} {...line} dash={[4, 3]} />
          {[[-0.3, -0.25], [0.25, -0.1], [-0.1, 0.3], [0.3, 0.28]].map(([fx, fy], i) => <Circle key={i} x={fx * it.w} y={fy * it.h} radius={0.25} fill={c.card} {...line} />)}
        </>
      );
    case "entrance":
      return (
        <>
          <Circle x={-w} radius={0.18} fill={c.gold} listening={false} />
          <Circle x={w} radius={0.18} fill={c.gold} listening={false} />
          <Arc x={0} y={0} innerRadius={w - 0.02} outerRadius={w} angle={180} rotation={180} fill={c.gold} listening={false} />
        </>
      );
    default:
      return null;
  }
}
