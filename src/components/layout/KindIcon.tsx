// A tiny drawing of each floor-plan item, for the palette, the Layers panel and the drag ghost.
import type { LayoutKind } from "../../types";
import { KINDS } from "../../lib/layout";

/** a tiny drawing of each palette item */
export default function KindIcon({ kind }: { kind: LayoutKind }) {
  const k = KINDS[kind];
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
      {kind === "round" ? (
        <>
          {Array.from({ length: 8 }, (_, i) => <circle key={i} cx={9 + Math.cos((i / 8) * Math.PI * 2) * 7.2} cy={9 + Math.sin((i / 8) * Math.PI * 2) * 7.2} r={1.3} fill="var(--taupe)" />)}
          <circle cx={9} cy={9} r={4.6} fill="var(--card)" stroke="var(--gold)" strokeWidth={1.2} />
        </>
      ) : kind === "rect" ? (
        <>
          {[4, 9, 14].flatMap((x) => [<circle key={`a${x}`} cx={x} cy={3.5} r={1.3} fill="var(--taupe)" />, <circle key={`b${x}`} cx={x} cy={14.5} r={1.3} fill="var(--taupe)" />])}
          <rect x={1.5} y={6} width={15} height={6} rx={1} fill="var(--card)" stroke="var(--gold)" strokeWidth={1.2} />
        </>
      ) : kind === "row" ? (
        [2.5, 6.8, 11.2, 15.5].map((x) => <circle key={x} cx={x} cy={9} r={1.8} fill="var(--taupe)" />)
      ) : kind === "label" ? (
        <text x={9} y={13} textAnchor="middle" fontSize={12} fill="var(--ink)" fontFamily="serif">T</text>
      ) : k.round ? (
        <circle cx={9} cy={9} r={6} fill="var(--gold-soft)" stroke="var(--taupe)" strokeWidth={1.2} />
      ) : kind === "aisle" ? (
        <rect x={6} y={1} width={6} height={16} rx={1} fill="var(--gold-soft)" stroke="var(--gold)" strokeWidth={1.2} />
      ) : (
        <rect x={k.w >= k.h * 2 ? 1 : 3} y={k.w >= k.h * 2 ? 6 : 3} width={k.w >= k.h * 2 ? 16 : 12} height={k.w >= k.h * 2 ? 6 : 12} rx={1.5}
          fill="var(--gold-soft)" stroke="var(--taupe)" strokeWidth={1.2} strokeDasharray={kind === "entrance" ? "2 1.5" : undefined} />
      )}
    </svg>
  );
}
