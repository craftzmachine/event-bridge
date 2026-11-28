// The workspace's Layout and Seating tabs: pick a function, then edit its floor plan or seat its guests, in 2D,
// or look round it in 3D (a viewer; three.js loads only when 3D is opened).
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { onTutorialEvent, startTutorial, type TutorialEvent, type TutorialState } from "../lib/planTutorial";
import PlanTutorial, { readTutorial, writeTutorial } from "./layout/PlanTutorial";
import { planFromWedding } from "../lib/floorPlans";
import { addFloorPlan } from "../state/floorPlans";
import type { LayoutItem, Proposal, VenueLayout } from "../types";
import { functionHeading } from "../lib/functions";
import { guestFunctions } from "../lib/guestList";
import { guestOf, normalise, tablesOf } from "../lib/seating";
import LayoutEditor from "./LayoutEditor";
import HelpButton from "./help/HelpButton";
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

  // fullscreen: the browser's own where it's allowed, else the editor fills the window (iPhone)
  const root = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState<"native" | "window" | null>(null);
  const fullRef = useRef(full);
  fullRef.current = full;
  const toggleFull = async () => {
    if (fullRef.current === "native") return void document.exitFullscreen?.().catch(() => setFull(null));
    if (fullRef.current === "window") return setFull(null);
    const el = root.current;
    if (el?.requestFullscreen && document.fullscreenEnabled) {
      // some embedded views never answer the request, so give it a moment, then fill the window instead
      const answered = await Promise.race([el.requestFullscreen().then(() => true, () => false), new Promise<boolean>((r) => setTimeout(() => r(false), 900))]);
      if (answered || document.fullscreenElement === el) return;
    }
    setFull("window");
  };
  useEffect(() => {
    const change = () => setFull(document.fullscreenElement && document.fullscreenElement === root.current ? "native" : (f) => (f === "native" ? null : f));
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t?.closest?.("input, textarea, select, [contenteditable]") || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        void toggleFull();
      } else if (e.key === "Escape" && fullRef.current === "window") setFull(null);
    };
    document.addEventListener("fullscreenchange", change);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("fullscreenchange", change);
      window.removeEventListener("keydown", key);
    };
  }, []);
  // filling the window: keep the page behind from scrolling
  useEffect(() => {
    if (full !== "window") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [full]);
  const isFull = !!full;

  return (
    <div ref={root} className={isFull ? "fixed inset-0 z-[70] flex flex-col gap-3 overflow-hidden bg-paper p-3 text-ink sm:p-4" : "grid gap-4"}>
      <div className="flex flex-wrap items-center gap-2">
        {isFull && <strong className="mr-2 font-serif text-lg font-normal text-ink">{[p.client.name, fn.id ? fn.label : ""].filter(Boolean).join(" · ") || "Floor plan"}</strong>}
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
        <HelpButton topic={standalone ? "plans" : "layout"} />
        <button type="button" className={`btn-sm ${isFull ? "btn-primary" : "btn-ghost"}${mode === "layout" ? "" : " ml-auto"}`} onClick={() => void toggleFull()}
          title={isFull ? "Exit fullscreen (F or Esc)" : "Fullscreen (F)"} aria-pressed={isFull}>
          {isFull ? "✕ Exit fullscreen" : "⛶ Fullscreen"}
        </button>
      </div>
      {show3d ? (
        <Suspense fallback={<div className="grid h-80 place-items-center rounded-lg border border-line bg-paper-2 text-sm text-stone">Building the 3D view…</div>}>
          <div className={isFull ? "min-h-0 flex-1" : undefined}>
          <Plan3D key={fn.id} full={isFull} layout={layout} title={[p.client.name, fn.id ? fn.label : ""].filter(Boolean).join(" ")}
            {...(mode === "seating"
              ? { seatTone: (it: LayoutItem, i: number) => { const g = who(it, i); return g ? SIDE_TONE[g.side] : undefined; }, seatName: (it: LayoutItem, i: number) => who(it, i)?.name }
              : {})} />
          </div>
          <p className="m-0 text-xs text-stone">3D is for looking round. Switch to 2D to {mode === "layout" ? "move or change things" : "seat guests"}.</p>
        </Suspense>
      ) : mode === "layout" ? (
        <LayoutEditor key={fn.id} p={p} fnId={fn.id} onSave={(l) => onUpdate((cur) => setLayout(cur, fn.id, l))} onEvent={emit} full={isFull} />
      ) : (
        <Suspense fallback={<p className="hint" role="status">Opening seating…</p>}>
          <SeatingBoard key={fn.id} p={p} fnId={fn.id} onUpdate={onUpdate} full={isFull} />
        </Suspense>
      )}
      {tut && <PlanTutorial state={tut} onChange={setTutorial} onClose={() => setTutorial(null)} />}
    </div>
  );
}
