import { useEffect, useMemo, useState } from "react";
import type { Proposal } from "../types";
import { useConfig } from "../config/context";
import { api } from "../lib/api";
import type { Share } from "../lib/shares";
import { marginThisMonth, monthCompare, paymentsOverview, pipeline, selling, upcoming, type UpcomingEvent } from "../lib/dashboard";
import { followUps, type FollowUp } from "../lib/followups";
import { statusLabel } from "../lib/status";
import { formatDate, formatDates, formatINR, formatINRShort, todayISO } from "../lib/format";
import { waLink, waNumber } from "../lib/whatsapp";
import { listExpenses } from "../state/expenses";
import { monthOf, summarise, type Expense } from "../lib/expenses";
import { COMPANY_BOOK_ID, monthLabel } from "../lib/books";
import { overdueAcross, progress } from "../lib/checklist";
import { countdown, eventsFor } from "../lib/events";
import { calendarMonth, gridRange, shiftMonth } from "../lib/calendar";
import { schedule } from "../lib/payments";
import { eventDates, proposalTitle } from "../lib/proposal";
import PageHeader from "../components/PageHeader";

const month = (d: Date) => d.toLocaleString("en-GB", { month: "long" });
const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "₹1.2L more than October", "the same as October", "₹50K less than October" */
function versus(now: number, last: number, lastMonth: string) {
  if (Math.round(now) === Math.round(last)) return `the same as ${lastMonth}`;
  return `${formatINRShort(Math.abs(now - last))} ${now > last ? "more" : "less"} than ${lastMonth}`;
}

/** "Good morning, Planner": the part of the sign-in email before any dot, dash, digit or @ */
function greeting(account: string, now: Date) {
  const h = now.getHours();
  const part = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const name = account.split("@")[0].split(/[._\-+0-9]/)[0];
  return name ? `${part}, ${name[0].toUpperCase()}${name.slice(1)}` : part;
}

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

/**
 * The team's home at #/dashboard: today's strip (this week's functions, payments due, follow-ups, overdue checklist
 * tasks), the next events, this month's figures, the upcoming events as a list or a calendar, the pipeline, and
 * payments, sales and expenses. Built from this device's proposals, plus link activity when sharing is connected.
 */
export default function Dashboard({ list, account, onOpen, onNew }: { list: Proposal[]; account: string; onOpen: (id: string) => void; onNew: () => void }) {
  const { catalog, brand, venues } = useConfig();
  const [shares, setShares] = useState<Share[] | null>(null);
  const [linkInfo, setLinkInfo] = useState<"loading" | "ok" | "off">("loading");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [view, setView] = useState<"list" | "calendar">("list");
  const now = useMemo(() => new Date(), []);
  const today = todayISO(now);
  const [calMonth, setCalMonth] = useState(monthOf(today));
  const [day, setDay] = useState<string | null>(null);

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
  const lateTasks = overdueAcross(list, today);
  const next = eventsFor(list, "upcoming", today).filter((p) => eventDates(p).length).slice(0, 4);
  const lastName = month(m.lastMonth);

  // the calendar shows every dated function in the grid's range, whether or not it's past
  const range = gridRange(calMonth);
  const rangeDays = Math.round((new Date(`${range.to}T00:00:00`).getTime() - new Date(`${range.from}T00:00:00`).getTime()) / 86_400_000);
  const calEvents = upcoming(list, catalog, venues.venues, new Date(`${range.from}T12:00:00`), rangeDays);
  const weeks = calendarMonth(calMonth, calEvents, today);
  const listed: UpcomingEvent[] = day ? calEvents.filter((e) => e.date === day) : events;

  const expenseRows = list
    .map((p) => {
      const s = summarise(expenses.filter((e) => e.eventId === p.id));
      return { id: p.id, client: p.client.name || "Untitled client", count: s.count, total: s.total, missingProof: s.missingProof };
    })
    .filter((r) => r.count)
    .sort((a, b) => b.missingProof - a.missingProof || b.total - a.total);
  const company = summarise(expenses.filter((e) => e.eventId === COMPANY_BOOK_ID && monthOf(e.paidOn) === monthOf(today)));

  // the pipeline as one bar: proposals still in play (draft → sent → accepted), lost ones beside it
  const inPlay = pipe.filter((x) => x.status !== "lost");
  const playCount = inPlay.reduce((t, x) => t + x.count, 0);
  const accepted = pipe.find((x) => x.status === "accepted")?.count ?? 0;
  const lost = pipe.find((x) => x.status === "lost")?.count ?? 0;
  const winAll = accepted + lost ? accepted / (accepted + lost) : null;

  const nudge = (f: FollowUp) =>
    waLink(waNumber(f.contact), `Dear ${f.client}, this is ${brand.company} following up on your proposal. Is there anything you'd like us to change or explain?`);

  return (
    <div className="dash">
      <PageHeader
        title={greeting(account, now)}
        subtitle={`${now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${list.length} proposal${list.length === 1 ? "" : "s"} on this device${linkInfo === "ok" ? ", with your clients' activity on shared links" : ""}`}
        actions={
          <>
            <a className="btn-ghost" href="#/expenses">Record expense</a>
            <button type="button" className="btn-primary" onClick={onNew}>New proposal</button>
          </>
        }
      />

      <main className="dash-main">
        {list.length === 0 ? (
          <div className="empty-state">
            <p>No proposals on this device yet. Start one and it shows up here.</p>
            <button type="button" className="btn-primary" onClick={onNew}>Start a proposal</button>
          </div>
        ) : (
          <>
            <section className="dash-today" aria-label="Today">
              <button type="button" className="dash-today-card" onClick={() => scrollTo("dash-events-title")}>
                <span>This week</span>
                <strong>{week.length}</strong>
                <small>{week[0] ? `${week[0].date === today ? "Today" : formatDate(week[0].date)}: ${week[0].label}, ${week[0].proposal.client.name || "client"}` : "No functions in the next 7 days"}</small>
              </button>
              <button type="button" className={`dash-today-card${pay.overdue.length ? " is-alert" : ""}`} onClick={() => scrollTo("dash-pay-title")}>
                <span>Payments due</span>
                <strong>{pay.overdue.length + pay.dueSoon.length}</strong>
                <small>{pay.overdue.length ? `${pay.overdue.length} overdue · ` : ""}{formatINRShort([...pay.overdue, ...pay.dueSoon].reduce((t, x) => t + x.outstanding, 0))} outstanding</small>
              </button>
              <button type="button" className="dash-today-card" onClick={() => scrollTo("dash-todo-title")}>
                <span>Follow-ups</span>
                <strong>{todo.length}</strong>
                <small>{todo[0] ? `${todo[0].client}: ${todo[0].title}` : "Nothing waiting on you"}</small>
              </button>
              <a className={`dash-today-card${lateTasks.length ? " is-alert" : ""}`} href={lateTasks[0] ? `#/events/${lateTasks[0].proposal.id}/checklist` : "#/events"}>
                <span>Checklist overdue</span>
                <strong>{lateTasks.length}</strong>
                <small>{lateTasks[0] ? `${lateTasks[0].proposal.client.name || "Client"}: ${lateTasks[0].item.title}` : "Every task is on time"}</small>
              </a>
            </section>

            {next.length > 0 && (
              <section aria-labelledby="dash-next-title">
                <div className="dash-section-head">
                  <h2 id="dash-next-title">Next up</h2>
                  <a className="link-btn" href="#/events">All events</a>
                </div>
                <ul className="dash-next">
                  {next.map((p) => {
                    const ck = progress(p.checklist);
                    const s = schedule(p, brand, today);
                    const paid = s.total ? Math.min(1, s.received / s.total) : 0;
                    return (
                      <li key={p.id}>
                        <a href={`#/events/${p.id}`} className="dash-next-card">
                          <span className="dash-next-count">{countdown(p, today)}</span>
                          <strong>{p.client.name || "Untitled client"}</strong>
                          <span>{proposalTitle(p, catalog) || "Occasion not set"} · {formatDates(eventDates(p))}</span>
                          <span>{p.client.venue || "Venue not set"}</span>
                          <span className="dash-next-bars">
                            <span><small>Checklist {ck.total ? `${ck.done}/${ck.total}` : "not started"}</small><span className="ev-bar" aria-hidden="true"><span style={{ width: `${Math.round(ck.pct * 100)}%` }} /></span></span>
                            <span><small>Paid {Math.round(paid * 100)}%</small><span className="ev-bar" aria-hidden="true"><span style={{ width: `${Math.round(paid * 100)}%` }} /></span></span>
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <section className="dash-kpis" aria-label={`${month(now)} figures`}>
              <div className="dash-kpi">
                <span>Sent in {month(now)}</span>
                <strong>{formatINRShort(m.now.sent.value)}</strong>
                <small>{m.now.sent.count} proposal{m.now.sent.count === 1 ? "" : "s"} · {versus(m.now.sent.value, m.last.sent.value, lastName)}</small>
              </div>
              <div className="dash-kpi">
                <span>Accepted in {month(now)}</span>
                <strong>{formatINRShort(m.now.accepted.value)}</strong>
                <small>{m.now.accepted.count} proposal{m.now.accepted.count === 1 ? "" : "s"} · {versus(m.now.accepted.value, m.last.accepted.value, lastName)}</small>
              </div>
              <div className="dash-kpi">
                <span>Win rate</span>
                <strong>{pct(m.now.winRate)}</strong>
                <small>{m.now.winRate === null ? "Shown once a proposal is accepted or lost" : "Accepted, of all accepted or lost"}</small>
              </div>
              <div className="dash-kpi">
                <span>Received in {month(now)}</span>
                <strong>{formatINRShort(pay.receivedThisMonth)}</strong>
                <small>{pay.receivedCount} payment{pay.receivedCount === 1 ? "" : "s"} · {formatINRShort(pay.outstanding)} still to come on accepted proposals</small>
              </div>
              {margin && (
                <div className="dash-kpi">
                  <span>Margin this month</span>
                  <strong>{pct(margin.pct)}</strong>
                  <small>Across {margin.count} accepted proposal{margin.count === 1 ? "" : "s"} with costs</small>
                </div>
              )}
            </section>

            <section className="dash-card" aria-labelledby="dash-events-title">
              <div className="dash-section-head">
                <h2 id="dash-events-title">{view === "calendar" ? monthLabel(calMonth) : day ? formatDate(day) : "Next 90 days"}</h2>
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
              </div>
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
                  <div className="dash-table-wrap">
                    <table className="dash-table">
                      <thead>
                        <tr><th>Date</th><th>Function</th><th>Client</th><th>Venue</th><th>Guests</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {listed.map((e) => (
                          <tr key={e.key}>
                            <td>{formatDate(e.date)}</td>
                            <td>{e.label}</td>
                            <td><a className="link-btn" href={`#/events/${e.proposal.id}`}>{e.proposal.client.name || "Untitled client"}</a></td>
                            <td>{e.proposal.client.venue || "—"}{e.capacity && <small className="dash-warn" title={e.capacity}> · over capacity</small>}</td>
                            <td>{e.proposal.client.guests ? e.proposal.client.guests.toLocaleString("en-IN") : "—"}</td>
                            <td>{statusLabel(e.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
            </section>

            <div className="dash-grid">
              <section className="dash-card dash-todo" aria-labelledby="dash-todo-title">
                <h2 id="dash-todo-title">Follow up <small>{todo.length || ""}</small></h2>
                {linkInfo === "off" && <p className="hint">Link activity isn't available here, because sharing isn't connected. These come from status, dates and payments only.</p>}
                {todo.length === 0 ? (
                  <p className="dash-empty">Nothing waiting on you. Proposals that need a call, a revision or a payment reminder appear here.</p>
                ) : (
                  <ul className="dash-todo-list">
                    {todo.map((f) => (
                      <li key={f.key} className={`is-${f.kind}`}>
                        <div>
                          <strong>{f.title}</strong>
                          <span>{f.client} · {f.detail}</span>
                        </div>
                        <div className="dash-todo-tools">
                          <button className="btn-ghost btn-sm" onClick={() => onOpen(f.proposalId)}>Open</button>
                          {waNumber(f.contact) && (
                            <a className="btn-ghost btn-sm" href={nudge(f)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="dash-card" aria-labelledby="dash-pipe-title">
                <h2 id="dash-pipe-title">Pipeline</h2>
                <p className="hint">{playCount} proposal{playCount === 1 ? "" : "s"} in play · {pct(winAll)} won of those decided</p>
                <div className="dash-stack" role="img" aria-label={inPlay.map((x) => `${x.label} ${x.count}`).join(", ")}>
                  {inPlay.map((x, i) =>
                    x.count ? <span key={x.status} className={`dash-stack-seg is-${i}`} style={{ flexGrow: x.count }} title={`${x.label}: ${x.count}`} /> : null,
                  )}
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
                <p className="hint">Value as Grand Totals before GST. Lost proposals are left out of the bar.</p>
              </section>
            </div>

            <div className="dash-grid">
              <section className="dash-card" aria-labelledby="dash-pay-title">
                <h2 id="dash-pay-title">Payments</h2>
                {pay.overdue.length + pay.dueSoon.length === 0 ? (
                  <p className="dash-empty">No payments overdue or due in the next 14 days.</p>
                ) : (
                  <ul className="dash-pay-list">
                    {[...pay.overdue, ...pay.dueSoon].map((x) => (
                      <li key={`${x.proposal.id}:${x.id}`} className={`is-${x.state}`}>
                        <a className="link-btn" href={`#/events/${x.proposal.id}/payments`}>{x.proposal.client.name || "Untitled client"}</a>
                        <span>{x.label} · {x.state === "overdue" ? "overdue since" : "due"} {formatDate(x.due)}</span>
                        <strong>{formatINR(x.outstanding)}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="dash-card" aria-labelledby="dash-sold-title">
                <h2 id="dash-sold-title">What's selling</h2>
                {sold.length === 0 ? (
                  <p className="dash-empty">Shown once proposals are accepted or lost.</p>
                ) : (
                  <table className="dash-table">
                    <thead>
                      <tr><th>Occasion</th><th>Won</th><th>Win rate</th><th>Value</th></tr>
                    </thead>
                    <tbody>
                      {sold.map((r) => (
                        <tr key={r.label}>
                          <td>{r.label}</td>
                          <td>{r.won} of {r.decided}</td>
                          <td>{pct(r.won / r.decided)}</td>
                          <td>{formatINRShort(r.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </div>

            <section className="dash-card" aria-labelledby="dash-exp-title">
              <h2 id="dash-exp-title">Expenses</h2>
              {expenseRows.length === 0 ? (
                <p className="dash-empty">No event expenses recorded on this device yet.</p>
              ) : (
                <ul className="dash-pay-list">
                  {expenseRows.map((r) => (
                    <li key={r.id} className={r.missingProof ? "is-overdue" : ""}>
                      <a className="link-btn" href={`#/events/${r.id}/expenses`}>{r.client}</a>
                      <span>{r.count} expense{r.count === 1 ? "" : "s"}{r.missingProof ? ` · ${r.missingProof} without proof` : ""}</span>
                      <strong>{formatINR(r.total)}</strong>
                    </li>
                  ))}
                </ul>
              )}
              <p className="hint">
                <a className="link-btn" href={`#/expenses/${COMPANY_BOOK_ID}`}>Company expenses</a>: {formatINR(company.total)} in {monthLabel(monthOf(today))} ·{" "}
                <a className="link-btn" href="#/expenses">All expenses and handovers</a>
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
