import { useEffect, useMemo, useRef, useState } from "react";
import type { Line, Proposal } from "../types";
import { elementFits, useConfig } from "../config/context";
import { customLine, lineFromElement } from "../state/proposals";
import { computeTotals, roundOffSuggestions } from "../lib/totals";
import { formatINR, formatINRShort } from "../lib/format";
import { eventDates, proposalTitle } from "../lib/proposal";
import { proposalStatus, statusPatch, STATUSES } from "../lib/status";
import StepRail, { STEPS } from "../components/StepRail";
import ImageChoiceCard from "../components/ImageChoiceCard";
import ElementCard from "../components/ElementCard";
import LineEditor from "../components/LineEditor";
import TotalsPanel from "../components/TotalsPanel";
import ProposalPreview from "../components/ProposalPreview";
import MoneyInput from "../components/MoneyInput";
import AppearanceControls from "../components/AppearanceControls";
import EventDatesField from "../components/EventDatesField";

export default function Builder({ proposal: p, onChange, onClose }: { proposal: Proposal; onChange: (p: Proposal) => void; onClose: () => void }) {
  const { catalog, brand } = useConfig();
  const occasionChosen = !!p.eventType && !!p.style;
  const [step, setStep] = useState(() => (!p.client.name ? 0 : !occasionChosen ? 1 : p.lines.length ? 3 : 2));
  // always build on the latest version, so quick successive edits don't overwrite each other
  const latest = useRef(p);
  latest.current = p;
  const set: SetFn = (patch) => {
    const next = { ...latest.current, ...(typeof patch === "function" ? patch(latest.current) : patch) };
    latest.current = next;
    onChange(next);
  };
  const setClient = (patch: Partial<Proposal["client"]>) => set((cur) => ({ client: { ...cur.client, ...patch } }));
  const t = computeTotals(p, brand.gstPct);
  // the mobile selection drawer sits on top of the step bar, whatever height it wraps to
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty("--nav-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const canReach = (i: number) => i <= 1 || occasionChosen;
  const go = (i: number) => {
    setStep(i);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="builder">
      <header className="topbar">
        <button className="btn-ghost btn-sm" onClick={onClose} aria-label="All proposals">
          ←<span className="hide-phone"> All proposals</span>
        </button>
        <img className="topbar-logo" src={`${import.meta.env.BASE_URL}${brand.logo}`} alt={brand.company} />
        <div className="topbar-title">
          <span className="eyebrow">{occasionChosen ? proposalTitle(p, catalog) : "New proposal"}</span>
          <strong>{p.client.name || "Untitled client"}</strong>
        </div>
        <div className="topbar-total">
          <span>Grand Total</span>
          <strong>{formatINRShort(t.grandTotal)}</strong>
        </div>
        <AppearanceControls />
      </header>
      <StepRail step={step} onStep={go} canReach={canReach} />

      <main className="stage" key={step}>
        {step === 0 && <ClientStep p={p} setClient={setClient} />}
        {step === 1 && <OccasionStep p={p} set={set} />}
        {step === 2 && <ElementsStep p={p} set={set} />}
        {step === 3 && <ReviewStep p={p} set={set} />}
      </main>

      <footer className="stepnav" ref={navRef}>
        <button className="btn-ghost" disabled={step === 0} onClick={() => go(step - 1)}>Back</button>
        <span className="stepnav-hint">
          {step === 1 && !occasionChosen ? "Choose an event type and a ceremony style to continue." : `Step ${step + 1} of ${STEPS.length} · saved automatically`}
        </span>
        {step < STEPS.length - 1 ? (
          <button className="btn-primary" disabled={!canReach(step + 1)} onClick={() => go(step + 1)}>
            Continue<span className="hide-phone"> to {STEPS[step + 1].toLowerCase()}</span>
          </button>
        ) : (
          <ExportButton p={p} />
        )}
      </footer>
    </div>
  );
}

type SetFn = (patch: Partial<Proposal> | ((cur: Proposal) => Partial<Proposal>)) => void;
type StepProps = { p: Proposal; set: SetFn };

function ClientStep({ p, setClient }: { p: Proposal; setClient: (c: Partial<Proposal["client"]>) => void }) {
  const { venues } = useConfig();
  // picking a directory venue fills its area into Location (unless one is already typed)
  const onVenue = (name: string) => {
    const match = venues.venues.find((v) => v.name.toLowerCase() === name.trim().toLowerCase());
    setClient(match && !p.client.location ? { venue: name, location: match.area } : { venue: name });
  };
  return (
    <section className="panel narrow">
      <p className="eyebrow">Step one</p>
      <h1>Who is celebrating?</h1>
      <p className="lede">The basics for the cover of the proposal. Anything you don't know yet can be filled in later.</p>
      <div className="form-grid">
        <label className="field field-wide">
          <span>Client name</span>
          <input autoFocus value={p.client.name} placeholder="e.g. Ms. Ananya Menon" onChange={(e) => setClient({ name: e.target.value })} />
        </label>
        <EventDatesField dates={eventDates(p)} onChange={(dates) => setClient({ dates, date: dates[0] ?? "" })} />
        <label className="field">
          <span>Contact number</span>
          <input type="tel" value={p.client.contact} placeholder="To be confirmed" onChange={(e) => setClient({ contact: e.target.value })} />
        </label>
        <label className="field">
          <span>Venue</span>
          <input value={p.client.venue} list="venue-directory" placeholder="Type or pick from the directory" onChange={(e) => onVenue(e.target.value)} />
          <datalist id="venue-directory">
            {venues.venues.map((v) => (
              <option key={v.id} value={v.name}>{v.area}</option>
            ))}
          </datalist>
        </label>
        <label className="field">
          <span>Location</span>
          <input value={p.client.location} placeholder="e.g. Kovalam" onChange={(e) => setClient({ location: e.target.value })} />
        </label>
        <div className="field">
          <span>Quotation reference</span>
          <output className="ref-badge" aria-live="polite">{p.ref || "Assigning…"}</output>
          <small className="hint">Generated automatically (year · day · month · letters) and unique.</small>
        </div>
      </div>
    </section>
  );
}

function OccasionStep({ p, set }: StepProps) {
  const { catalog } = useConfig();
  return (
    <section className="panel">
      <p className="eyebrow">Step two</p>
      <h1>{p.eventType && p.style ? proposalTitle(p, catalog) : "Set the occasion"}</h1>
      <p className="lede">Any event type pairs with any ceremony style. The element list on the next step is tailored to your choice.</p>
      <h3 className="group-h">Event type</h3>
      <div className="choices">
        {catalog.eventTypes.map((c) => (
          <ImageChoiceCard key={c.id} choice={c} selected={p.eventType === c.id} onSelect={() => set({ eventType: c.id })} />
        ))}
      </div>
      <h3 className="group-h">Ceremony style</h3>
      <div className="choices">
        {catalog.ceremonyStyles.map((c) => (
          <ImageChoiceCard key={c.id} choice={c} selected={p.style === c.id} onSelect={() => set({ style: c.id })} />
        ))}
      </div>
    </section>
  );
}

function ElementsStep({ p, set }: StepProps) {
  const { catalog, brand } = useConfig();
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const cats = useMemo(() => [...catalog.categories].sort((a, b) => a.order - b.order), [catalog]);
  const t = computeTotals(p, brand.gstPct);

  const visible = catalog.elements.filter((e) => {
    const fits = elementFits(e, p.eventType, p.style);
    if (!showAll && !fits) return false;
    if (cat !== "all" && e.category !== cat) return false;
    const s = q.trim().toLowerCase();
    return !s || e.name.toLowerCase().includes(s) || e.description?.toLowerCase().includes(s);
  });
  const counts = new Map<string, number>();
  p.lines.forEach((l) => l.elementId && counts.set(l.elementId, (counts.get(l.elementId) ?? 0) + 1));

  const setLines = (fn: (lines: Line[]) => Line[]) => set((cur) => ({ lines: fn(cur.lines) }));
  const add = (l: Line) => {
    setLines((ls) => [...ls, l]);
    setOpen(l.uid);
  };
  const move = (uid: string, dir: -1 | 1) =>
    setLines((ls) => {
      const i = ls.findIndex((x) => x.uid === uid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ls.length) return ls;
      const next = [...ls];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <section className="elements">
      <div className="catalogue">
        <p className="eyebrow">Step three · {proposalTitle(p, catalog)}</p>
        <h1>Curate the elements</h1>
        <div className="filters">
          <input className="search" type="search" placeholder="Search elements…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search elements" />
          <label className="check">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            <span>Show elements for other occasions too</span>
          </label>
        </div>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={cat === "all"} className={cat === "all" ? "is-on" : ""} onClick={() => setCat("all")}>All</button>
          {cats.map((c) => (
            <button key={c.id} role="tab" aria-selected={cat === c.id} className={cat === c.id ? "is-on" : ""} onClick={() => setCat(c.id)}>{c.label}</button>
          ))}
        </div>
        {cats
          .filter((c) => cat === "all" || c.id === cat)
          .map((c) => {
            const items = visible.filter((e) => e.category === c.id);
            if (!items.length) return null;
            return (
              <div key={c.id} className="cat-group">
                <h3 className="group-h">{c.label}</h3>
                <div className="el-grid">
                  {items.map((e) => (
                    <ElementCard key={e.id} element={e} count={counts.get(e.id) ?? 0} fits={elementFits(e, p.eventType, p.style)} onAdd={() => add(lineFromElement(e))} />
                  ))}
                </div>
              </div>
            );
          })}
        {!visible.length && <p className="empty">No elements match. Try another category or clear the search.</p>}
        <button className="btn-ghost add-custom" onClick={() => add(customLine(cat === "all" ? cats[0]?.id ?? "other" : cat))}>
          + Add a custom element
        </button>
      </div>

      {sheet && <div className="sheet-backdrop" onClick={() => setSheet(false)} aria-hidden />}
      <aside className={`basket ${sheet ? "is-open" : ""}`} aria-label="Selected elements">
        <button className="basket-handle" onClick={() => setSheet(!sheet)} aria-expanded={sheet}>
          <span>{p.lines.length} selected</span>
          <strong>{formatINRShort(t.grandTotal)}</strong>
          <span className="basket-chev">{sheet ? "Hide" : "View"}</span>
        </button>
        <div className="basket-inner">
          <h2>Your selection</h2>
          {!p.lines.length && <p className="empty">Add elements from the list. Tap a selected element to set quantity, price, notes and upgrades.</p>}
          <ol className="lines">
            {p.lines.map((l, i) => (
              <LineEditor key={l.uid} line={l} index={i} expanded={open === l.uid}
                onToggle={() => setOpen(open === l.uid ? null : l.uid)}
                onChange={(nl) => setLines((ls) => ls.map((x) => (x.uid === l.uid ? nl : x)))}
                onRemove={() => setLines((ls) => ls.filter((x) => x.uid !== l.uid))}
                onMove={(d) => move(l.uid, d)} />
            ))}
          </ol>
          {p.lines.length > 0 && <TotalsPanel t={t} pct={p.coordinationPct} compact />}
        </div>
      </aside>
    </section>
  );
}

function ReviewStep({ p, set }: StepProps) {
  const { brand } = useConfig();
  const t = computeTotals(p, brand.gstPct);
  const suggestions = roundOffSuggestions(t.beforeRound);
  return (
    <section className="review">
      <div className="review-side">
        <p className="eyebrow">Step four</p>
        <h1>Review &amp; finish</h1>
        <div className="side-card">
          <h3 id="status-title">Status</h3>
          <div className="seg status-seg" role="group" aria-labelledby="status-title">
            {STATUSES.map((s) => (
              <button key={s.id} type="button" className={proposalStatus(p) === s.id ? "is-on" : ""} aria-pressed={proposalStatus(p) === s.id}
                onClick={() => set((cur) => statusPatch(cur, s.id))}>
                {s.label}
              </button>
            ))}
          </div>
          <p className="hint">Mark it sent once the client has it, then accepted or lost when they decide.</p>
        </div>
        <div className="side-card">
          <h3>Pricing</h3>
          <label className="field">
            <span>{brand.coordinationLabel} (%)</span>
            <input type="number" min={0} step="0.5" value={p.coordinationPct} onChange={(e) => set({ coordinationPct: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
          <div className="field">
            <span>Grand Total quoted to client</span>
            <MoneyInput label="Grand Total" placeholder={formatINR(t.beforeRound).replace("₹ ", "")} value={p.grandTotal} onChange={(n) => set({ grandTotal: n })} />
          </div>
          <p className="hint">Before round-off: {formatINR(t.beforeRound)}</p>
          <div className="chips">
            {suggestions.map((s) => (
              <button key={s} className="chip" onClick={() => set({ grandTotal: s })}>{formatINRShort(s)}</button>
            ))}
            {p.grandTotal !== null && <button className="chip chip-muted" onClick={() => set({ grandTotal: null })}>No round-off</button>}
          </div>
        </div>
        <div className="side-card">
          <h3>Notes on the proposal</h3>
          <textarea rows={3} value={p.notes} placeholder="Anything the client should know" onChange={(e) => set({ notes: e.target.value })} />
        </div>
        <div className="side-card side-terms">
          <h3>Terms &amp; conditions</h3>
          <ol className="terms-edit">
            {p.terms.map((term, i) => (
              <li key={i}>
                <textarea rows={2} value={term} aria-label={`Term ${i + 1}`}
                  onChange={(e) => set({ terms: p.terms.map((x, j) => (j === i ? e.target.value : x)) })} />
                <button className="icon-btn icon-danger" aria-label={`Remove term ${i + 1}`} onClick={() => set({ terms: p.terms.filter((_, j) => j !== i) })}>×</button>
              </li>
            ))}
          </ol>
          <div className="chips">
            <button className="chip" onClick={() => set({ terms: [...p.terms, ""] })}>+ Add a term</button>
            <button className="chip chip-muted" onClick={() => set({ terms: [...brand.terms] })}>Reset to standard</button>
          </div>
        </div>
        <ExportButton p={p} wide />
      </div>
      <ProposalPreview p={p} />
    </section>
  );
}

/** Split button: "Export to Excel", with a ▾ menu for the PDF. Both libraries load only when used. */
function ExportButton({ p, wide = false }: { p: Proposal; wide?: boolean }) {
  const { catalog, brand } = useConfig();
  const [busy, setBusy] = useState<"" | "xlsx" | "pdf">("");
  const [err, setErr] = useState("");
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);

  const run = async (kind: "xlsx" | "pdf") => {
    setMenu(false);
    setBusy(kind);
    setErr("");
    try {
      if (kind === "xlsx") await (await import("../lib/exportXlsx")).downloadXlsx(p, catalog, brand);
      else await (await import("../lib/exportPdf")).downloadPdf(p, catalog, brand);
    } catch (e) {
      setErr(`Export failed: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  };
  const disabled = !!busy || !p.lines.length;

  return (
    <div className={`export ${wide ? "export-wide" : "export-up"}`} ref={ref}>
      <div className="split">
        <button className="btn-primary split-main" disabled={disabled} onClick={() => run("xlsx")}>
          {busy === "xlsx" ? "Preparing…" : busy === "pdf" ? "Preparing PDF…" : "Export to Excel"}
        </button>
        <button className="btn-primary split-toggle" disabled={disabled} aria-haspopup="menu" aria-expanded={menu} aria-label="More export options" onClick={() => setMenu((m) => !m)}>
          <span aria-hidden>▾</span>
        </button>
      </div>
      {menu && (
        <div className="export-menu" role="menu">
          <button role="menuitem" onClick={() => run("xlsx")}>
            <span className="export-ic" aria-hidden>XLS</span>
            <span>Excel workbook<small>Editable, with live formulas</small></span>
          </button>
          <button role="menuitem" onClick={() => run("pdf")}>
            <span className="export-ic export-ic-pdf" aria-hidden>PDF</span>
            <span>PDF document<small>Ready to send to the client</small></span>
          </button>
        </div>
      )}
      {err && <p className="error" role="alert">{err}</p>}
    </div>
  );
}
