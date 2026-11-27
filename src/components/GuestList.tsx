// The wedding workspace's Guests tab: the guest list, RSVP totals per function, and the RSVP link guests answer on.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Guest, Proposal, RsvpSettings, RsvpStatus } from "../types";
import { useConfig } from "../config/context";
import { api, ApiError } from "../lib/api";
import { functionHeading } from "../lib/functions";
import {
  GUEST_LIMIT, MEALS_DEFAULT, PARTY_MAX, SIDES, STATUS_LABEL, confirmedHeadcount, guestFunctions, inviteKey, importGuests, inviteMessage, inviteSnapshot,
  invitedTo, listOf, mergeRsvp, newGuest, rsvpLink, rsvpSummary, statusOf, type WireReply,
} from "../lib/guestList";
import { waLink, waNumber } from "../lib/whatsapp";
import { useCopy } from "./ShareResult";
import EmptyState from "./EmptyState";

type Update = (fn: (cur: Proposal) => Proposal) => void;
const STATUS_TONE: Record<RsvpStatus | "pending", string> = {
  yes: "border-gold bg-gold-soft text-ink",
  maybe: "border-taupe bg-paper-2 text-ink-2",
  no: "border-danger-line bg-danger-soft text-danger-ink",
  pending: "border-line text-stone",
};

export default function GuestList({ p, onUpdate }: { p: Proposal; onUpdate: Update }) {
  const list = listOf(p);
  const fns = guestFunctions(p);
  const summary = rsvpSummary(p);
  const [q, setQ] = useState("");
  const [side, setSide] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [editing, setEditing] = useState<Guest | null>(null);
  const [pasting, setPasting] = useState(false);
  const [syncNote, setSyncNote] = useState("");

  const setGuests = (fn: (gs: Guest[]) => Guest[]) => onUpdate((cur) => ({ ...cur, guestList: { ...listOf(cur), guests: fn(listOf(cur).guests) } }));

  // replies from the RSVP link come back into the list when the tab opens
  const shareId = list.rsvp?.shareId;
  useEffect(() => {
    if (!shareId) {
      return;
    }
    api<{ replies: Record<string, WireReply> }>(`staff/rsvp?id=${shareId}`)
      .then((r) => {
        onUpdate((cur) => mergeRsvp(cur, r.replies) ?? cur);
        setSyncNote("");
      })
      .catch((e: ApiError) => setSyncNote(e.status === 0 ? "Couldn't reach the RSVP service; replies will show when it's back." : e.message));
  }, [shareId]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return list.guests
      .filter((g) => !needle || `${g.name} ${g.phone ?? ""} ${g.group ?? ""}`.toLowerCase().includes(needle))
      .filter((g) => side === "all" || g.side === side)
      .filter((g) => status === "all" || fns.some((f) => invitedTo(p, g).includes(f.id) && statusOf(g, f.id) === status))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [list.guests, q, side, status, p]);

  const headcount = confirmedHeadcount(p);

  return (
    <div className="grid gap-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Replies by function">
        {summary.map((s) => (
          <div key={s.fn.id} className="rounded-lg border border-line bg-card p-4">
            <p className="m-0 text-sm text-ink-2">{s.fn.id ? functionHeading(s.fn) : "The celebration"}</p>
            <p className="m-0 mt-1 font-serif text-3xl text-ink">{s.yes}<span className="text-base text-ink-2"> coming</span></p>
            <p className="m-0 mt-1 text-xs text-stone">
              {s.invited} invited in {s.households} household{s.households === 1 ? "" : "s"} · {s.no} not coming · {s.maybe} maybe · {s.pending} no reply
            </p>
            {s.invited > 0 && (
              <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-paper-2" aria-hidden="true">
                <div className="bg-gold" style={{ width: `${(s.yes / s.invited) * 100}%` }} />
                <div className="bg-taupe" style={{ width: `${(s.maybe / s.invited) * 100}%` }} />
                <div className="bg-danger-line" style={{ width: `${(s.no / s.invited) * 100}%` }} />
              </div>
            )}
          </div>
        ))}
      </section>

      <RsvpCard p={p} onUpdate={onUpdate} syncNote={syncNote} />

      <section className="rounded-lg border border-line bg-card p-4 sm:p-5" aria-labelledby="guests-title">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 id="guests-title" className="m-0 mr-auto font-serif text-2xl text-ink">Guests <span className="text-base text-stone">({list.guests.length})</span></h2>
          {headcount > 0 && headcount !== p.client.guests && (
            <button type="button" className="btn-ghost btn-sm" title="Set the proposal's guest count to the most people coming to one function" onClick={() => onUpdate((cur) => ({ ...cur, client: { ...cur.client, guests: headcount } }))}>
              Use confirmed headcount ({headcount})
            </button>
          )}
          <button type="button" className="btn-ghost btn-sm" onClick={() => setPasting(true)}>Paste a list</button>
          <button type="button" className="btn-primary btn-sm" disabled={list.guests.length >= GUEST_LIMIT} onClick={() => setEditing(newGuest(p))}>Add guest</button>
        </div>

        {list.guests.length === 0 ? (
          <EmptyState icon="users" title="No guests yet" actions={<><button type="button" className="btn-primary" onClick={() => setEditing(newGuest(p))}>Add the first guest</button><button type="button" className="btn-ghost" onClick={() => setPasting(true)}>Paste from a spreadsheet</button></>}>
            Add each household once, with how many people the invitation is for. Then send everyone their personal RSVP link on WhatsApp.
          </EmptyState>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              <input className="search min-w-0 flex-1" type="search" placeholder="Search name, phone or group" aria-label="Search guests" value={q} onChange={(e) => setQ(e.target.value)} />
              <select className="rounded-sm border border-line bg-card px-3" aria-label="Side" value={side} onChange={(e) => setSide(e.target.value)}>
                <option value="all">Both sides</option>
                {SIDES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <select className="rounded-sm border border-line bg-card px-3" aria-label="Reply" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">Any reply</option>
                {(["yes", "maybe", "no", "pending"] as const).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Guest</th>
                    <th className="text-right">Party</th>
                    {fns.map((f) => <th key={f.id}>{f.id ? f.label : "Reply"}</th>)}
                    <th>Meal</th>
                    <th><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((g) => (
                    <GuestRow key={g.id} p={p} g={g} onEdit={() => setEditing(g)} />
                  ))}
                </tbody>
              </table>
            </div>
            {!shown.length && <p className="text-center text-sm text-stone">No guests match.</p>}
          </>
        )}
      </section>

      {editing && (
        <GuestDialog
          p={p}
          guest={editing}
          isNew={!list.guests.some((g) => g.id === editing.id)}
          onClose={() => setEditing(null)}
          onSave={(g) => {
            setGuests((gs) => (gs.some((x) => x.id === g.id) ? gs.map((x) => (x.id === g.id ? g : x)) : [...gs, g]));
            setEditing(null);
          }}
          onDelete={(g) => {
            if (!window.confirm(`Remove ${g.name || "this guest"} from the list? Their RSVP link stops working once you update the RSVP link.`)) return;
            setGuests((gs) => gs.filter((x) => x.id !== g.id));
            setEditing(null);
          }}
        />
      )}
      {pasting && (
        <PasteDialog
          p={p}
          onClose={() => setPasting(false)}
          onAdd={(gs) => {
            setGuests((cur) => [...cur, ...gs].slice(0, GUEST_LIMIT));
            setPasting(false);
          }}
        />
      )}
    </div>
  );
}

function GuestRow({ p, g, onEdit }: { p: Proposal; g: Guest; onEdit: () => void }) {
  const fns = guestFunctions(p);
  const invited = invitedTo(p, g);
  const token = p.guestList?.rsvp?.token;
  const wa = waNumber(g.phone);
  const link = token && g.source !== "rsvp" ? rsvpLink(token, g.code) : null;
  return (
    <tr>
      <td>
        <button type="button" className="link-btn text-left text-[15px] text-ink no-underline" onClick={onEdit}>{g.name || "Unnamed guest"}</button>
        <div className="text-xs text-stone">
          {[SIDES.find((s) => s.id === g.side && s.id)?.label, g.group, g.source === "rsvp" ? "added themselves" : ""].filter(Boolean).join(" · ")}
        </div>
      </td>
      <td className="text-right tabular-nums">{g.invited}</td>
      {fns.map((f) => {
        if (!invited.includes(f.id)) return <td key={f.id} className="text-stone">—</td>;
        const st = statusOf(g, f.id);
        const n = g.reply?.[f.id]?.count;
        return (
          <td key={f.id}>
            <span className={`inline-block whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs ${STATUS_TONE[st]}`}>
              {STATUS_LABEL[st]}{st === "yes" && n ? ` · ${n}` : ""}
            </span>
          </td>
        );
      })}
      <td className="text-sm text-ink-2">{g.meal ?? ""}{g.dietary ? <div className="text-xs text-stone">{g.dietary}</div> : null}</td>
      <td className="whitespace-nowrap text-right">
        {link && (
          <a className="btn-ghost btn-sm" href={waLink(wa, inviteMessage(g, p.client.name || "our wedding", link, p.guestList?.rsvp?.deadline))} target="_blank" rel="noopener noreferrer" title="Send their personal RSVP link">
            WhatsApp
          </a>
        )}
      </td>
    </tr>
  );
}

function RsvpCard({ p, onUpdate, syncNote }: { p: Proposal; onUpdate: Update; syncNote: string }) {
  const { brand } = useConfig();
  const rsvp: RsvpSettings = listOf(p).rsvp ?? { meals: MEALS_DEFAULT, open: false };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { copied, copy } = useCopy();
  const set = (patch: Partial<RsvpSettings>) => onUpdate((cur) => ({ ...cur, guestList: { ...listOf(cur), rsvp: { ...(listOf(cur).rsvp ?? { meals: MEALS_DEFAULT, open: false }), ...patch } } }));
  const live = !!rsvp.shareId && !!rsvp.token;
  const fingerprint = inviteKey(inviteSnapshot(p, brand, rsvp));
  const stale = live && rsvp.synced !== fingerprint;

  const send = async () => {
    setBusy(true);
    setError("");
    try {
      const invite = inviteSnapshot(p, brand, rsvp);
      const r = live
        ? await api<{ rsvp: { id: string; token: string } }>(`staff/rsvp?id=${rsvp.shareId}`, { method: "PUT", json: { invite } })
        : await api<{ rsvp: { id: string; token: string } }>("staff/rsvp", { method: "POST", json: { invite, proposalId: p.id } });
      set({ shareId: r.rsvp.id, token: r.rsvp.token, synced: inviteKey(invite) });
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 404) set({ shareId: undefined, token: undefined, synced: undefined });
      setError(err.status === 0 ? "Couldn't reach the RSVP service. Check the connection, or ask your admin to set up sharing." : err.message);
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    if (!window.confirm("Turn off the RSVP link? Guests won't be able to open it. Replies already in stay on the list.")) return;
    setBusy(true);
    try {
      await api(`staff/rsvp?id=${rsvp.shareId}`, { method: "DELETE" });
    } catch {
      /* already gone */
    }
    set({ shareId: undefined, token: undefined, synced: undefined });
    setBusy(false);
  };

  const openLink = live ? rsvpLink(rsvp.token!) : "";
  return (
    <section className="rounded-lg border border-line bg-card p-4 sm:p-5" aria-labelledby="rsvp-title">
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <h2 id="rsvp-title" className="m-0 font-serif text-2xl text-ink">RSVP link</h2>
          <p className="m-0 mt-1 text-sm text-ink-2">
            {live ? "Live. Each guest's WhatsApp button sends their personal link; they see only their own invitation." : "Guests answer per function on their phone, and their replies come back here."}
          </p>
        </div>
        {live && <button type="button" className="link-btn link-danger" disabled={busy} onClick={turnOff}>Turn off</button>}
        <button type="button" className="btn-primary btn-sm" disabled={busy || !listOf(p).guests.length && !rsvp.open} onClick={send}>
          {busy ? "Saving…" : live ? (stale ? "Update RSVP link" : "Up to date") : "Create RSVP link"}
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          <span>Reply by</span>
          <input type="date" value={rsvp.deadline ?? ""} onChange={(e) => set({ deadline: e.target.value || undefined })} />
        </label>
        <label className="field">
          <span>Meal choices <small className="text-stone">(comma separated; blank for none)</small></span>
          <input value={rsvp.meals.join(", ")} onChange={(e) => set({ meals: e.target.value.split(",").map((m) => m.trimStart()) })} />
        </label>
        <label className="field sm:col-span-2">
          <span>Message to guests <small className="text-stone">(optional)</small></span>
          <textarea rows={2} maxLength={1000} value={rsvp.message ?? ""} onChange={(e) => set({ message: e.target.value })} />
        </label>
        <label className="check sm:col-span-2">
          <input type="checkbox" checked={rsvp.open} onChange={(e) => set({ open: e.target.checked })} />
          Let people who aren't on the list reply with their name and phone (an open link to share in a group)
        </label>
      </div>
      {live && rsvp.open && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-line bg-paper-2 p-3 text-sm">
          <code className="min-w-0 flex-1 truncate">{openLink}</code>
          <button type="button" className="btn-ghost btn-sm" onClick={() => copy("open", openLink)}>{copied === "open" ? "Copied" : "Copy open link"}</button>
        </div>
      )}
      {stale && <p className="m-0 mt-3 text-xs text-gold-text">You've changed guests or details since the link was last updated. Update it so guests see the latest.</p>}
      {(error || syncNote) && <p className="m-0 mt-3 text-sm text-danger-ink" role="alert">{error || syncNote}</p>}
    </section>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return createPortal(
    <dialog ref={ref} className="venue-dialog xi exp-dialog" onClose={onClose} aria-labelledby="gd-title">
      <header className="xi-head">
        <h2 id="gd-title">{title}</h2>
        <button className="vd-close" onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className="xi-body">{children}</div>
    </dialog>,
    document.body,
  );
}

function GuestDialog({ p, guest, isNew, onClose, onSave, onDelete }: { p: Proposal; guest: Guest; isNew: boolean; onClose: () => void; onSave: (g: Guest) => void; onDelete: (g: Guest) => void }) {
  const [g, setG] = useState(guest);
  const fns = guestFunctions(p);
  const meals = p.guestList?.rsvp?.meals.filter(Boolean) ?? [];
  const set = (patch: Partial<Guest>) => setG((cur) => ({ ...cur, ...patch }));
  const invited = invitedTo(p, g);
  const setReply = (fnId: string, st: RsvpStatus | "pending") =>
    setG((cur) => {
      const reply = { ...(cur.reply ?? {}) };
      if (st === "pending") delete reply[fnId];
      else reply[fnId] = { status: st, count: st === "no" ? 0 : Math.min(cur.invited, reply[fnId]?.count || cur.invited) };
      return { ...cur, reply };
    });
  return (
    <Dialog title={isNew ? "Add a guest" : `Edit ${guest.name || "guest"}`} onClose={onClose}>
      <div className="exp-grid">
        <label className="field field-wide">
          <span>Name on the invitation</span>
          <input autoFocus maxLength={120} placeholder="e.g. Mr & Mrs Menon and family" value={g.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="field">
          <span>Phone / WhatsApp</span>
          <input inputMode="tel" maxLength={20} value={g.phone ?? ""} onChange={(e) => set({ phone: e.target.value || undefined })} />
        </label>
        <label className="field">
          <span>People invited</span>
          <input type="number" min={1} max={PARTY_MAX} value={g.invited} onChange={(e) => set({ invited: Math.max(1, Math.min(PARTY_MAX, Math.floor(Number(e.target.value) || 1))) })} />
        </label>
        <label className="field">
          <span>Side</span>
          <select className="min-h-[var(--tap)] rounded-sm border border-line bg-card px-3" value={g.side} onChange={(e) => set({ side: e.target.value as Guest["side"] })}>
            {SIDES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Group <small className="text-stone">(seated together)</small></span>
          <input maxLength={60} placeholder="Family, College friends, Office…" value={g.group ?? ""} onChange={(e) => set({ group: e.target.value || undefined })} />
        </label>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-xs font-medium text-ink-2">Invited to, and their reply</legend>
        {fns.map((f) => {
          const on = invited.includes(f.id);
          const st = statusOf(g, f.id);
          return (
            <div key={f.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line px-3 py-2">
              <label className="check min-h-0 flex-1">
                <input type="checkbox" checked={on} onChange={(e) => set({ fns: e.target.checked ? [...new Set([...invitedTo(p, g), f.id])] : invitedTo(p, g).filter((x) => x !== f.id) })} />
                {f.id ? functionHeading(f) : "The celebration"}
              </label>
              {on && (
                <>
                  <select className="rounded-sm border border-line bg-card px-2 py-1.5 text-sm" aria-label={`Reply for ${f.label}`} value={st} onChange={(e) => setReply(f.id, e.target.value as RsvpStatus | "pending")}>
                    {(["pending", "yes", "maybe", "no"] as const).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                  {st === "yes" && (
                    <input className="w-20 rounded-sm border border-line bg-card px-2 py-1.5 text-sm" type="number" min={1} max={g.invited} aria-label="How many coming" value={g.reply?.[f.id]?.count ?? g.invited}
                      onChange={(e) => setG((cur) => ({ ...cur, reply: { ...(cur.reply ?? {}), [f.id]: { status: "yes", count: Math.max(1, Math.min(cur.invited, Math.floor(Number(e.target.value) || 1))) } } }))} />
                  )}
                </>
              )}
            </div>
          );
        })}
      </fieldset>
      <div className="exp-grid">
        {meals.length > 0 && (
          <label className="field">
            <span>Meal</span>
            <select className="min-h-[var(--tap)] rounded-sm border border-line bg-card px-3" value={g.meal ?? ""} onChange={(e) => set({ meal: e.target.value || undefined })}>
              <option value="">Not chosen</option>
              {meals.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
        )}
        <label className="field">
          <span>Dietary needs</span>
          <input maxLength={300} value={g.dietary ?? ""} onChange={(e) => set({ dietary: e.target.value || undefined })} />
        </label>
        <label className="field field-wide">
          <span>Notes</span>
          <textarea rows={2} maxLength={500} value={g.note ?? ""} onChange={(e) => set({ note: e.target.value || undefined })} />
        </label>
      </div>
      <div className="xi-actions">
        {!isNew && <button type="button" className="link-btn link-danger exp-remove" onClick={() => onDelete(guest)}>Remove guest</button>}
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" disabled={!g.name.trim()} onClick={() => onSave({ ...g, name: g.name.trim(), repliedAt: g.reply !== guest.reply ? new Date().toISOString() : g.repliedAt })}>Save</button>
      </div>
    </Dialog>
  );
}

function PasteDialog({ p, onClose, onAdd }: { p: Proposal; onClose: () => void; onAdd: (gs: Guest[]) => void }) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => (text.trim() ? importGuests(p, text) : []), [text, p]);
  return (
    <Dialog title="Paste a guest list" onClose={onClose}>
      <p className="m-0 text-sm text-ink-2">
        Copy rows from Excel or Google Sheets, or type one household per line: <strong>name, phone, side, group, people</strong>. Only the name is needed. Everyone is invited to every function; change that per guest afterwards.
      </p>
      <label className="field">
        <span>Guests</span>
        <textarea rows={10} autoFocus spellCheck={false} placeholder={"The Menon family, 98470 12345, bride, Family, 4\nRahul Nair, , groom, College, 1"} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <p className="m-0 text-sm text-ink-2" aria-live="polite">{parsed.length ? `${parsed.length} household${parsed.length === 1 ? "" : "s"}, ${parsed.reduce((t, g) => t + g.invited, 0)} people` : "Nothing to add yet."}</p>
      <div className="xi-actions">
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" disabled={!parsed.length} onClick={() => onAdd(parsed)}>Add {parsed.length || ""} guests</button>
      </div>
    </Dialog>
  );
}
