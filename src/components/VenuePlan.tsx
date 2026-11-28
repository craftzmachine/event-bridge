// The workspace's Layout and Seating tabs: pick a function, then edit its floor plan or seat its guests, in 2D,
// or look round it in 3D (a viewer; three.js loads only when 3D is opened).
import { lazy, Suspense, useMemo, useState } from "react";
import { onTutorialEvent, startTutorial, type TutorialEvent, type TutorialState } from "../lib/planTutorial";
import PlanTutorial, { readTutorial, writeTutorial } from "./layout/PlanTutorial";
import { planFromWedding } from "../lib/floorPlans";
import { addFloorPlan } from "../state/floorPlans";
import type { LayoutItem, Proposal, VenueLayout } from "../types";
import { functionHeading } from "../lib/functions";
import { guestFunctions } from "../lib/guestList";
import { guestOf, normalise, tablesOf } from "../lib/seating";
import LayoutEditor from "./LayoutEditor";
import { usePlanView } from "./layout/planView";
import type { Tone } from "./layout/PlanCanvas";

const SeatingBoard = lazy(() => import("./SeatingBoard"));
const Plan3D = lazy(() => import("./layout/Plan3D"));

type Update = (fn: (cur: Proposal) => Proposal) => void;
const SIDE_TONE: Record<string, Tone> = { bride: "gold", groom: "ink2", both: "taupe", "": "stone" };

export function setLayout(cur: Proposal, fnId: string, l: VenueLayout | undefined): Proposal {
  const layouts = { ...(cur.layouts ?? {}) };
  if (l) layouts[fnId] = l;
  else delete layouts[fnId];
  const seating = { ...(cur.seating ?? {}) };
  if (!l) delete seating[fnId];
  return { ...cur, layouts, seating };
}

export default function VenuePlan({ p, mode, onUpdate, tutorial: startOn = false, extraActions, standalone = false }: { p: Proposal; mode: "layout" | "seating"; onUpdate: Update; tutorial?: boolean; extraActions?: React.ReactNode; standalone?: boolean }) {
  const [saved, setSaved] = useState("");
  // the hands-on tutorial: started from the Tutorial button (or a practice plan); progress kept on this device
  const [tut, setTut] = useState<TutorialState | null>(() => (startOn ? startTutorial() : readTutorial()?.active ? readTutorial() : null));
  const setTutorial = (s: TutorialState | null) => {
    setTut(s);
    writeTutorial(s);
  };
  const emit = (e: TutorialEvent) => setTut((cur) => {
    if (!cur) return cur;
    const next = onTutorialEvent(cur, e);
    if (next !== cur) writeTutorial(next);
    return next;
  });
  const fns = guestFunctions(p);
  const [fnId, setFnId] = useState(fns[0]?.id ?? "");
  const [view, setView] = usePlanView();
  const fn = fns.find((f) => f.id === fnId) ?? fns[0];
  const others = fns.filter((f) => f.id !== fn.id && p.layouts?.[f.id]);
  const layout = p.layouts?.[fn.id];
  const show3d = view.mode === "3d" && !!layout;

  // in 3D, the seating tab colours the chairs by side and names who sits where
  const guests = useMemo(() => new Map((p.guestList?.guests ?? []).map((g) => [g.id, g])), [p.guestList]);
  const plan = useMemo(() => (layout ? normalise(p.seating?.[fn.id], tablesOf(layout)).plan : {}), [layout, p.seating, fn.id]);
  const who = (it: LayoutItem, i: number) => {
    const k = plan[it.id]?.[i];
    return k ? guests.get(guestOf(k)) : undefined;
  };

  return (
    <div className="grid gap-4">
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
        {mode === "layout" && !layout && others.length > 0 && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => onUpdate((cur) => setLayout(cur, fn.id, structuredClone(cur.layouts![others[0].id])))}>
            Copy the {others[0].label} plan
          </button>
        )}
        {extraActions}
        {mode === "layout" && !standalone && layout && (
          <button type="button" className="btn-ghost btn-sm" title="Keep a copy of this layout in Floor Plans, without the guests" onClick={() => {
            const plan = planFromWedding(p, fn.id, fn.id ? fn.label : "");
            if (plan) {
              addFloorPlan(plan);
              setSaved(plan.id);
            }
          }}>Save as a floor plan</button>
        )}
        {saved && <a className="text-xs" href={`#/plans/${saved}/layout`}>Saved in Floor Plans →</a>}
        {mode === "layout" && (
          <button type="button" className="btn-ghost btn-sm ml-auto" onClick={() => setTutorial(startTutorial())}>🎓 Tutorial</button>
        )}
        {layout && (
          <div className="flex overflow-hidden rounded-sm border border-solid border-line" role="group" aria-label="View">
            {(["2d", "3d"] as const).map((m) => (
              <button key={m} type="button" data-tutorial={m === "3d" ? "view-3d" : undefined} aria-pressed={view.mode === m} onClick={() => { setView({ mode: m }); if (m === "3d") emit("3d"); }}
                className={`border-0 px-4 py-1.5 text-sm font-medium ${view.mode === m ? "bg-primary text-on-primary" : "bg-card text-ink-2"}`}>
                {m.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>
      {show3d ? (
        <Suspense fallback={<div className="grid h-80 place-items-center rounded-lg border border-line bg-paper-2 text-sm text-stone">Building the 3D view…</div>}>
          <Plan3D key={fn.id} layout={layout} title={[p.client.name, fn.id ? fn.label : ""].filter(Boolean).join(" ")}
            {...(mode === "seating"
              ? { seatTone: (it: LayoutItem, i: number) => { const g = who(it, i); return g ? SIDE_TONE[g.side] : undefined; }, seatName: (it: LayoutItem, i: number) => who(it, i)?.name }
              : {})} />
          <p className="m-0 text-xs text-stone">3D is for looking round. Switch to 2D to {mode === "layout" ? "move or change things" : "seat guests"}.</p>
        </Suspense>
      ) : mode === "layout" ? (
        <LayoutEditor key={fn.id} p={p} fnId={fn.id} onSave={(l) => onUpdate((cur) => setLayout(cur, fn.id, l))} onEvent={emit} />
      ) : (
        <Suspense fallback={<p className="hint" role="status">Opening seating…</p>}>
          <SeatingBoard key={fn.id} p={p} fnId={fn.id} onUpdate={onUpdate} />
        </Suspense>
      )}
      {tut && <PlanTutorial state={tut} onChange={setTutorial} onClose={() => setTutorial(null)} />}
    </div>
  );
}
