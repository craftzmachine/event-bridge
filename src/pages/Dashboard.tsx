import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import EmptyState from "../components/EmptyState";
import SetupGuide from "../components/SetupGuide";
import type { Proposal } from "../types";
import { useConfig } from "../config/context";
import { api } from "../lib/api";
import type { Share } from "../lib/shares";
import { marginThisMonth, monthCompare, paymentsOverview, pipeline, selling, upcoming, type UpcomingEvent } from "../lib/dashboard";
import { followUps } from "../lib/followups";
import { statusLabel } from "../lib/status";
import { formatDate, formatINR, formatINRShort, todayISO } from "../lib/format";
import { waLink, waNumber } from "../lib/whatsapp";
import { listExpenses } from "../state/expenses";
import { monthOf, summarise, type Expense } from "../lib/expenses";
import { COMPANY_BOOK_ID, monthLabel } from "../lib/books";
import { eventsFor } from "../lib/events";
import { calendarMonth, gridRange, shiftMonth } from "../lib/calendar";
import PageHeader from "../components/PageHeader";
import Icon from "../components/icons";
import { APPS } from "../lib/nav";
import { readLeads } from "../state/crm";
import { followUpsDue } from "../lib/crm";

// the quick-add dialog lives in the (lazy) expenses page
const QuickExpense = lazy(() => import("./Expenses").then((m) => ({ default: m.QuickExpense })));
import { readTeamTasks } from "../state/tasks";
import { allTasks, overdueRows } from "../lib/tasks";
import { awaitingAnswers } from "../lib/questionnaires";

const month = (d: Date) => d.toLocaleString("en-GB", { month: "long" });
const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SHOWN = 7;

/** "Good morning, Planner": the part of the sign-in email before any dot, dash, digit or @ */
function greeting(account: string, now: Date) {
  const h = now.getHours();
  const part = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const name = account.split("@")[0].split(/[._\-+0-9]/)[0];
  return name ? `${part}, ${name[0].toUpperCase()}${name.slice(1)}` : part;
}

/** One line in "Needs attention": what, for whom, and where to deal with it. */
interface Attention {
  key: string;
  kind: "payment" | "follow-up" | "enquiry" | "task" | "questionnaire";
  title: string;
  meta: string;
  alert: boolean;
  href?: string;
  onOpen?: () => void;
  whatsapp?: string;
}
const KIND_LABEL: Record<Attention["kind"], string> = { payment: "Payment", "follow-up": "Follow-up", enquiry: "Enquiry", task: "Task", questionnaire: "Questions" };

/**
 * The team's home at #/dashboard, and the way into every app: a compact apps bar, four headline figures, the
 * upcoming events (list or calendar) beside one "Needs attention" list, then the pipeline, what's selling and
 * this month's spending. Built from this device's data, plus link activity when sharing is connected.
 */
export default function Dashboard({ list, account, onOpen, onNew }: { list: Proposal[]; account: string; onOpen: (id: string) => void; onNew: () => void }) {
  const { catalog, brand, venues } = useConfig();
  const [shares, setShares] = useState<Share[] | null>(null);
  const [linkInfo, setLinkInfo] = useState<"loading" | "ok" | "off">("loading");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [allAttention, setAllAttention] = useState(false);
  const now = useMemo(() => new Date(), []);
  const today = todayISO(now);
  const [calMonth, setCalMonth] = useState(monthOf(today));
  const [day, setDay] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    api<{ shares: Share[] }>("shares")
      .then((r) => {
        setShares(r.shares);
        setLinkInfo("ok");
      })
      .catch(() => {
        setShares([]);
        setLinkInfo("off");
      });
  }, []);
  useEffect(() => {
    listExpenses().then(setExpenses).catch(() => setExpenses([]));
  }, []);

  const m = monthCompare(list, brand.gstPct, now);
  const pipe = pipeline(list, brand.gstPct);
  const todo = followUps(list, shares ?? [], brand, now.getTime());
  const events = upcoming(list, catalog, venues.venues, now);
  const week = upcoming(list, catalog, venues.venues, now, 6);
  const pay = paymentsOverview(list, brand, now);
  const margin = marginThisMonth(list, brand.gstPct, now);
  const sold = selling(list, catalog, brand.gstPct);
  const upcomingEvents = eventsFor(list, "upcoming", today);
  const leads = useMemo(() => readLeads(), []);
  const leadsDue = followUpsDue(leads, today);
  const teamTasks = useMemo(() => readTeamTasks(), []);
  const lateRows = overdueRows(allTasks(teamTasks, list), today);
  const waiting = awaitingAnswers(list);
  const clientOf = (id?: string) => (id ? list.find((p) => p.id === id)?.client.name || "Untitled client" : "");

  // the calendar shows every dated function in the grid's range, whether or not it's past
  const range = gridRange(calMonth);
  const rangeDays = Math.round((new Date(`${range.to}T00:00:00`).getTime() - new Date(`${range.from}T00:00:00`).getTime()) / 86_400_000);
  const calEvents = upcoming(list, catalog, venues.venues, new Date(`${range.from}T12:00:00`), rangeDays);
  const weeks = calendarMonth(calMonth, calEvents, today);
  const listed: UpcomingEvent[] = day ? calEvents.filter((e) => e.date === day) : events.slice(0, 8);

  const monthExpenses = expenses.filter((e) => !e.removed && monthOf(e.paidOn) === monthOf(today));
  const company = summarise(monthExpenses.filter((e) => e.eventId === COMPANY_BOOK_ID));
  const eventSpend = summarise(monthExpenses.filter((e) => e.eventId !== COMPANY_BOOK_ID));

  // the pipeline as one bar: proposals still in play (draft → sent → accepted); lost ones only in the legend
  const inPlay = pipe.filter((x) => x.status !== "lost");
  const sent = pipe.find((x) => x.status === "sent");
  const accepted = pipe.find((x) => x.status === "accepted")?.count ?? 0;
  const lost = pipe.find((x) => x.status === "lost")?.count ?? 0;
  const winAll = accepted + lost ? accepted / (accepted + lost) : null;

  // everything waiting on someone, most urgent first
  const attention: Attention[] = [
    ...pay.overdue.map((x) => ({ key: `p:${x.proposal.id}:${x.id}`, kind: "payment" as const, title: `${x.label} overdue`, meta: `${x.proposal.client.name || "Untitled client"} · ${formatINR(x.outstanding)} since ${formatDate(x.due)}`, alert: true, href: `#/events/${x.proposal.id}/payments` })),
    ...lateRows.map((r) => ({ key: `t:${r.key}`, kind: "task" as const, title: r.title, meta: [r.due ? `Due ${formatDate(r.due)}` : "", clientOf(r.proposalId)].filter(Boolean).join(" · "), alert: true, href: "#/tasks" })),
    // overdue payments are already listed above
    ...todo.filter((f) => f.kind !== "overdue").map((f) => ({ key: `f:${f.key}`, kind: "follow-up" as const, title: f.title, meta: `${f.client} · ${f.detail}`, alert: f.kind === "changes", onOpen: () => onOpen(f.proposalId), whatsapp: waNumber(f.contact) ? waLink(waNumber(f.contact), `Dear ${f.client}, this is ${brand.company} following up on your proposal. Is there anything you'd like us to change or explain?`) : undefined })),
    ...leadsDue.map((l) => ({ key: `l:${l.id}`, kind: "enquiry" as const, title: `Follow up with ${l.name}`, meta: `Due ${formatDate(l.followUp!)}${l.phone ? ` · ${l.phone}` : ""}`, alert: false, href: "#/crm", whatsapp: waNumber(l.phone) ? waLink(waNumber(l.phone), `Dear ${l.name}, this is ${brand.company}. `) : undefined })),
    ...pay.dueSoon.map((x) => ({ key: `d:${x.proposal.id}:${x.id}`, kind: "payment" as const, title: `${x.label} due`, meta: `${x.proposal.client.name || "Untitled client"} · ${formatINR(x.outstanding)} by ${formatDate(x.due)}`, alert: false, href: `#/events/${x.proposal.id}/payments` })),
    ...waiting.map(({ proposal, q }) => ({ key: `q:${q.id}`, kind: "questionnaire" as const, title: q.title, meta: `${proposal.client.name || "Untitled client"} · waiting for answers`, alert: false, href: `#/events/${proposal.id}/questionnaires` })),
  ];
  const urgent = attention.filter((a) => a.alert).length;
  const shownAttention = allAttention ? attention : attention.slice(0, SHOWN);

  return (
    <div className="dash">
      <PageHeader help="dashboard"
        title={greeting(account, now)}
        subtitle={`${now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${list.length} proposal${list.length === 1 ? "" : "s"} on this device`}
        actions={
          <>
            <a className="btn-ghost" href="#/help">Help &amp; how-to</a>
            <button type="button" className="btn-ghost" onClick={() => setAdding(true)}>Record expense</button>
            <button type="button" className="btn-primary" onClick={onNew}>New proposal</button>
          </>
        }
      />

      <main className="dash-main">
        {saved && (
          <p className="toast" role="status">
            Expense saved to {saved.title}. <a href={`#/expenses/${saved.id}`}>View ledger</a>
          </p>
        )}
        <nav className="dash-launch" aria-label="Apps" data-tour="apps">
          {APPS.map((a) => (
            <a key={a.id} href={a.href} title={a.description}>
              <span className="dash-launch-icon"><Icon name={a.icon} size={20} /></span>
              <span>{a.label}</span>
            </a>
          ))}
        </nav>

        <SetupGuide list={list} onNew={onNew} />
        <section className="dash-stats" data-tour="stats" aria-label={`${month(now)} at a glance`}>
          <div className="dash-stat">
            <span>Upcoming events</span>
            <strong>{upcomingEvents.length}</strong>
            <small>{week.length} function{week.length === 1 ? "" : "s"} in the next 7 days</small>
          </div>
          <div className="dash-stat">
            <span>Awaiting decision</span>
            <strong>{formatINRShort(sent?.value ?? 0)}</strong>
            <small>{sent?.count ?? 0} proposal{sent?.count === 1 ? "" : "s"} sent · win rate {pct(winAll)}</small>
          </div>
          <div className="dash-stat">
            <span>Received in {month(now)}</span>
            <strong>{formatINRShort(pay.receivedThisMonth)}</strong>
            <small>{formatINRShort(pay.outstanding)} still to come{margin ? ` · margin ${pct(margin.pct)}` : ""}</small>
          </div>
          <div className={`dash-stat${urgent ? " is-alert" : ""}`}>
            <span>Needs attention</span>
            <strong>{attention.length}</strong>
            <small>{urgent ? `${urgent} overdue` : "Nothing overdue"}</small>
          </div>
        </section>

        {list.length === 0 ? (
          <EmptyState icon="file" title="Your weddings will show up here" actions={<><button type="button" className="btn-primary" onClick={onNew}>Start a proposal</button><a className="btn-ghost" href="#/crm">Add an enquiry</a></>}>
            Start a proposal, or add an enquiry in the CRM. Upcoming events, payments and everything that needs you will gather on this page.
          </EmptyState>
        ) : (
          <>
            <div className="dash-cols">
              <section className="dash-panel" data-tour="events" aria-labelledby="dash-events-title">
                <header className="dash-panel-head">
                  <h2 id="dash-events-title">{view === "calendar" ? monthLabel(calMonth) : day ? formatDate(day) : "Upcoming events"}</h2>
                  <div className="dash-section-tools">
                    {view === "calendar" && (
                      <span className="dash-cal-nav">
                        <button type="button" className="btn-ghost btn-sm" aria-label="Previous month" onClick={() => { setCalMonth((x) => shiftMonth(x, -1)); setDay(null); }}>‹</button>
                        <button type="button" className="btn-ghost btn-sm" onClick={() => { setCalMonth(monthOf(today)); setDay(null); }}>Today</button>
                        <button type="button" className="btn-ghost btn-sm" aria-label="Next month" onClick={() => { setCalMonth((x) => shiftMonth(x, 1)); setDay(null); }}>›</button>
                      </span>
                    )}
                    <div className="seg" role="group" aria-label="Show as">
                      <button type="button" className={view === "list" ? "is-on" : ""} aria-pressed={view === "list"} onClick={() => { setView("list"); setDay(null); }}>List</button>
                      <button type="button" className={view === "calendar" ? "is-on" : ""} aria-pressed={view === "calendar"} onClick={() => setView("calendar")}>Calendar</button>
                    </div>
                  </div>
                </header>
                {view === "calendar" && (
                  <div className="dash-cal">
                    <div className="dash-cal-row dash-cal-head" aria-hidden="true">{WEEKDAYS.map((w) => <span key={w}>{w}</span>)}</div>
                    {weeks.map((w) => (
                      <div key={w[0].date} className="dash-cal-row">
                        {w.map((d) => (
                          <button
                            type="button"
                            key={d.date}
                            className={`dash-cal-day${d.inMonth ? "" : " is-out"}${d.isToday ? " is-today" : ""}${d.date === day ? " is-picked" : ""}${d.events.length ? " has-events" : ""}`}
                            aria-pressed={d.date === day}
                            aria-label={`${formatDate(d.date)}: ${d.events.length ? d.events.map((e) => `${e.label}, ${e.proposal.client.name}`).join("; ") : "nothing booked"}`}
                            onClick={() => setDay((x) => (x === d.date ? null : d.date))}
                          >
                            <span className="dash-cal-no">{Number(d.date.slice(8))}</span>
                            {d.events.slice(0, 2).map((e) => <span key={e.key} className="dash-cal-ev">{e.label} · {e.proposal.client.name || "client"}</span>)}
                            {d.events.length > 2 && <span className="dash-cal-more">+{d.events.length - 2} more</span>}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
                {(view === "list" || day) &&
                  (listed.length === 0 ? (
                    <p className="dash-empty">{day ? "Nothing booked that day." : "No dated events in the next 90 days."}</p>
                  ) : (
                    <ul className="dash-ev-list">
                      {listed.map((e) => {
                        const d = new Date(`${e.date}T00:00:00`);
                        return (
                          <li key={e.key}>
                            <a href={`#/events/${e.proposal.id}`}>
                              <span className="dash-ev-date" aria-hidden="true">
                                <small>{d.toLocaleString("en-GB", { month: "short" })}</small>
                                <strong>{d.getDate()}</strong>
                              </span>
                              <span className="dash-ev-main">
                                <strong>{e.proposal.client.name || "Untitled client"}</strong>
                                <span>{e.label} · {e.proposal.client.venue || "Venue not set"}</span>
                              </span>
                              <span className="dash-ev-side">
                                <span>{e.proposal.client.guests ? `${e.proposal.client.guests.toLocaleString("en-IN")} guests` : ""}</span>
                                <small className={e.status === "accepted" ? "is-booked" : ""}>{statusLabel(e.status)}</small>
                                {e.capacity && <small className="dash-warn" title={e.capacity}>Over capacity</small>}
                              </span>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  ))}
                {view === "list" && !day && events.length > listed.length && (
                  <a className="dash-panel-foot" href="#/events">All {upcomingEvents.length} upcoming events →</a>
                )}
              </section>

              <section className="dash-panel" data-tour="attention" aria-labelledby="dash-att-title">
                <header className="dash-panel-head">
                  <h2 id="dash-att-title">Needs attention</h2>
                  {attention.length > 0 && <small className="dash-count">{attention.length}</small>}
                </header>
                {attention.length === 0 ? (
                  <p className="dash-empty">You're all caught up: no payments due, follow-ups, overdue tasks or unanswered questionnaires.</p>
                ) : (
                  <ul className="dash-att">
                    {shownAttention.map((a) => (
                      <li key={a.key} className={a.alert ? "is-alert" : ""}>
                        <span className="dash-att-kind">{KIND_LABEL[a.kind]}</span>
                        <span className="dash-att-main">
                          {a.href ? <a href={a.href}>{a.title}</a> : <button type="button" className="link-btn" onClick={a.onOpen}>{a.title}</button>}
                          <small>{a.meta}</small>
                        </span>
                        {a.whatsapp && (
                          <a className="dash-att-wa" href={a.whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp about ${a.title}`}>WhatsApp</a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {attention.length > SHOWN && (
                  <button type="button" className="dash-panel-foot" onClick={() => setAllAttention((x) => !x)}>
                    {allAttention ? "Show fewer" : `Show all ${attention.length}`}
                  </button>
                )}
                {linkInfo === "off" && <p className="dash-note">Link activity isn't shown, because sharing isn't connected here.</p>}
              </section>
            </div>

            <div className="dash-cols dash-cols-3">
              <section className="dash-panel" aria-labelledby="dash-pipe-title">
                <header className="dash-panel-head">
                  <h2 id="dash-pipe-title">Pipeline</h2>
                  <small className="dash-muted">{versus(m.now.sent.value, m.last.sent.value, month(m.lastMonth))}</small>
                </header>
                <div className="dash-stack" role="img" aria-label={inPlay.map((x) => `${x.label} ${x.count}`).join(", ")}>
                  {inPlay.map((x, i) => (x.count ? <span key={x.status} className={`dash-stack-seg is-${i}`} style={{ flexGrow: x.count }} title={`${x.label}: ${x.count}`} /> : null))}
                </div>
                <ul className="dash-legend">
                  {pipe.map((x) => {
                    const i = inPlay.findIndex((y) => y.status === x.status);
                    return (
                      <li key={x.status}>
                        <span className={`dash-key ${i < 0 ? "is-lost" : `is-${i}`}`} aria-hidden="true" />
                        <span>{x.label}</span>
                        <strong>{x.count}</strong>
                        <small>{formatINRShort(x.value)}</small>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="dash-panel" aria-labelledby="dash-sold-title">
                <header className="dash-panel-head">
                  <h2 id="dash-sold-title">What's selling</h2>
                </header>
                {sold.length === 0 ? (
                  <p className="dash-empty">Shown once proposals are accepted or lost.</p>
                ) : (
                  <ul className="dash-rows">
                    {sold.slice(0, 5).map((r) => (
                      <li key={r.label}>
                        <span>{r.label}</span>
                        <small>{r.won} of {r.decided} won · {pct(r.won / r.decided)}</small>
                        <strong>{formatINRShort(r.value)}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="dash-panel" aria-labelledby="dash-exp-title">
                <header className="dash-panel-head">
                  <h2 id="dash-exp-title">Spending in {month(now)}</h2>
                  <button type="button" className="link-btn" onClick={() => setAdding(true)}>Add expense</button>
                </header>
                <ul className="dash-rows">
                  <li>
                    <a href="#/expenses">On events</a>
                    <small>{eventSpend.count} expense{eventSpend.count === 1 ? "" : "s"}{eventSpend.missingProof ? ` · ${eventSpend.missingProof} without proof` : ""}</small>
                    <strong>{formatINRShort(eventSpend.total)}</strong>
                  </li>
                  <li>
                    <a href={`#/expenses/${COMPANY_BOOK_ID}`}>Company</a>
                    <small>{company.count} expense{company.count === 1 ? "" : "s"}{company.missingProof ? ` · ${company.missingProof} without proof` : ""}</small>
                    <strong>{formatINRShort(company.total)}</strong>
                  </li>
                </ul>
              </section>
            </div>
          </>
        )}
      </main>
      {adding && (
        <Suspense fallback={null}>
          <QuickExpense
            proposals={list}
            account={account}
            onClose={() => setAdding(false)}
            onSaved={(b) => {
              setSaved({ id: b.id, title: b.kind === "company" ? "Company expenses" : b.title });
              listExpenses().then(setExpenses).catch(() => {});
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

/** "₹1.2L more than October", "the same as October", "₹50K less than October" (sent value, month on month) */
function versus(now: number, last: number, lastMonth: string) {
  if (Math.round(now) === Math.round(last)) return `Sent: the same as ${lastMonth}`;
  return `Sent: ${formatINRShort(Math.abs(now - last))} ${now > last ? "more" : "less"} than ${lastMonth}`;
}
