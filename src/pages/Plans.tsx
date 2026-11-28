// #/plans — Floor Plans: venue layouts and seating that don't belong to a wedding (sales mock-ups, venue plans,
// practice). #/plans/<id>[/<tab>] opens one with the same Layout and Seating editor as a wedding, plus a simple guest
// list. A plan can be copied into a wedding, and "Start the tutorial" opens a practice plan with the tutorial on.
import { useMemo, useRef, useState } from "react";
import type { Proposal } from "../types";
import { useConfig } from "../config/context";
import { asProposal, copyIntoWedding, duplicatePlan, fromProposal, isFloorPlan, newPlan, FLOOR_PLANS_FORMAT, type FloorPlan } from "../lib/floorPlans";
import { planCounts } from "../lib/inventory";
import { newItem } from "../lib/layout";
import { guestFunctions } from "../lib/guestList";
import { functionHeading } from "../lib/functions";
import { proposalStatus } from "../lib/status";
import { formatDate, todayISO } from "../lib/format";
import { useFloorPlans } from "../state/floorPlans";
import { downloadList, readListFile } from "../state/local";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import VenuePlan from "../components/VenuePlan";
import SimpleGuests from "../components/SimpleGuests";

type Tab = "layout" | "guests" | "seating";
const TABS: { id: Tab; label: string }[] = [
  { id: "layout", label: "Layout" },
  { id: "guests", label: "Guests" },
  { id: "seating", label: "Seating" },
];

/** a small room with a mandap, a stage and two tables, to practise on */
function practicePlan(): FloorPlan {
  const plan = newPlan("Practice plan (tutorial)", "", 60);
  const items = [newItem("mandap", { x: 12, y: 4 }), newItem("entrance", { x: 12, y: 17.5 })];
  items.push({ ...newItem("stage", { x: 4.5, y: 4 }, items), w: 6, h: 3 });
  items.push(newItem("round", { x: 18, y: 11 }, items));
  items.push(newItem("round", { x: 21, y: 11 }, items));
  return { ...plan, layout: { w: 24, h: 18, items } };
}

export default function Plans({ path, proposals, onCopyToWedding }: { path: string[]; proposals: Proposal[]; onCopyToWedding: (proposalId: string, fn: (p: Proposal) => Proposal) => void }) {
  const store = useFloorPlans();
  const plan = path[0] ? store.list.find((x) => x.id === path[0]) : undefined;
  if (path[0] && !plan)
    return (
      <div className="ev-page">
        <PageHeader crumbs={[{ label: "Dashboard", href: "#/dashboard" }, { label: "Floor Plans", href: "#/plans" }]} title="Plan not found" subtitle="That floor plan isn't on this device." />
      </div>
    );
  if (plan) {
    const tab = (TABS.find((t) => t.id === path[1])?.id ?? "layout") as Tab;
    return <PlanView plan={plan} tab={tab} tutorial={path[2] === "tutorial"} store={store} proposals={proposals} onCopyToWedding={onCopyToWedding} />;
  }
  return <Index store={store} />;
}

type Store = ReturnType<typeof useFloorPlans>;

function Index({ store }: { store: Store }) {
  const { venues } = useConfig();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", venue: "", expected: "" });
  const [note, setNote] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const open = (p: FloorPlan, extra = "layout") => {
    window.location.hash = `/plans/${p.id}/${extra}`;
  };
  const sorted = [...store.list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="ev-page">
      <PageHeader
        crumbs={[{ label: "Dashboard", href: "#/dashboard" }, { label: "Floor Plans" }]}
        title="Floor Plans"
        subtitle="Venue layouts and seating that aren't tied to a wedding: mock-ups for a pitch, a venue's standard plan, or practice."
        actions={
          <>
            <button type="button" className="btn-ghost" onClick={() => { const p = practicePlan(); store.save(p); open(p, "layout/tutorial"); }}>🎓 Start the tutorial</button>
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>New plan</button>
          </>
        }
      />
      <main className="ev-main grid gap-4">
        {creating && (
          <form className="grid gap-3 rounded-lg border border-line bg-card p-4 sm:grid-cols-[2fr_2fr_1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(form.expected);
              const p = newPlan(form.name, form.venue, Number.isFinite(n) && n > 0 ? Math.round(n) : null);
              store.save(p);
              setCreating(false);
              setForm({ name: "", venue: "", expected: "" });
              open(p);
            }}>
            <label className="field"><span>Plan name</span><input autoFocus required maxLength={120} placeholder="e.g. Taj ballroom, 300 guests" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="field"><span>Venue</span><input list="plan-venues" maxLength={120} value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} /></label>
            <datalist id="plan-venues">{venues.venues.map((v) => <option key={v.id} value={v.name} />)}</datalist>
            <label className="field"><span>Guests</span><input type="number" min={1} inputMode="numeric" value={form.expected} onChange={(e) => setForm({ ...form, expected: e.target.value })} /></label>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
              <button type="submit" className="btn-primary">Create</button>
            </div>
          </form>
        )}

        {!sorted.length ? (
          <EmptyState icon="seats" title="No floor plans yet" actions={<><button type="button" className="btn-primary" onClick={() => setCreating(true)}>Create a plan</button><button type="button" className="btn-ghost" onClick={() => { const p = practicePlan(); store.save(p); open(p, "layout/tutorial"); }}>Start the tutorial</button></>}>
            Draw a venue's layout once, seat a guest list, count the chairs and tables, and copy it into a wedding when it's booked.
          </EmptyState>
        ) : (
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
            {sorted.map((p) => {
              const c = planCounts(p.layout);
              const seated = Object.values(p.seating ?? {}).flat().filter(Boolean).length;
              return (
                <li key={p.id} className="flex flex-col rounded-lg border border-line bg-card p-4">
                  <a className="font-serif text-xl text-ink no-underline hover:underline" href={`#/plans/${p.id}/layout`}>{p.name}</a>
                  <p className="m-0 mt-0.5 text-sm text-ink-2">{p.venue || "No venue set"}</p>
                  <p className="m-0 mt-3 text-sm text-ink tabular-nums">{c.tables} tables · {c.chairs} chairs{p.guests.length ? ` · ${seated} of ${p.guests.reduce((t, g) => t + g.invited, 0)} seated` : ""}</p>
                  <p className="m-0 mt-1 text-xs text-stone">Updated {formatDate(p.updatedAt.slice(0, 10))}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <a className="btn-primary btn-sm" href={`#/plans/${p.id}/layout`}>Open</a>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => store.save(duplicatePlan(p))}>Duplicate</button>
                    <button type="button" className="link-btn link-danger ml-auto" onClick={() => window.confirm(`Delete "${p.name}"? This can't be undone.`) && store.remove(p.id)}>Delete</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="mr-auto text-xs text-stone">Plans are saved on this device. Export them to move them to another.</span>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            const items = await readListFile(f, FLOOR_PLANS_FORMAT, isFloorPlan);
            setNote(items ? `${store.importMany(items)} plans imported.` : "That isn't a floor plans file.");
          }} />
          <button type="button" className="btn-ghost btn-sm" onClick={() => file.current?.click()}>Import</button>
          <button type="button" className="btn-ghost btn-sm" disabled={!store.list.length} onClick={() => downloadList(`Floor_plans_${todayISO()}.json`, FLOOR_PLANS_FORMAT, store.list)}>Export</button>
          {note && <span className="w-full text-xs text-gold-text" role="status">{note}</span>}
        </div>
      </main>
    </div>
  );
}

function PlanView({ plan, tab, tutorial, store, proposals, onCopyToWedding }: { plan: FloorPlan; tab: Tab; tutorial: boolean; store: Store; proposals: Proposal[]; onCopyToWedding: (proposalId: string, fn: (p: Proposal) => Proposal) => void }) {
  const p = useMemo(() => asProposal(plan), [plan]);
  const update = (fn: (cur: Proposal) => Proposal) => store.update(plan.id, (cur) => fromProposal(cur, fn(asProposal(cur))));
  const [copying, setCopying] = useState(false);
  const [target, setTarget] = useState({ proposal: "", fn: "" });
  const [note, setNote] = useState("");
  const weddings = proposals.filter((x) => proposalStatus(x) !== "lost");
  const chosen = weddings.find((x) => x.id === target.proposal);
  const c = planCounts(plan.layout);

  return (
    <div className="ev-page">
      <PageHeader
        crumbs={[{ label: "Dashboard", href: "#/dashboard" }, { label: "Floor Plans", href: "#/plans" }, { label: plan.name }]}
        title={plan.name}
        subtitle={[plan.venue || "No venue set", `${c.tables} tables · ${c.chairs} chairs`, plan.guests.length ? `${plan.guests.reduce((t, g) => t + g.invited, 0)} guests` : ""].filter(Boolean).join(" · ")}
        actions={
          <>
            <button type="button" className="btn-ghost" disabled={!plan.layout} onClick={() => setCopying(!copying)}>Copy into a wedding</button>
            <button type="button" className="btn-ghost" onClick={() => { const d = duplicatePlan(plan); store.save(d); window.location.hash = `/plans/${d.id}/layout`; }}>Duplicate</button>
          </>
        }
      >
        <nav className="ev-tabs" aria-label="Plan sections">
          {TABS.map((t) => <a key={t.id} href={`#/plans/${plan.id}/${t.id}`} aria-current={t.id === tab ? "page" : undefined}>{t.label}</a>)}
        </nav>
      </PageHeader>
      <main className="ev-main grid gap-4">
        <details className="rounded-lg border border-line bg-card p-4">
          <summary className="cursor-pointer text-sm text-ink-2">Plan details</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-[2fr_2fr_1fr]">
            <label className="field"><span>Name</span><input maxLength={120} defaultValue={plan.name} onBlur={(e) => e.target.value.trim() && e.target.value !== plan.name && store.update(plan.id, (cur) => ({ ...cur, name: e.target.value.trim(), updatedAt: new Date().toISOString() }))} /></label>
            <label className="field"><span>Venue</span><input maxLength={120} defaultValue={plan.venue} onBlur={(e) => e.target.value !== plan.venue && store.update(plan.id, (cur) => ({ ...cur, venue: e.target.value.trim(), updatedAt: new Date().toISOString() }))} /></label>
            <label className="field"><span>Guests expected</span><input type="number" min={1} defaultValue={plan.expected ?? ""} onBlur={(e) => store.update(plan.id, (cur) => ({ ...cur, expected: Number(e.target.value) > 0 ? Math.round(Number(e.target.value)) : null }))} /></label>
            <label className="field sm:col-span-3"><span>Notes</span><textarea rows={2} maxLength={2000} defaultValue={plan.notes} onBlur={(e) => e.target.value !== plan.notes && store.update(plan.id, (cur) => ({ ...cur, notes: e.target.value }))} /></label>
          </div>
        </details>

        {copying && (
          <section className="grid gap-3 rounded-lg border border-solid border-gold bg-card p-4 sm:grid-cols-[2fr_1.5fr_auto] sm:items-end">
            <label className="field">
              <span>Wedding</span>
              <select className="min-h-[var(--tap)] rounded-sm border border-line bg-card px-3" value={target.proposal} onChange={(e) => setTarget({ proposal: e.target.value, fn: "" })}>
                <option value="">Choose a wedding…</option>
                {weddings.map((w) => <option key={w.id} value={w.id}>{w.client.name || "Untitled client"}{w.client.venue ? ` · ${w.client.venue}` : ""}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Function</span>
              <select className="min-h-[var(--tap)] rounded-sm border border-line bg-card px-3" disabled={!chosen} value={target.fn} onChange={(e) => setTarget({ ...target, fn: e.target.value })}>
                {chosen && guestFunctions(chosen).map((f) => <option key={f.id} value={f.id}>{f.id ? functionHeading(f) : "The celebration"}{chosen.layouts?.[f.id] ? " (has a plan)" : ""}</option>)}
              </select>
            </label>
            <button type="button" className="btn-primary" disabled={!chosen} onClick={() => {
              const fnId = target.fn || guestFunctions(chosen!)[0].id;
              if (chosen!.layouts?.[fnId] && !window.confirm("That function already has a floor plan. Replace it (and its seating)?")) return;
              onCopyToWedding(chosen!.id, (cur) => copyIntoWedding(plan, cur, fnId));
              setCopying(false);
              setNote(`Copied into ${chosen!.client.name || "the wedding"}. Its own guests can be seated there.`);
            }}>Copy the layout</button>
            <p className="m-0 text-xs text-stone sm:col-span-3">Only the layout is copied: the wedding seats its own guest list.</p>
          </section>
        )}
        {note && <p className="m-0 text-sm text-gold-text" role="status">{note} {target.proposal && <a href={`#/events/${target.proposal}/layout`}>Open it</a>}</p>}

        {tab === "guests" ? <SimpleGuests p={p} onUpdate={update} /> : <VenuePlan key={tab} p={p} mode={tab} onUpdate={update} tutorial={tutorial} standalone />}
      </main>
    </div>
  );
}
