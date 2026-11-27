// The workspace's Layout and Seating tabs: pick a function, then edit its floor plan or seat its guests.
import { lazy, Suspense, useState } from "react";
import type { Proposal, VenueLayout } from "../types";
import { functionHeading } from "../lib/functions";
import { guestFunctions } from "../lib/guestList";
import LayoutEditor from "./LayoutEditor";

const SeatingBoard = lazy(() => import("./SeatingBoard"));

type Update = (fn: (cur: Proposal) => Proposal) => void;

export function setLayout(cur: Proposal, fnId: string, l: VenueLayout | undefined): Proposal {
  const layouts = { ...(cur.layouts ?? {}) };
  if (l) layouts[fnId] = l;
  else delete layouts[fnId];
  const seating = { ...(cur.seating ?? {}) };
  if (!l) delete seating[fnId];
  return { ...cur, layouts, seating };
}

export default function VenuePlan({ p, mode, onUpdate }: { p: Proposal; mode: "layout" | "seating"; onUpdate: Update }) {
  const fns = guestFunctions(p);
  const [fnId, setFnId] = useState(fns[0]?.id ?? "");
  const fn = fns.find((f) => f.id === fnId) ?? fns[0];
  const others = fns.filter((f) => f.id !== fn.id && p.layouts?.[f.id]);
  return (
    <div className="grid gap-4">
      {(fns.length > 1 || (mode === "layout" && !p.layouts?.[fn.id] && others.length > 0)) && (
        <div className="flex flex-wrap items-center gap-2">
          {fns.length > 1 && (
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Function">
              {fns.map((f) => (
                <button key={f.id} type="button" role="tab" aria-selected={f.id === fn.id} onClick={() => setFnId(f.id)}
                  className={`rounded-sm border border-solid px-3 py-1.5 text-sm ${f.id === fn.id ? "border-gold bg-gold-soft text-ink" : "border-line bg-card text-ink-2"}`}>
                  {functionHeading(f)}
                </button>
              ))}
            </div>
          )}
          {mode === "layout" && !p.layouts?.[fn.id] && others.length > 0 && (
            <button type="button" className="btn-ghost btn-sm ml-auto" onClick={() => onUpdate((cur) => setLayout(cur, fn.id, structuredClone(cur.layouts![others[0].id])))}>
              Copy the {others[0].label} plan
            </button>
          )}
        </div>
      )}
      {mode === "layout" ? (
        <LayoutEditor key={fn.id} p={p} fnId={fn.id} onSave={(l) => onUpdate((cur) => setLayout(cur, fn.id, l))} />
      ) : (
        <Suspense fallback={<p className="hint" role="status">Opening seating…</p>}>
          <SeatingBoard key={fn.id} p={p} fnId={fn.id} onUpdate={onUpdate} />
        </Suspense>
      )}
    </div>
  );
}
