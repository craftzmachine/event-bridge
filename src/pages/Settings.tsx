// Company settings: the details, logo, money defaults, terms and catalogue a company would otherwise edit in
// public/config. Saved on this device and laid over the files (src/lib/settings.ts); the layout uses Tailwind utilities.
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useConfig } from "../config/context";
import PageHeader from "../components/PageHeader";
import { assetUrl } from "../lib/asset";
import { saveBlob } from "../lib/files";
import { todayISO } from "../lib/format";
import { BRAND_FIELDS, checkSettings, LOGO_MAX_BYTES, newElement, readSettingsFile, settingsFile, uniqueId, type BrandOverrides, type CompanySettings } from "../lib/settings";
import { readSettings, writeSettings } from "../state/settings";
import type { Brand, Catalog, CatalogElement, Choice } from "../types";

type Tab = "company" | "money" | "terms" | "catalogue" | "backup";
const TABS: { id: Tab; label: string }[] = [
  { id: "company", label: "Company" },
  { id: "money", label: "Logo & money" },
  { id: "terms", label: "Terms" },
  { id: "catalogue", label: "Catalogue" },
  { id: "backup", label: "Backup" },
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** only what differs from the shipped files is saved, so later edits to brand.json still come through */
function overridesOf(base: Brand, b: Brand): BrandOverrides | undefined {
  const out: Record<string, unknown> = {};
  for (const k of BRAND_FIELDS) if (!same(base[k], b[k])) out[k] = b[k];
  return Object.keys(out).length ? (out as BrandOverrides) : undefined;
}

export default function Settings({ onSaved }: { onSaved: () => void }) {
  const config = useConfig();
  const base = config.base ?? { brand: config.brand, catalog: config.catalog };
  const [tab, setTab] = useState<Tab>("company");
  const [brand, setBrand] = useState<Brand>(config.brand);
  const [catalog, setCatalog] = useState<Catalog>(config.catalog);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const dirty = !same(brand, config.brand) || !same(catalog, config.catalog);

  const settings = (): CompanySettings => {
    const b = overridesOf(base.brand, brand);
    const c = same(catalog, base.catalog) ? undefined : catalog;
    return { ...(b ? { brand: b } : {}), ...(c ? { catalog: c } : {}) };
  };

  const save = () => {
    const s = settings();
    const errs = checkSettings(base.brand, s, config.packages);
    setErrors(errs);
    if (errs.length) return;
    if (!writeSettings(s)) {
      setErrors(["This browser wouldn't save the settings (storage is full or blocked). Try a smaller logo."]);
      return;
    }
    setNotice("Saved. New proposals and exports use these settings on this device.");
    onSaved();
  };

  const resetAll = () => {
    if (!window.confirm("Go back to the company's original details and catalogue on this device? Your saved settings will be removed.")) return;
    writeSettings({});
    setBrand(base.brand);
    setCatalog(base.catalog);
    setErrors([]);
    setNotice("Back to the original settings.");
    onSaved();
  };

  const setB = (patch: Partial<Brand>) => {
    setNotice("");
    setBrand((cur) => ({ ...cur, ...patch }));
  };
  const setContact = (patch: Partial<Brand["contact"]>) => setB({ contact: { ...brand.contact, ...patch } });

  return (
    <div className="ev-page settings-page mx-auto w-full max-w-5xl pb-28">
      <PageHeader help="settings"
        crumbs={[{ label: "Dashboard", href: "#/dashboard" }, { label: "Settings" }]}
        title="Company settings"
        subtitle="Your company details, logo, money defaults, terms and catalogue. They're used by every new proposal, PDF and Excel file made on this device."
      />

      {config.settingsIgnored?.map((m) => (
        <p key={m} className="mb-4 rounded-md border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger-ink" role="alert">{m}</p>
      ))}

      <div role="tablist" aria-label="Settings sections" className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px shrink-0 border-0 border-b-2 border-solid bg-transparent px-4 py-3 text-sm transition-colors ${tab === t.id ? "border-gold font-semibold text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "company" && (
        <div className="grid gap-6">
          <Section title="Company" hint="Printed at the top of proposals and on receipts.">
            <Grid>
              <Text label="Company name" value={brand.company} onChange={(v) => setB({ company: v })} />
              <Text label="Tagline" value={brand.tagline} onChange={(v) => setB({ tagline: v })} />
              <Text label="Legal name" hint="Who payments are made out to" value={brand.legalName} onChange={(v) => setB({ legalName: v })} />
              <Text label="GSTIN" value={brand.gstin} onChange={(v) => setB({ gstin: v.toUpperCase() })} />
              <Text label="Phone" value={brand.phone} inputMode="tel" onChange={(v) => setB({ phone: v })} />
              <Text label="Email" value={brand.email} type="email" onChange={(v) => setB({ email: v })} />
              <label className="field sm:col-span-2">
                <span>Address</span>
                <textarea rows={2} value={brand.address} onChange={(e) => setB({ address: e.target.value })} />
              </label>
            </Grid>
          </Section>
          <Section title="Point of contact" hint="The person named at the end of each proposal.">
            <Grid>
              <Text label="Name" value={brand.contact.name} onChange={(v) => setContact({ name: v })} />
              <Text label="Role" value={brand.contact.role} onChange={(v) => setContact({ role: v })} />
              <Text label="Phone" value={brand.contact.phone} inputMode="tel" onChange={(v) => setContact({ phone: v })} />
              <Text label="Email" value={brand.contact.email} type="email" onChange={(v) => setContact({ email: v })} />
            </Grid>
          </Section>
        </div>
      )}

      {tab === "money" && (
        <div className="grid gap-6">
          <LogoCard logo={brand.logo} company={brand.company} baseLogo={base.brand.logo} onChange={(logo) => setB({ logo })} onError={(m) => setErrors([m])} />
          <Section title="Money defaults" hint="New proposals start with these; each proposal can still change its co-ordination %.">
            <Grid>
              <Num label="Co-ordination %" value={brand.coordinationPct} onChange={(v) => setB({ coordinationPct: v })} />
              <Text label="Co-ordination label" value={brand.coordinationLabel} onChange={(v) => setB({ coordinationLabel: v })} />
              <Num label="GST %" value={brand.gstPct} onChange={(v) => setB({ gstPct: v })} />
              <Num label="Balance due (days before the first event)" value={brand.balanceDueDays ?? 7} step={1} onChange={(v) => setB({ balanceDueDays: Math.max(0, Math.round(v)) })} />
            </Grid>
          </Section>
        </div>
      )}

      {tab === "terms" && (
        <Section title="Standard terms" hint="Printed on every proposal, one per line. Each proposal can still edit its own.">
          <TermsEditor terms={brand.terms} onChange={(terms) => setB({ terms })} />
        </Section>
      )}

      {tab === "catalogue" && <CatalogueEditor catalog={catalog} onChange={(c) => { setNotice(""); setCatalog(c); }} />}

      {tab === "backup" && (
        <BackupCard
          onExport={() => saveBlob(new Blob([JSON.stringify(settingsFile(readSettings()), null, 2)], { type: "application/json" }), `Settings_${todayISO()}.json`)}
          onImport={(s) => {
            setBrand({ ...base.brand, ...(s.brand ?? {}), contact: { ...base.brand.contact, ...(s.brand?.contact ?? {}) } });
            setCatalog(s.catalog ?? base.catalog);
            setErrors([]);
            setNotice("Imported. Check the sections, then Save changes.");
          }}
          onError={(m) => setErrors([m])}
          onReset={resetAll}
          savedAt={readSettings().savedAt}
        />
      )}

      {/* the save bar stays in view while editing */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3 px-[var(--gutter)] py-3 pr-[84px] sm:pr-[220px]">
          <div className="min-w-0 flex-1 text-sm" aria-live="polite">
            {errors.length ? (
              <ul className="m-0 list-disc pl-5 text-danger-ink">
                {errors.slice(0, 4).map((e) => <li key={e}>{e}</li>)}
                {errors.length > 4 && <li>…and {errors.length - 4} more</li>}
              </ul>
            ) : notice ? (
              <span className="text-gold-text">{notice}</span>
            ) : dirty ? (
              <span className="text-ink-2">You have unsaved changes.</span>
            ) : (
              <span className="text-stone">Saved on this device only.</span>
            )}
          </div>
          <button type="button" className="btn-ghost" disabled={!dirty} onClick={() => { setBrand(config.brand); setCatalog(config.catalog); setErrors([]); }}>Discard</button>
          <button type="button" className="btn-primary" disabled={!dirty} onClick={save}>Save changes</button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, hint, children, actions }: { title: string; hint?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-card p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl leading-tight text-ink">{title}</h2>
          {hint && <p className="mt-1 text-sm text-ink-2">{hint}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

const Grid = ({ children }: { children: ReactNode }) => <div className="grid gap-4 sm:grid-cols-2">{children}</div>;

function Text({ label, hint, value, onChange, ...rest }: { label: string; hint?: string; value: string; onChange: (v: string) => void; type?: string; inputMode?: "tel" | "text" }) {
  return (
    <label className="field">
      <span>{label}{hint && <small className="ml-1 text-stone">({hint})</small>}</span>
      <input value={value} maxLength={300} onChange={(e) => onChange(e.target.value)} {...rest} />
    </label>
  );
}

function Num({ label, value, onChange, step = 0.5 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" inputMode="decimal" min={0} step={step} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))} />
    </label>
  );
}

function LogoCard({ logo, company, baseLogo, onChange, onError }: { logo: string; company: string; baseLogo: string; onChange: (l: string) => void; onError: (m: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) return onError("Choose a PNG, JPG, WebP or SVG image.");
    if (file.size > LOGO_MAX_BYTES) return onError("The logo is too large. Use an image under 400 KB.");
    const r = new FileReader();
    r.onload = () => onChange(String(r.result));
    r.readAsDataURL(file);
  };
  return (
    <Section title="Logo" hint="Shown in the app and embedded in every PDF and Excel file. A transparent PNG works best.">
      <div className="flex flex-wrap items-center gap-6">
        <div className="grid h-28 w-44 place-items-center rounded-md border border-line bg-paper-2 p-3">
          <img src={assetUrl(logo)} alt={`${company} logo`} className="max-h-full max-w-full object-contain" />
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          <button type="button" className="btn-ghost" onClick={() => input.current?.click()}>Upload a logo</button>
          {logo !== baseLogo && <button type="button" className="link-btn" onClick={() => onChange(baseLogo)}>Use the original</button>}
        </div>
      </div>
      <p className="mt-3 text-xs text-stone">Proposals shared as a web page show the logo published with the site, not one saved here.</p>
    </Section>
  );
}

function TermsEditor({ terms, onChange }: { terms: string[]; onChange: (t: string[]) => void }) {
  const set = (i: number, v: string) => onChange(terms.map((t, j) => (j === i ? v : t)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= terms.length) return;
    const next = [...terms];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="grid gap-3">
      {terms.map((t, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="mt-3 w-6 shrink-0 text-right text-sm tabular-nums text-stone">{i + 1}.</span>
          <textarea className="min-w-0 flex-1" rows={2} value={t} aria-label={`Term ${i + 1}`} onChange={(e) => set(i, e.target.value)} />
          <div className="flex shrink-0 flex-col">
            <button type="button" className="link-btn px-2" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button type="button" className="link-btn px-2" aria-label="Move down" disabled={i === terms.length - 1} onClick={() => move(i, 1)}>↓</button>
          </div>
          <button type="button" className="link-btn link-danger mt-2 px-2" aria-label={`Remove term ${i + 1}`} onClick={() => onChange(terms.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <div>
        <button type="button" className="btn-ghost" onClick={() => onChange([...terms, ""])}>+ Add a term</button>
      </div>
    </div>
  );
}

function CatalogueEditor({ catalog, onChange }: { catalog: Catalog; onChange: (c: Catalog) => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const cats = useMemo(() => [...catalog.categories].sort((a, b) => a.order - b.order), [catalog.categories]);
  const shown = catalog.elements.filter((e) => (!cat || e.category === cat) && (!q.trim() || `${e.name} ${e.description ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));
  const setEl = (id: string, patch: Partial<CatalogElement>) => onChange({ ...catalog, elements: catalog.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const addEl = () => {
    const e = newElement(catalog, cat || cats[0]?.id || "");
    onChange({ ...catalog, elements: [e, ...catalog.elements] });
    setOpenId(e.id);
    setQ("");
  };
  const removeEl = (e: CatalogElement) => {
    if (!window.confirm(`Remove "${e.name || "this element"}" from the catalogue? Proposals that already use it keep their copy.`)) return;
    onChange({ ...catalog, elements: catalog.elements.filter((x) => x.id !== e.id) });
  };
  const count = (id: string) => catalog.elements.filter((e) => e.category === id).length;

  return (
    <div className="grid gap-6">
      <Section title="Categories" hint="The sections of a proposal, in this order.">
        <div className="grid gap-2">
          {cats.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2">
              <input className="min-w-0 flex-1 rounded-sm border border-line bg-card px-3 py-2" aria-label="Category name" value={c.label} onChange={(e) => onChange({ ...catalog, categories: catalog.categories.map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)) })} />
              <span className="w-20 shrink-0 text-xs text-stone">{count(c.id)} items</span>
              <button type="button" className="link-btn px-2" aria-label="Move up" disabled={i === 0} onClick={() => onChange({ ...catalog, categories: reorder(cats, i, -1) })}>↑</button>
              <button type="button" className="link-btn px-2" aria-label="Move down" disabled={i === cats.length - 1} onClick={() => onChange({ ...catalog, categories: reorder(cats, i, 1) })}>↓</button>
              <button type="button" className="link-btn link-danger px-2" aria-label={`Remove ${c.label}`} disabled={count(c.id) > 0} title={count(c.id) ? "Move or remove its items first" : undefined} onClick={() => onChange({ ...catalog, categories: catalog.categories.filter((x) => x.id !== c.id) })}>×</button>
            </div>
          ))}
          <div>
            <button type="button" className="btn-ghost" onClick={() => onChange({ ...catalog, categories: [...catalog.categories, { id: uniqueId("new-category", catalog.categories.map((c) => c.id)), label: "New category", order: Math.max(0, ...catalog.categories.map((c) => c.order)) + 1 }] })}>+ Add a category</button>
          </div>
        </div>
      </Section>

      <Section
        title="Elements"
        hint={`${catalog.elements.length} items. Prices are the starting rate on a new proposal.`}
        actions={<button type="button" className="btn-primary" onClick={addEl}>+ Add element</button>}
      >
        <div className="mb-4 flex flex-wrap gap-3">
          <input className="search min-w-0 flex-1" type="search" placeholder="Search elements" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search elements" />
          <select className="rounded-sm border border-line bg-card px-3" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <ul className="m-0 list-none divide-y divide-line rounded-md border border-line p-0">
          {shown.map((e) => (
            <li key={e.id}>
              <button type="button" className="flex w-full items-center gap-3 border-0 bg-transparent px-4 py-3 text-left hover:bg-gold-wash" aria-expanded={openId === e.id} onClick={() => setOpenId(openId === e.id ? null : e.id)}>
                <span className="min-w-0 flex-1 truncate text-ink">{e.name || <em className="text-stone">Unnamed element</em>}</span>
                <span className="hidden text-xs text-stone sm:inline">{cats.find((c) => c.id === e.category)?.label}</span>
                <span className="w-28 shrink-0 text-right text-sm tabular-nums text-ink-2">{e.defaultPrice === null ? "As per actuals" : `₹${e.defaultPrice.toLocaleString("en-IN")}`}</span>
                <span aria-hidden="true" className={`text-stone transition-transform ${openId === e.id ? "rotate-90" : ""}`}>›</span>
              </button>
              {openId === e.id && <ElementForm e={e} catalog={catalog} cats={cats} onChange={(p) => setEl(e.id, p)} onRemove={() => removeEl(e)} />}
            </li>
          ))}
          {!shown.length && <li className="px-4 py-6 text-center text-sm text-stone">No elements match.</li>}
        </ul>
      </Section>
    </div>
  );
}

const reorder = <T extends { order: number }>(sorted: T[], i: number, d: -1 | 1): T[] => {
  const next = [...sorted];
  [next[i], next[i + d]] = [next[i + d], next[i]];
  return next.map((c, n) => ({ ...c, order: n + 1 }));
};

function ElementForm({ e, catalog, cats, onChange, onRemove }: { e: CatalogElement; catalog: Catalog; cats: Catalog["categories"]; onChange: (p: Partial<CatalogElement>) => void; onRemove: () => void }) {
  const actuals = e.defaultPrice === null;
  return (
    <div className="grid gap-4 bg-paper-2/50 px-4 pb-5 pt-2 sm:grid-cols-2">
      <label className="field sm:col-span-2">
        <span>Name</span>
        <input autoFocus value={e.name} maxLength={160} onChange={(x) => onChange({ name: x.target.value })} />
      </label>
      <label className="field">
        <span>Category</span>
        <select className="min-h-[var(--tap)] rounded-sm border border-line bg-card px-3" value={e.category} onChange={(x) => onChange({ category: x.target.value })}>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Unit</span>
        <input value={e.unit} maxLength={40} placeholder="lump sum, per plate, per day…" onChange={(x) => onChange({ unit: x.target.value })} />
      </label>
      <label className="field">
        <span>Default quantity</span>
        <input type="number" min={0} step="any" value={e.defaultQty} onChange={(x) => onChange({ defaultQty: Number(x.target.value) || 0 })} />
      </label>
      <div className="field">
        <span>Rate (₹)</span>
        <div className="flex items-center gap-3">
          <input className="min-w-0 flex-1" type="number" min={0} step="any" disabled={actuals} value={actuals ? "" : e.defaultPrice ?? ""} aria-label="Rate" onChange={(x) => onChange({ defaultPrice: Number(x.target.value) || 0 })} />
          <label className="check shrink-0 text-sm"><input type="checkbox" checked={actuals} onChange={(x) => onChange({ defaultPrice: x.target.checked ? null : 0 })} /> As per actuals</label>
        </div>
      </div>
      <label className="field">
        <span>Per guest <small className="text-stone">(optional: qty = guests × this)</small></span>
        <input type="number" min={0} step="any" value={e.perGuest ?? ""} placeholder="e.g. 1 per guest, 0.1 per ten" onChange={(x) => onChange({ perGuest: x.target.value === "" || Number(x.target.value) <= 0 ? undefined : Number(x.target.value) })} />
      </label>
      <label className="field sm:col-span-2">
        <span>Description <small className="text-stone">(shown under the name)</small></span>
        <textarea rows={2} value={e.description ?? ""} maxLength={400} onChange={(x) => onChange({ description: x.target.value || undefined })} />
      </label>
      <Tags label="Suggested for event types" choices={catalog.eventTypes} value={e.eventTypes} onChange={(eventTypes) => onChange({ eventTypes })} />
      <Tags label="Suggested for ceremony styles" choices={catalog.ceremonyStyles} value={e.ceremonyStyles} onChange={(ceremonyStyles) => onChange({ ceremonyStyles })} />
      {!!e.upgrades?.length && <p className="text-xs text-stone sm:col-span-2">Has {e.upgrades.length} upgrade{e.upgrades.length > 1 ? "s" : ""}, kept as they are.</p>}
      <div className="sm:col-span-2">
        <button type="button" className="link-btn link-danger" onClick={onRemove}>Remove this element</button>
      </div>
    </div>
  );
}

/** ["*"] means all; ticking every one off falls back to all, since an element must fit something */
function Tags({ label, choices, value, onChange }: { label: string; choices: Choice[]; value: string[]; onChange: (v: string[]) => void }) {
  const all = value.includes("*");
  const toggle = (id: string) => {
    const cur = all ? choices.map((c) => c.id) : value;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    onChange(!next.length || next.length === choices.length ? ["*"] : next);
  };
  return (
    <fieldset className="grid gap-1">
      <legend className="mb-1 text-xs font-medium text-ink-2">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {choices.map((c) => {
          const on = all || value.includes(c.id);
          return (
            <button key={c.id} type="button" aria-pressed={on} onClick={() => toggle(c.id)} className={`rounded-sm border px-3 py-1.5 text-sm transition-colors ${on ? "border-gold bg-gold-soft text-ink" : "border-line bg-card text-ink-2 hover:border-gold"}`}>
              {c.label}
            </button>
          );
        })}
      </div>
      {all && <small className="text-stone">All of them</small>}
    </fieldset>
  );
}

function BackupCard({ onExport, onImport, onError, onReset, savedAt }: { onExport: () => void; onImport: (s: CompanySettings) => void; onError: (m: string) => void; onReset: () => void; savedAt?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const read = async (file: File | undefined) => {
    if (!file) return;
    try {
      const r = readSettingsFile(JSON.parse(await file.text()));
      if ("error" in r) onError(r.error);
      else onImport(r);
    } catch {
      onError("That file isn't valid JSON.");
    }
  };
  return (
    <Section title="Backup and other devices" hint="Settings are saved in this browser. Export them to set up a colleague's device or keep a copy.">
      <p className="mb-4 text-sm text-ink-2">{savedAt ? `Last saved ${new Date(savedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}.` : "Nothing saved yet: you're using the company's original settings."}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" disabled={!savedAt} onClick={onExport}>Export settings</button>
        <input ref={input} type="file" accept="application/json,.json" hidden onChange={(e) => { read(e.target.files?.[0]); e.target.value = ""; }} />
        <button type="button" className="btn-ghost" onClick={() => input.current?.click()}>Import settings</button>
        <button type="button" className="link-btn link-danger ml-auto" disabled={!savedAt} onClick={onReset}>Reset to original</button>
      </div>
    </Section>
  );
}
