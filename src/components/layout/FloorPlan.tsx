// Draws a venue layout as SVG, in metres. Used by the layout editor (interactive) and the seating board (seats
// filled in). Colours come from the theme tokens, so the plan follows every theme.
import type { PointerEvent as RPointerEvent, ReactNode } from "react";
import type { LayoutItem, VenueLayout } from "../../types";
import { KINDS, isTable, seatPositions } from "../../lib/layout";

export interface ItemHandlers {
  onPointerDown?: (e: RPointerEvent<SVGGElement>, it: LayoutItem) => void;
  onClick?: (it: LayoutItem) => void;
  onKeyDown?: (e: React.KeyboardEvent<SVGGElement>, it: LayoutItem) => void;
}

export function ItemShape({ it, selected, clash, seatFill, children, handlers, focusable = true, title }: {
  it: LayoutItem;
  selected?: boolean;
  clash?: boolean;
  /** per seat: a fill colour (seated) or undefined (empty) */
  seatFill?: (i: number) => string | undefined;
  children?: ReactNode;
  handlers?: ItemHandlers;
  focusable?: boolean;
  title?: string;
}) {
  const k = KINDS[it.kind];
  const stroke = clash ? "var(--danger)" : selected ? "var(--primary-accent, var(--gold))" : k.zone ? "var(--taupe)" : "var(--gold)";
  const fill = it.kind === "label" ? "transparent" : k.zone ? "color-mix(in srgb, var(--gold-soft) 70%, var(--card))" : "var(--card)";
  const sw = selected ? 0.08 : 0.04;
  const seats = isTable(it) ? seatPositions(it) : [];
  const fontSize = Math.max(0.22, Math.min(0.5, Math.min(it.w, it.h) * (it.kind === "round" ? 0.22 : 0.35)));
  const name = title ?? `${it.label || k.label}${it.seats ? `, ${it.seats} seats` : ""}`;
  return (
    <g
      transform={`translate(${it.x} ${it.y}) rotate(${it.rot})`}
      tabIndex={focusable ? 0 : undefined}
      role={focusable ? "button" : undefined}
      aria-label={name}
      aria-pressed={focusable ? !!selected : undefined}
      className="outline-none"
      style={{ cursor: handlers?.onPointerDown ? "move" : handlers?.onClick ? "pointer" : undefined }}
      onPointerDown={handlers?.onPointerDown ? (e) => handlers.onPointerDown!(e, it) : undefined}
      onClick={handlers?.onClick ? () => handlers.onClick!(it) : undefined}
      onKeyDown={handlers?.onKeyDown ? (e) => handlers.onKeyDown!(e, it) : undefined}
    >
      <title>{name}</title>
      {seats.map((s, i) => (
        <circle key={i} data-seat={i} cx={s.x} cy={s.y} r={it.kind === "row" ? Math.min(0.22, it.w / it.seats! / 2.4) : 0.22}
          fill={seatFill?.(i) ?? "var(--paper-2)"} stroke="var(--taupe)" strokeWidth={0.03} />
      ))}
      {it.kind === "row" ? null : k.round ? (
        <ellipse rx={it.w / 2} ry={it.h / 2} fill={fill} stroke={stroke} strokeWidth={sw} />
      ) : (
        <rect x={-it.w / 2} y={-it.h / 2} width={it.w} height={it.h} rx={k.zone ? 0.15 : 0.08} fill={fill} stroke={it.kind === "label" && !selected ? "none" : stroke} strokeWidth={sw}
          strokeDasharray={it.kind === "entrance" ? "0.2 0.12" : undefined} />
      )}
      {it.kind === "row" && <rect x={-it.w / 2} y={-it.h / 2} width={it.w} height={it.h} fill="transparent" stroke={selected || clash ? stroke : "none"} strokeWidth={sw} />}
      {it.kind !== "row" && it.kind !== "wall" && (
        <text textAnchor="middle" dominantBaseline="central" fontSize={it.kind === "label" ? Math.min(0.6, it.h * 0.7) : fontSize} fill={it.kind === "label" ? "var(--ink)" : "var(--ink-2)"}
          style={{ fontFamily: "var(--sans)", pointerEvents: "none", userSelect: "none" }} transform={`rotate(${-it.rot})`}>
          {it.label || k.label}
        </text>
      )}
      {it.kind === "row" && (
        <text y={-it.h / 2 - 0.15} textAnchor="middle" fontSize={0.25} fill="var(--stone)" style={{ fontFamily: "var(--sans)", pointerEvents: "none" }}>{it.label}</text>
      )}
      {children}
    </g>
  );
}

/** the room: floor, grid every metre (stronger every 5) and a scale bar */
export function Room({ layout, grid = true }: { layout: VenueLayout; grid?: boolean }) {
  const lines: ReactNode[] = [];
  if (grid) {
    for (let x = 1; x < layout.w; x++) lines.push(<line key={`x${x}`} x1={x} y1={0} x2={x} y2={layout.h} stroke="var(--line)" strokeWidth={x % 5 ? 0.015 : 0.035} />);
    for (let y = 1; y < layout.h; y++) lines.push(<line key={`y${y}`} x1={0} y1={y} x2={layout.w} y2={y} stroke="var(--line)" strokeWidth={y % 5 ? 0.015 : 0.035} />);
  }
  return (
    <g pointerEvents="none">
      <rect x={0} y={0} width={layout.w} height={layout.h} fill="var(--paper)" stroke="var(--ink-2)" strokeWidth={0.1} />
      {lines}
      <g transform={`translate(0.5 ${layout.h + 0.6})`}>
        <line x1={0} y1={0} x2={5} y2={0} stroke="var(--ink-2)" strokeWidth={0.05} />
        <line x1={0} y1={-0.15} x2={0} y2={0.15} stroke="var(--ink-2)" strokeWidth={0.05} />
        <line x1={5} y1={-0.15} x2={5} y2={0.15} stroke="var(--ink-2)" strokeWidth={0.05} />
        <text x={5.3} y={0} dominantBaseline="central" fontSize={0.35} fill="var(--stone)" style={{ fontFamily: "var(--sans)" }}>5 m · room {layout.w} × {layout.h} m</text>
      </g>
    </g>
  );
}
