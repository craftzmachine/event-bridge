// The floor-plan tutorial's coach card: which step you're on, what to do, a ring round the thing to use, and a tick
// when you've done it. The steps and their logic live in src/lib/planTutorial.ts.
import { useEffect, useState } from "react";
import { TUTORIAL, backStep, finished, skipStep, type TutorialState } from "../../lib/planTutorial";

const KEY = "event-bridge.plan-tutorial.v1";

export function readTutorial(): TutorialState | null {
  try {
    const x = JSON.parse(localStorage.getItem(KEY) ?? "null") as TutorialState | null;
    return x && typeof x.step === "number" && Array.isArray(x.done) ? x : null;
  } catch {
    return null;
  }
}

export function writeTutorial(s: TutorialState | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: for this visit only */
  }
}

/** a ring drawn round [data-tutorial="target"], following it as the page moves */
function Spotlight({ target }: { target?: string }) {
  const [box, setBox] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!target) {
      setBox(null);
      return;
    }
    let raf = 0;
    let last = "";
    const tick = () => {
      const el = document.querySelector(`[data-tutorial="${target}"]`);
      const r = el?.getBoundingClientRect() ?? null;
      const key = r ? `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}` : "";
      if (key !== last) {
        last = key;
        setBox(r && r.width ? r : null);
      }
      raf = window.setTimeout(tick, 250) as unknown as number;
    };
    tick();
    return () => window.clearTimeout(raf);
  }, [target]);
  if (!box) return null;
  const pad = 6;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed z-[60] rounded-md border-2 border-solid border-gold transition-all duration-300"
      style={{ left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2, boxShadow: "0 0 0 4px color-mix(in srgb, var(--gold) 25%, transparent)" }} />
  );
}

export default function PlanTutorial({ state, onChange, onClose }: { state: TutorialState; onChange: (s: TutorialState) => void; onClose: () => void }) {
  const done = finished(state);
  const step = TUTORIAL[Math.min(state.step, TUTORIAL.length - 1)];
  const pct = Math.round((state.done.length / TUTORIAL.length) * 100);
  return (
    <>
      {!done && <Spotlight target={step.target} />}
      <section className="fixed bottom-4 left-4 z-[61] w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-solid border-gold bg-card p-4 text-ink" role="dialog" aria-live="polite" aria-label="Floor plan tutorial">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs text-stone">{done ? "Tutorial complete" : `Step ${state.step + 1} of ${TUTORIAL.length}`}</span>
          <button type="button" className="ml-auto border-0 bg-transparent p-0 text-lg leading-none text-stone hover:text-ink" aria-label="Close the tutorial" onClick={onClose}>×</button>
        </div>
        <div className="mb-3 h-1 overflow-hidden rounded-full bg-paper-2" aria-hidden="true">
          <div className="h-full bg-gold transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        {done ? (
          <>
            <h3 className="m-0 font-serif text-2xl">You're ready ✓</h3>
            <p className="m-0 mt-1 text-sm text-ink-2">
              You've added and moved tables, resized them, changed chairs, laid an aisle, sized the mandap, set seats for every table, counted the inventory and looked round in 3D. Restart the tutorial any time from the Tutorial button.
            </p>
            <div className="mt-3 flex justify-end">
              <button type="button" className="btn-primary btn-sm" onClick={onClose}>Finish</button>
            </div>
          </>
        ) : (
          <>
            <h3 className="m-0 font-serif text-xl">{step.title}</h3>
            <p className="m-0 mt-1 text-sm text-ink-2">{step.text}</p>
            <p className="m-0 mt-2 text-xs text-gold-text">It ticks off by itself when you do it.</p>
            <div className="mt-3 flex items-center gap-2">
              <button type="button" className="btn-ghost btn-sm" disabled={state.step === 0} onClick={() => onChange(backStep(state))}>Back</button>
              <button type="button" className="link-btn ml-auto" onClick={() => onChange(skipStep(state))}>Skip this step</button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
