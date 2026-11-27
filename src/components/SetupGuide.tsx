// "Set up Event Bridge": a first-run checklist on the Dashboard for a new company. Each step ticks itself off from real
// data on this device (settings saved, an enquiry, a proposal, a share), and the card can be hidden once read.
import { useState } from "react";
import { readLeads } from "../state/crm";
import { readSettings } from "../state/settings";
import type { Proposal } from "../types";

const HIDDEN = "event-bridge.setup-hidden.v1";

interface Step {
  title: string;
  hint: string;
  href?: string;
  action?: () => void;
  cta: string;
  done: boolean;
}

function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN) === "1";
  } catch {
    return false;
  }
}

export default function SetupGuide({ list, onNew }: { list: Proposal[]; onNew: () => void }) {
  const [hidden, setHidden] = useState(readHidden);
  const settings = readSettings();
  const steps: Step[] = [
    { title: "Add your company details and logo", hint: "They go on every proposal, PDF and receipt.", href: "#/settings", cta: "Open Settings", done: !!settings.brand },
    { title: "Make the catalogue yours", hint: "Your categories, elements and starting rates.", href: "#/settings", cta: "Edit catalogue", done: !!settings.catalog },
    { title: "Record your first enquiry", hint: "Track it from first message to booking.", href: "#/crm", cta: "Open the CRM", done: readLeads().length > 0 },
    { title: "Build your first proposal", hint: "Pick the occasion, add elements, review the preview.", action: onNew, cta: "New proposal", done: list.length > 0 },
    { title: "Share it with the family", hint: "A private, password-protected page they can approve.", href: "#/studio", cta: "Open the Studio", done: list.some((p) => !!p.shareId) },
  ];
  const done = steps.filter((s) => s.done).length;
  if (hidden || done === steps.length) return null;
  const next = steps.find((s) => !s.done);
  const hide = () => {
    try {
      localStorage.setItem(HIDDEN, "1");
    } catch {
      /* storage blocked: hidden for this visit */
    }
    setHidden(true);
  };

  return (
    <section className="mb-6 rounded-lg border border-line bg-card p-5 sm:p-6" aria-labelledby="setup-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="setup-title" className="m-0 font-serif text-2xl text-ink">Set up Event Bridge</h2>
          <p className="m-0 mt-1 text-sm text-ink-2">{done} of {steps.length} done. Each step ticks itself off as you go.</p>
        </div>
        <button type="button" className="link-btn" onClick={hide}>Hide this</button>
      </div>
      <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-paper-2" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done} aria-label="Setup progress">
        <div className="h-full rounded-full bg-gold transition-[width] duration-500" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="m-0 grid list-none gap-2 p-0">
        {steps.map((s, i) => {
          const isNext = s === next;
          return (
            <li key={s.title} className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border px-4 py-3 ${isNext ? "border-gold bg-gold-wash" : "border-line"}`}>
              <span aria-hidden="true" className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-sm ${s.done ? "border-gold bg-gold text-on-accent" : "border-taupe text-stone"}`}>
                {s.done ? "✓" : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`m-0 text-[15px] ${s.done ? "text-stone line-through decoration-taupe" : "text-ink"}`}>
                  {s.title}
                  {s.done && <span className="sr-only"> (done)</span>}
                </p>
                {!s.done && <p className="m-0 text-xs text-ink-2">{s.hint}</p>}
              </div>
              {!s.done &&
                (s.action ? (
                  <button type="button" className={isNext ? "btn-primary btn-sm" : "btn-ghost btn-sm"} onClick={s.action}>{s.cta}</button>
                ) : (
                  <a className={isNext ? "btn-primary btn-sm" : "btn-ghost btn-sm"} href={s.href}>{s.cta}</a>
                ))}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
