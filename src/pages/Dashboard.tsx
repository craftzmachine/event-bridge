import { useEffect, useMemo, useState } from "react";
import type { Proposal } from "../types";
import { useConfig } from "../config/context";
import { api } from "../lib/api";
import type { Share } from "../lib/shares";
import { marginThisMonth, monthCompare, paymentsOverview, pipeline, selling, upcoming } from "../lib/dashboard";
import { followUps, type FollowUp } from "../lib/followups";
import { statusLabel } from "../lib/status";
import { formatDate, formatINR, formatINRShort } from "../lib/format";
import { waLink, waNumber } from "../lib/whatsapp";
import SiteNav from "../components/SiteNav";

const month = (d: Date) => d.toLocaleString("en-GB", { month: "long" });
const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

/** "₹1.2L more than October", "the same as October", "₹50K less than October" */
function versus(now: number, last: number, lastMonth: string) {
  if (Math.round(now) === Math.round(last)) return `the same as ${lastMonth}`;
  return `${formatINRShort(Math.abs(now - last))} ${now > last ? "more" : "less"} than ${lastMonth}`;
}

/**
 * The team's overview at #/dashboard: this month's figures, who to follow up, the pipeline, upcoming events,
 * payments and what's selling. Built from this device's proposals, plus link activity when sharing is connected.
 */
export default function Dashboard({ list, account, onSignOut, onOpen }: { list: Proposal[]; account: string; onSignOut: () => void; onOpen: (id: string) => void }) {
  const { catalog, brand, venues } = useConfig();
  const [shares, setShares] = useState<Share[] | null>(null);
  const [linkInfo, setLinkInfo] = useState<"loading" | "ok" | "off">("loading");

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

  const now = useMemo(() => new Date(), []);
  const m = monthCompare(list, brand.gstPct, now);
  const pipe = pipeline(list, brand.gstPct);
  const maxValue = Math.max(1, ...pipe.map((x) => x.value));
  const todo = followUps(list, shares ?? [], brand, now.getTime());
  const events = upcoming(list, catalog, venues.venues, now);
  const pay = paymentsOverview(list, brand, now);
  const margin = marginThisMonth(list, brand.gstPct, now);
  const sold = selling(list, catalog, brand.gstPct);
  const lastName = month(m.lastMonth);

  const nudge = (f: FollowUp) =>
    waLink(waNumber(f.contact), `Dear ${f.client}, this is ${brand.company} following up on your proposal. Is there anything you'd like us to change or explain?`);

  return (
    <div className="dash">
      <header className="dash-hero">
        <SiteNav current="dashboard" account={account} onSignOut={onSignOut} />
        <div className="dash-hero-text">
          <h1>Dashboard</h1>
          <p>
            {month(now)} at a glance, from the {list.length} proposal{list.length === 1 ? "" : "s"} on this device
            {linkInfo === "ok" ? ", with your clients' activity on shared links." : "."}
          </p>
        </div>
      </header>

      <main className="dash-main">
        {list.length === 0 ? (
          <div className="empty-state">
            <p>No proposals on this device yet. Start one in Proposal Studio and it shows up here.</p>
            <a className="btn-primary" href="#/studio">Open Proposal Studio</a>
          </div>
        ) : (
          <>
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
                <p className="hint">Value at each status, as Grand Totals before GST.</p>
                <ul className="dash-bars">
                  {pipe.map((x) => (
                    <li key={x.status} title={`${x.label}: ${x.count} proposal${x.count === 1 ? "" : "s"}, ${formatINR(x.value)}`}>
                      <span className="dash-bar-label">{x.label}</span>
                      <span className="dash-bar-track" aria-hidden="true">
                        <span className="dash-bar" style={{ width: `${x.value ? Math.max(2, (x.value / maxValue) * 100) : 0}%` }} />
                      </span>
                      <span className="dash-bar-value">
                        {formatINRShort(x.value)} <small>{x.count}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <section className="dash-card" aria-labelledby="dash-events-title">
              <h2 id="dash-events-title">Next 90 days</h2>
              {events.length === 0 ? (
                <p className="dash-empty">No dated events in the next 90 days.</p>
              ) : (
                <div className="dash-table-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr><th>Date</th><th>Function</th><th>Client</th><th>Venue</th><th>Guests</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {events.map((e) => (
                        <tr key={e.key}>
                          <td>{formatDate(e.date)}</td>
                          <td>{e.label}</td>
                          <td><button className="link-btn" onClick={() => onOpen(e.proposal.id)}>{e.proposal.client.name || "Untitled client"}</button></td>
                          <td>{e.proposal.client.venue || "—"}{e.capacity && <small className="dash-warn" title={e.capacity}> · over capacity</small>}</td>
                          <td>{e.proposal.client.guests ? e.proposal.client.guests.toLocaleString("en-IN") : "—"}</td>
                          <td>{statusLabel(e.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <div className="dash-grid">
              <section className="dash-card" aria-labelledby="dash-pay-title">
                <h2 id="dash-pay-title">Payments</h2>
                {pay.overdue.length + pay.dueSoon.length === 0 ? (
                  <p className="dash-empty">No payments overdue or due in the next 14 days.</p>
                ) : (
                  <ul className="dash-pay-list">
                    {[...pay.overdue, ...pay.dueSoon].map((x) => (
                      <li key={`${x.proposal.id}:${x.id}`} className={`is-${x.state}`}>
                        <button className="link-btn" onClick={() => onOpen(x.proposal.id)}>{x.proposal.client.name || "Untitled client"}</button>
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
          </>
        )}
      </main>
    </div>
  );
}
