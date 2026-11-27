// #/guests — Guests & Seating: every wedding's guest list, RSVP replies, floor plans and seating at a glance, with a
// way straight into each wedding's Guests, Layout and Seating tabs (which live in the event workspace).
import { useMemo, useState } from "react";
import type { Proposal } from "../types";
import { eventDates } from "../lib/proposal";
import { formatDates, todayISO } from "../lib/format";
import { matchesSearch, proposalStatus, statusLabel } from "../lib/status";
import { confirmedHeadcount, guestFunctions, listOf } from "../lib/guestList";
import { layoutCapacity } from "../lib/layout";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";

interface Row {
  p: Proposal;
  first: string;
  households: number;
  people: number;
  coming: number;
  plans: number;
  fns: number;
  seats: number;
  seated: number;
  rsvp: boolean;
}

function rowOf(p: Proposal): Row {
  const list = listOf(p);
  const fns = guestFunctions(p);
  const layouts = fns.map((f) => p.layouts?.[f.id]).filter(Boolean);
  return {
    p,
    first: eventDates(p)[0] ?? "",
    households: list.guests.length,
    people: list.guests.reduce((t, g) => t + g.invited, 0),
    coming: confirmedHeadcount(p),
    plans: layouts.length,
    fns: fns.length,
    seats: layouts.reduce((t, l) => t + layoutCapacity(l), 0),
    seated: Object.values(p.seating ?? {}).reduce((t, plan) => t + Object.values(plan).flat().filter(Boolean).length, 0),
    rsvp: !!list.rsvp?.shareId,
  };
}

export default function Guests({ list, onNew }: { list: Proposal[]; onNew: () => void }) {
  const [q, setQ] = useState("");
  const today = todayISO();
  const rows = useMemo(() => {
    const live = list.filter((p) => proposalStatus(p) !== "lost").map(rowOf);
    // upcoming soonest first, then undated, then past (most recent first)
    const rank = (r: Row) => (!r.first ? 1 : r.first >= today ? 0 : 2);
    return live.sort((a, b) => rank(a) - rank(b) || (rank(a) === 2 ? b.first.localeCompare(a.first) : a.first.localeCompare(b.first)));
  }, [list, today]);
  const shown = rows.filter((r) => matchesSearch(r.p, q));
  const totals = rows.reduce((t, r) => ({ households: t.households + r.households, coming: t.coming + r.coming }), { households: 0, coming: 0 });

  return (
    <div className="ev-page">
      <PageHeader
        crumbs={[{ label: "Dashboard", href: "#/dashboard" }, { label: "Guests & Seating" }]}
        title="Guests & Seating"
        subtitle={rows.length ? `${rows.length} wedding${rows.length === 1 ? "" : "s"} · ${totals.households} households on guest lists · ${totals.coming} people confirmed` : "Guest lists, RSVP links, floor plans and seating for every wedding"}
        actions={<button type="button" className="btn-primary" onClick={onNew}>New proposal</button>}
      />
      <main className="ev-main">
        {!rows.length ? (
          <EmptyState icon="seats" title="No weddings yet" actions={<button type="button" className="btn-primary" onClick={onNew}>Start a proposal</button>}>
            Guests, floor plans and seating belong to a wedding. Start a proposal (or create one from an enquiry in the CRM), and it appears here.
          </EmptyState>
        ) : (
          <>
            <input className="search mb-4" type="search" placeholder="Search by client, venue or reference" aria-label="Search weddings" value={q} onChange={(e) => setQ(e.target.value)} />
            <ul className="m-0 grid list-none gap-3 p-0">
              {shown.map((r) => (
                <li key={r.p.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-line bg-card p-4">
                  <div className="min-w-[12rem] flex-1">
                    <a className="font-serif text-xl text-ink no-underline hover:underline" href={`#/events/${r.p.id}`}>{r.p.client.name || "Untitled client"}</a>
                    <p className="m-0 mt-0.5 text-sm text-ink-2">
                      {[r.first ? formatDates(eventDates(r.p)) : "Date to be confirmed", r.p.client.venue, statusLabel(proposalStatus(r.p))].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <dl className="m-0 grid grid-cols-3 gap-x-6 text-sm">
                    <div>
                      <dt className="text-xs text-stone">Guests</dt>
                      <dd className="m-0 tabular-nums text-ink">{r.households ? `${r.people} in ${r.households}` : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-stone">Coming</dt>
                      <dd className="m-0 tabular-nums text-ink">{r.coming || (r.rsvp ? "0" : "—")}{r.rsvp && <span className="ml-1 text-xs text-gold-text">RSVP live</span>}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-stone">Seating</dt>
                      <dd className="m-0 tabular-nums text-ink">{r.plans ? `${r.seated} of ${r.seats}` : "No plan"}</dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <a className="btn-primary btn-sm" href={`#/events/${r.p.id}/guests`}>Guests</a>
                    <a className="btn-ghost btn-sm" href={`#/events/${r.p.id}/layout`}>Layout{r.fns > 1 && r.plans ? ` (${r.plans}/${r.fns})` : ""}</a>
                    <a className="btn-ghost btn-sm" href={`#/events/${r.p.id}/seating`}>Seating</a>
                  </div>
                </li>
              ))}
            </ul>
            {!shown.length && <p className="text-center text-sm text-stone">No weddings match.</p>}
          </>
        )}
      </main>
    </div>
  );
}
