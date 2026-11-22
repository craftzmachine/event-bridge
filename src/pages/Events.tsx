import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { Proposal } from "../types";
import { useConfig } from "../config/context";
import type { useProposals } from "../state/proposals";
import { listAdvances, listExpenses } from "../state/expenses";
import { countdown, eventsFor, type EventsTab } from "../lib/events";
import { eventDates, proposalTitle } from "../lib/proposal";
import { byFunction, functionHeading, functionsOf } from "../lib/functions";
import { formatDate, formatDates, formatINR, formatINRShort, todayISO } from "../lib/format";
import { matchesSearch, proposalStatus, statusLabel } from "../lib/status";
import { progress } from "../lib/checklist";
import { schedule } from "../lib/payments";
import { capacityWarning, venueCapacity } from "../lib/guests";
import { waLink, waNumber } from "../lib/whatsapp";
import { computeTotals } from "../lib/totals";
import { summarise, type Expense } from "../lib/expenses";
import { balanceOf, type Advance } from "../lib/advances";
import { api } from "../lib/api";
import { clientAnswers, type Share } from "../lib/shares";
import { mergePortalAnswers } from "../lib/portal";
import PageHeader from "../components/PageHeader";
import Checklist from "../components/Checklist";
import PaymentsCard from "../components/PaymentsCard";
import ClientAnswer from "../components/ClientAnswer";
import SentQuestionnaires from "../components/SentQuestionnaires";

// the event's ledger is part of the (lazy) expenses page
const EventLedger = lazy(() => import("./Expenses").then((m) => ({ default: m.EventLedger })));

type Store = ReturnType<typeof useProposals>;
type Tab = "overview" | "checklist" | "questionnaires" | "payments" | "expenses" | "proposal";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "checklist", label: "Checklist" },
  { id: "questionnaires", label: "Questionnaires" },
  { id: "payments", label: "Payments" },
  { id: "expenses", label: "Expenses" },
  { id: "proposal", label: "Proposal" },
];

/** #/events: every wedding in play; #/events/<proposalId>[/<tab>]: one wedding's workspace. */
export default function Events({ path, store, account, onOpen }: { path: string[]; store: Store; account: string; onOpen: (id: string) => void }) {
  const p = path[0] ? store.list.find((x) => x.id === path[0]) : undefined;
  if (path[0] && !p)
    return (
      <div className="ev-page">
        <PageHeader crumbs={[{ label: "Dashboard", href: "#/dashboard" }, { label: "Events", href: "#/events" }]} title="Event not found" subtitle="That proposal isn't on this device." />
      </div>
    );
  return p ? (
    <Workspace p={p} tab={(TABS.find((t) => t.id === path[1])?.id ?? "overview") as Tab} store={store} account={account} onOpen={onOpen} />
  ) : (
    <Index list={store.list} />
  );
}

// ---- #/events ------------------------------------------------------------------------------------------------

function Index({ list }: { list: Proposal[] }) {
  const { catalog } = useConfig();
  const [tab, setTab] = useState<EventsTab>("upcoming");
  const [q, setQ] = useState("");
  const today = todayISO();
  const shown = eventsFor(list, tab, today).filter((p) => matchesSearch(p, q));
  return (
    <div className="ev-page">
      <PageHeader crumbs={[{ label: "Dashboard", href: "#/dashboard" }, { label: "Events" }]} title="Events" subtitle="Every wedding in play: accepted proposals and anything with a date." tour="events-page" />
      <main className="ev-main">
        <div className="ev-filters">
          <div className="seg" role="group" aria-label="Show">
            {(["upcoming", "past", "all"] as const).map((t) => (
              <button key={t} type="button" className={tab === t ? "is-on" : ""} aria-pressed={tab === t} onClick={() => setTab(t)}>
                {t === "upcoming" ? "Upcoming" : t === "past" ? "Past" : "All"}
              </button>
            ))}
          </div>
          <input type="search" placeholder="Search client, venue or quotation" aria-label="Search events" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {shown.length === 0 ? (
          <div className="empty-state"><p>{list.length ? "No events match." : "No proposals on this device yet. Accepted and dated proposals appear here."}</p></div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table ev-table">
              <thead>
                <tr><th>When</th><th>Client</th><th>Occasion</th><th>Venue</th><th>Status</th><th>Checklist</th></tr>
              </thead>
              <tbody>
                {shown.map((p) => {
                  const ck = progress(p.checklist);
                  return (
                    <tr key={p.id}>
                      <td><strong>{countdown(p, today)}</strong><small>{eventDates(p).length ? formatDates(eventDates(p)) : ""}</small></td>
                      <td><a className="link-btn" href={`#/events/${p.id}`}>{p.client.name || "Untitled client"}</a></td>
                      <td>{proposalTitle(p, catalog) || "—"}</td>
                      <td>{p.client.venue || "—"}</td>
                      <td>{statusLabel(proposalStatus(p))}</td>
                      <td>{ck.total ? <span className="ev-prog"><span className="ev-bar" aria-hidden="true"><span style={{ width: `${Math.round(ck.pct * 100)}%` }} /></span>{ck.done}/{ck.total}</span> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

// ---- #/events/<id> -------------------------------------------------------------------------------------------

function Workspace({ p, tab, store, account, onOpen }: { p: Proposal; tab: Tab; store: Store; account: string; onOpen: (id: string) => void }) {
  const { catalog, brand } = useConfig();
  const today = todayISO();
  const dates = eventDates(p);
  const wa = waNumber(p.client.contact);
  const update = (fn: (cur: Proposal) => Proposal) => store.update(p.id, fn);
  // answers the family gave in their client portal come into this wedding's questionnaires
  const portalId = p.portalShareId;
  useEffect(() => {
    if (!portalId) {
      return;
    }
    api<{ shares: Share[] }>("shares")
      .then((r) => {
        const s = r.shares.find((x) => x.id === portalId);
        if (s?.answers) store.update(p.id, (cur) => mergePortalAnswers(cur, s.answers) ?? cur);
      })
      .catch(() => {});
  }, [portalId, p.id]);
  const setPatch = (patch: Partial<Proposal> | ((cur: Proposal) => Partial<Proposal>)) => update((cur) => ({ ...cur, ...(typeof patch === "function" ? patch(cur) : patch) }));

  return (
    <div className="ev-page">
      <PageHeader
        crumbs={[{ label: "Dashboard", href: "#/dashboard" }, { label: "Events", href: "#/events" }, { label: p.client.name || "Untitled client" }]}
        title={p.client.name || "Untitled client"}
        subtitle={[proposalTitle(p, catalog) || "Occasion not set", dates.length ? formatDates(dates) : "date to be confirmed", p.client.venue].filter(Boolean).join(" · ")}
        actions={
          <>
            {wa && <a className="btn-ghost" href={waLink(wa, `Dear ${p.client.name || "there"}, this is ${brand.company}.`)} target="_blank" rel="noopener noreferrer">WhatsApp client</a>}
            <button type="button" className="btn-primary" onClick={() => onOpen(p.id)}>Open in Studio</button>
          </>
        }
      >
        <nav className="ev-tabs" aria-label="Event sections">
          {TABS.map((t) => (
            <a key={t.id} href={`#/events/${p.id}${t.id === "overview" ? "" : `/${t.id}`}`} aria-current={t.id === tab ? "page" : undefined}>{t.label}</a>
          ))}
        </nav>
      </PageHeader>
      <main className="ev-main">
        {tab === "overview" && <Overview p={p} today={today} />}
        {tab === "checklist" && <Checklist p={p} account={account} onUpdate={update} />}
        {tab === "questionnaires" && <SentQuestionnaires p={p} onUpdate={update} />}
        {tab === "payments" && <PaymentsCard p={p} set={setPatch} />}
        {tab === "expenses" && (
          <Suspense fallback={<p className="hint" role="status">Opening expenses…</p>}>
            <EventLedger p={p} account={account} />
          </Suspense>
        )}
        {tab === "proposal" && <ProposalSummary p={p} onOpen={onOpen} />}
      </main>
    </div>
  );
}

function Overview({ p, today }: { p: Proposal; today: string }) {
  const { brand, venues } = useConfig();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  useEffect(() => {
    listExpenses(p.id).then(setExpenses).catch(() => {});
    listAdvances(p.id).then(setAdvances).catch(() => {});
  }, [p.id]);
  useEffect(() => {
    if (!p.shareId) {
      return;
    }
    api<{ shares: Share[] }>("shares").then((r) => setShares(r.shares)).catch(() => {});
  }, [p.shareId]);

  const fns = functionsOf(p);
  const ck = progress(p.checklist);
  const pay = schedule(p, brand, today);
  const spent = summarise(expenses);
  const withStaff = advances.filter((a) => !a.closed).reduce((t, a) => t + Math.max(balanceOf(a, expenses).left, 0), 0);
  const quoted = computeTotals(p, brand.gstPct).grandTotal;
  const venue = p.client.venue ? venueCapacity(venues.venues, p.client.venue) : null;
  const capacity = capacityWarning(p, venues.venues);
  const answer = useMemo(() => clientAnswers([p], shares).get(p.id), [p, shares]);
  const wa = waNumber(p.client.contact);

  return (
    <div className="ev-grid">
      <section className="dash-card ev-when">
        <h2>When</h2>
        <strong className="ev-count">{countdown(p, today)}</strong>
        {fns.length ? (
          <ul className="ev-fns">{fns.map((f) => <li key={f.id}>{functionHeading(f)}</li>)}</ul>
        ) : (
          <p>{eventDates(p).length ? formatDates(eventDates(p)) : "The date isn't set yet."}</p>
        )}
      </section>

      <section className="dash-card">
        <h2>Progress</h2>
        <dl className="ev-progress">
          <div>
            <dt>Checklist</dt>
            <dd><span className="ev-bar" aria-hidden="true"><span style={{ width: `${Math.round(ck.pct * 100)}%` }} /></span>{ck.total ? `${ck.done} of ${ck.total} done` : <a className="link-btn" href={`#/events/${p.id}/checklist`}>Start the checklist</a>}</dd>
          </div>
          <div>
            <dt>Payments</dt>
            <dd><span className="ev-bar" aria-hidden="true"><span style={{ width: `${pay.total ? Math.min(100, Math.round((pay.received / pay.total) * 100)) : 0}%` }} /></span>{formatINRShort(pay.received)} of {formatINRShort(pay.total)} received</dd>
          </div>
          <div>
            <dt>Spending</dt>
            <dd>{formatINRShort(spent.total)} spent on {spent.count} expense{spent.count === 1 ? "" : "s"} · the quote is {formatINRShort(quoted)}{withStaff > 0 ? ` · ${formatINRShort(withStaff)} with staff` : ""}</dd>
          </div>
        </dl>
      </section>

      <section className="dash-card">
        <h2>Client</h2>
        <p className="ev-lines">
          <strong>{p.client.name || "Untitled client"}</strong>
          <span>{p.client.contact || "No contact yet"}{wa && <> · <a className="link-btn" href={waLink(wa, `Dear ${p.client.name || "there"}, this is ${brand.company}.`)} target="_blank" rel="noopener noreferrer">WhatsApp</a></>}</span>
          <span>{p.client.guests ? `${p.client.guests.toLocaleString("en-IN")} guests` : "Guest count not set"}{p.client.budget ? ` · budget ${formatINR(p.client.budget)}` : ""}</span>
          <span>Status: {statusLabel(proposalStatus(p))}</span>
        </p>
        {answer && <ClientAnswer d={answer} />}
      </section>

      <section className="dash-card">
        <h2>Venue</h2>
        <p className="ev-lines">
          <strong>{p.client.venue || "Venue not set"}</strong>
          {p.client.location && <span>{p.client.location}</span>}
          {venue?.capacity && <span>Largest space holds about {venue.capacity.toLocaleString("en-IN")}</span>}
          {capacity && <span className="warn">{capacity}</span>}
          {venue && <a className="link-btn" href="#/venues">In the Venue Directory</a>}
        </p>
      </section>
    </div>
  );
}

function ProposalSummary({ p, onOpen }: { p: Proposal; onOpen: (id: string) => void }) {
  const { brand } = useConfig();
  const t = computeTotals(p, brand.gstPct);
  const groups = byFunction(p, p.lines, true);
  return (
    <section className="dash-card">
      <h2>Quotation {p.ref}</h2>
      <dl className="ev-totals">
        <div><dt>Grand Total</dt><dd>{formatINR(t.grandTotal)}</dd></div>
        <div><dt>Elements</dt><dd>{p.lines.filter((l) => !l.optional).length} included · {p.lines.filter((l) => l.optional).length} additional options</dd></div>
        <div><dt>Status</dt><dd>{statusLabel(proposalStatus(p))}{p.sentAt ? ` · sent ${formatDate(p.sentAt.slice(0, 10))}` : ""}</dd></div>
      </dl>
      {groups.length > 1 && (
        <ul className="ev-fns">
          {groups.map((g) => <li key={g.fn?.id ?? "all"}>{g.fn ? functionHeading(g.fn) : "Elements"}: {g.lines.length} element{g.lines.length === 1 ? "" : "s"}</li>)}
        </ul>
      )}
      <button type="button" className="btn-primary" onClick={() => onOpen(p.id)}>Open in Studio</button>
    </section>
  );
}
