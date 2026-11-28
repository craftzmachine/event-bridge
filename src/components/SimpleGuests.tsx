// A standalone floor plan's guest list: households with their party size, side and group, added one by one or pasted
// from a spreadsheet. No RSVP: everyone on the list is seated.
import { useMemo, useState } from "react";
import type { Guest, Proposal } from "../types";
import { PARTY_MAX, SIDES, importGuests, listOf, newGuest } from "../lib/guestList";
import EmptyState from "./EmptyState";

type Update = (fn: (cur: Proposal) => Proposal) => void;

export default function SimpleGuests({ p, onUpdate }: { p: Proposal; onUpdate: Update }) {
  const guests = listOf(p).guests;
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const parsed = useMemo(() => (text.trim() ? importGuests(p, text) : []), [text, p]);
  const set = (fn: (gs: Guest[]) => Guest[]) => onUpdate((cur) => ({ ...cur, guestList: { ...listOf(cur), guests: fn(listOf(cur).guests) } }));
  const patch = (id: string, g: Partial<Guest>) => set((gs) => gs.map((x) => (x.id === id ? { ...x, ...g } : x)));
  const people = guests.reduce((t, g) => t + g.invited, 0);
  const shown = guests.filter((g) => !q.trim() || `${g.name} ${g.group ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-lg border border-line bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="m-0 mr-auto font-serif text-2xl text-ink">Guests <span className="text-base text-stone">({people} people in {guests.length})</span></h2>
          <button type="button" className="btn-primary btn-sm" onClick={() => set((gs) => [...gs, newGuest(p, { name: `Guest ${gs.length + 1}`, fns: [""] })])}>Add a household</button>
        </div>
        {!guests.length ? (
          <EmptyState icon="users" title="No guests yet">Paste a list on the right, or add households one by one. Everyone on this list is seated, no RSVP needed.</EmptyState>
        ) : (
          <>
            <input className="search mb-3" type="search" placeholder="Search guests" aria-label="Search guests" value={q} onChange={(e) => setQ(e.target.value)} />
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {shown.map((g) => (
                <li key={g.id} className="grid grid-cols-[minmax(0,1fr)_4.5rem_7.5rem_7rem_auto] items-center gap-2 max-sm:grid-cols-2">
                  <input className="min-w-0 rounded-sm border border-line bg-card px-2 py-1.5 text-sm" aria-label="Name" value={g.name} onChange={(e) => patch(g.id, { name: e.target.value })} />
                  <input className="rounded-sm border border-line bg-card px-2 py-1.5 text-sm" type="number" min={1} max={PARTY_MAX} aria-label="People" title="People in this household"
                    value={g.invited} onChange={(e) => patch(g.id, { invited: Math.max(1, Math.min(PARTY_MAX, Math.round(Number(e.target.value) || 1))) })} />
                  <select className="rounded-sm border border-line bg-card px-2 py-1.5 text-sm" aria-label="Side" value={g.side} onChange={(e) => patch(g.id, { side: e.target.value as Guest["side"] })}>
                    {SIDES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                  <input className="min-w-0 rounded-sm border border-line bg-card px-2 py-1.5 text-sm" aria-label="Group" placeholder="Group" value={g.group ?? ""} onChange={(e) => patch(g.id, { group: e.target.value || undefined })} />
                  <button type="button" className="link-btn link-danger" aria-label={`Remove ${g.name}`} onClick={() => set((gs) => gs.filter((x) => x.id !== g.id))}>×</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <section className="rounded-lg border border-line bg-card p-4">
        <h3 className="m-0 text-sm font-medium text-ink-2">Paste a list</h3>
        <p className="m-0 mt-1 text-xs text-stone">From Excel or Google Sheets, or one household per line: name, phone, side, group, people.</p>
        <textarea className="mt-2" rows={8} spellCheck={false} aria-label="Guests to add" placeholder={"The Menon family, , bride, Family, 4\nRahul Nair, , groom, College, 1"} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="mt-2 flex items-center gap-2">
          <span className="mr-auto text-xs text-ink-2">{parsed.length ? `${parsed.length} households, ${parsed.reduce((t, g) => t + g.invited, 0)} people` : ""}</span>
          <button type="button" className="btn-primary btn-sm" disabled={!parsed.length} onClick={() => { set((gs) => [...gs, ...parsed.map((g) => ({ ...g, fns: [""] }))]); setText(""); }}>Add</button>
        </div>
      </section>
    </div>
  );
}
