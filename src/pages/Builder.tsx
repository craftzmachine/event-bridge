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
import ShareDialog, { type ShareFormat } from "../components/ShareDialog";
import PagePreview from "../components/PagePreview";
import ThemePicker from "../components/ThemePicker";
import BudgetMeter from "../components/BudgetMeter";
import { packageFromProposal, usePackages } from "../state/packages";
import { applyGuests, capacityWarning, guestQty } from "../lib/guests";
import { THEMES, useAppearance, type ThemeId } from "../state/appearance";

export default function Builder({
  proposal: p,
  onChange,
  onClose,
  onReauth,
}: {
  proposal: Proposal;
  onChange: (p: Proposal) => void;
  onClose: () => void;
  /** sharing found the server session gone: sign in again and come back */
  onReauth: () => void;
}) {
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
        {step === 0 && <ClientStep p={p} set={set} setClient={setClient} />}
        {step === 1 && <OccasionStep p={p} set={set} />}
        {step === 2 && <ElementsStep p={p} set={set} />}
        {step === 3 && <ReviewStep p={p} set={set} onReauth={onReauth} />}
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
const latestGuests = (p: Proposal) => (p.client.guests && p.client.guests > 0 ? p.client.guests : null);
type StepProps = { p: Proposal; set: SetFn };

function ClientStep({ p, set, setClient }: StepProps & { setClient: (c: Partial<Proposal["client"]>) => void }) {
  const { venues } = useConfig();
  // a new guest count updates every line priced per guest
  const setGuests = (n: number | null) => set((cur) => ({ client: { ...cur.client, guests: n }, lines: applyGuests(cur.lines, n) }));
  const capacity = capacityWarning(p, venues.venues);
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
        <label className="field">
          <span>Guests expected</span>
          <input type="number" min={0} step={10} inputMode="numeric" value={p.client.guests ?? ""} placeholder="e.g. 600"
            onChange={(e) => setGuests(e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value) || 0)))} />
          <small className="hint">Elements priced per guest follow this number.</small>
        </label>
        <div className="field">
          <span>Family's budget</span>
          <MoneyInput label="Budget" placeholder="Not shared yet" value={p.client.budget ?? null} onChange={(n) => setClient({ budget: n })} />
          <small className="hint">The quote is measured against it as you add elements.</small>
        </div>
        {capacity && <p className="notice field-wide" role="status">{capacity}</p>}
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
    const g = latestGuests(p);
    const placed = l.perGuest && g ? { ...l, qty: guestQty(g, l.perGuest) } : l;
    setLines((ls) => [...ls, placed]);
    setOpen(l.uid);
  };
  const swap = (uid: string, next: Line) => setLines((ls) => ls.map((x) => (x.uid === uid ? next : x)));
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
              <LineEditor key={l.uid} line={l} index={i} expanded={open === l.uid} guests={p.client.guests ?? null}
                onToggle={() => setOpen(open === l.uid ? null : l.uid)}
                onChange={(nl) => setLines((ls) => ls.map((x) => (x.uid === l.uid ? nl : x)))}
                onRemove={() => setLines((ls) => ls.filter((x) => x.uid !== l.uid))}
                onMove={(d) => move(l.uid, d)} />
            ))}
          </ol>
          {p.lines.length > 0 && <TotalsPanel t={t} pct={p.coordinationPct} compact />}
          {p.lines.length > 0 && <BudgetMeter p={p} onSwap={swap} compact />}
        </div>
      </aside>
    </section>
  );
}

/**
 * How the client gets it: a PDF document, or a web page in a chosen theme behind a private link.
 * Either can be shared as a private link; the PDF can also be downloaded and sent another way.
 */
function Deliver({ p, set, onReauth }: StepProps & { onReauth: () => void }) {
  const { catalog, brand } = useConfig();
  const { theme: siteTheme } = useAppearance();
  const [format, setFormat] = useState<ShareFormat>("page");
  const [open, setOpen] = useState<"" | "preview" | "share">("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // the page keeps the theme picked for it last time, else the one the planner is using
  const theme: ThemeId = THEMES.some((t) => t.id === p.pageTheme) ? (p.pageTheme as ThemeId) : siteTheme;
  const setTheme = (t: ThemeId) => set({ pageTheme: t });
  const empty = !p.lines.length;

  const downloadPdf = async () => {
    setBusy(true);
    setErr("");
    try {
      await (await import("../lib/exportPdf")).downloadPdf(p, catalog, brand);
    } catch (e) {
      setErr(`Export failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="side-card deliver">
      <h3 id="deliver-title">Send it to the client</h3>
      <div className="deliver-choice" role="radiogroup" aria-labelledby="deliver-title">
        {(
          [
            { id: "page", label: "Web page", text: "A private page in your chosen theme. Clients can approve it or ask for changes." },
            { id: "pdf", label: "PDF", text: "A print-ready A4 file to download, or share behind a link." },
          ] as const
        ).map((o) => (
          <label key={o.id} className={format === o.id ? "is-on" : ""}>
            <input type="radio" name="deliver" value={o.id} checked={format === o.id} onChange={() => setFormat(o.id)} />
            <strong>{o.label}</strong>
            <small>{o.text}</small>
          </label>
        ))}
      </div>
      {format === "page" ? (
        <>
          <ThemePicker value={theme} onChange={setTheme} />
          <div className="deliver-actions">
            <button className="btn-ghost" disabled={empty} onClick={() => setOpen("preview")}>Preview page</button>
            <button className="btn-primary" disabled={empty} onClick={() => setOpen("share")}>Create private link</button>
          </div>
        </>
      ) : (
        <div className="deliver-actions">
          <button className="btn-ghost" disabled={empty || busy} onClick={downloadPdf}>{busy ? "Preparing PDF…" : "Download PDF"}</button>
          <button className="btn-primary" disabled={empty} onClick={() => setOpen("share")}>Share as private link</button>
        </div>
      )}
      {empty && <p className="hint">Add elements first.</p>}
      {err && <p className="error" role="alert">{err}</p>}

      {open === "preview" && <PagePreview p={p} theme={theme} onTheme={setTheme} onClose={() => setOpen("")} onShare={() => setOpen("share")} />}
      {open === "share" && (
        <ShareDialog
          p={p}
          format={format}
          theme={theme}
          onTheme={setTheme}
          onClose={() => setOpen("")}
          onReauth={onReauth}
          // the client now has it: mark it sent (an accepted or lost proposal keeps its status)
          onShared={(share) => set((cur) => ({ shareId: share.id, ...(proposalStatus(cur) === "draft" ? statusPatch(cur, "sent") : {}) }))}
        />
      )}
    </div>
  );
}

/** Keeps this proposal's occasion and elements (no client, dates, payments or costs) as a package for next time. */
function SavePackage({ p }: { p: Proposal }) {
  const { catalog } = useConfig();
  const { save } = usePackages();
  const [name, setName] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  if (!p.lines.length) return null;
  if (name === null)
    return (
      <div className="save-pkg">
        <button className="link-btn" onClick={() => { setSaved(""); setName(`${proposalTitle(p, catalog)} package`); }}>Save as a package for next time</button>
        {saved && <p className="hint" role="status">Saved “{saved}”. Find it under “Start from a package”.</p>}
      </div>
    );
  return (
    <form
      className="save-pkg is-open"
      onSubmit={(e) => {
        e.preventDefault();
        const pk = packageFromProposal(p, name);
        save(pk);
        setSaved(pk.name);
        setName(null);
      }}
    >
      <label className="field">
        <span>Package name</span>
        <input autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </label>
      <p className="hint">Keeps the occasion, elements, functions and terms. Leaves out the client, dates, payments and internal costs.</p>
      <div className="save-pkg-actions">
        <button type="button" className="btn-ghost btn-sm" onClick={() => setName(null)}>Cancel</button>
        <button type="submit" className="btn-primary btn-sm">Save package</button>
      </div>
    </form>
  );
}

function ReviewStep({ p, set, onReauth }: StepProps & { onReauth: () => void }) {
  const { brand, venues } = useConfig();
  const capacity = capacityWarning(p, venues.venues);
  const swap = (uid: string, next: Line) => set((cur) => ({ lines: cur.lines.map((x) => (x.uid === uid ? next : x)) }));
  const t = computeTotals(p, brand.gstPct);
  const suggestions = roundOffSuggestions(t.beforeRound);
  return (
    <section className="review">
      <div className="review-side">
        <p className="eyebrow">Step four</p>
        <h1>Review &amp; finish</h1>
        {capacity && <p className="notice" role="status">{capacity}</p>}
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
          <BudgetMeter p={p} onSwap={swap} />
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
        <Deliver p={p} set={set} onReauth={onReauth} />
        <ExportButton p={p} wide />
        <SavePackage p={p} />
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
