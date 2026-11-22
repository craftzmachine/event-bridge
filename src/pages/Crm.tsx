import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useConfig } from "../config/context";
import { uid, type useProposals } from "../state/proposals";
import { downloadList, readListFile, useStoredList } from "../state/local";
import { LEADS_FORMAT, LEADS_KEY } from "../state/crm";
import {
  clientsFrom,
  followUpsDue,
  isLead,
  isOpen,
  leadToProposal,
  logActivity,
  moveStage,
  searchLeads,
  sourceLabel,
  SOURCES,
  stageLabel,
  STAGES,
  syncWithProposals,
  type Lead,
  type LeadActivity,
  type LeadStage,
} from "../lib/crm";
import { formatDate, formatDates, formatINRShort, todayISO } from "../lib/format";
import { proposalTitle } from "../lib/proposal";
import { proposalStatus, statusLabel } from "../lib/status";
import { waLink, waNumber } from "../lib/whatsapp";
import PageHeader from "../components/PageHeader";
import MoneyInput from "../components/MoneyInput";

type Store = ReturnType<typeof useProposals>;
type View = "board" | "list" | "clients";

const blank = (by: string): Lead => {
  const now = new Date().toISOString();
  return { id: `l-${uid()}`, name: "", source: "instagram", dates: [], stage: "new", activity: [], createdAt: now, updatedAt: now, createdBy: by };
};

/**
 * #/crm: enquiries from first message to booking. A board by stage (moved with buttons, so it works on a phone),
 * a list with the follow-ups due first, and the clients behind this device's proposals. A lead becomes a proposal
 * with one click, and follows that proposal's status afterwards.
 */
export default function Crm({ store, account, onOpen }: { store: Store; account: string; onOpen: (id: string) => void }) {
  const { brand, catalog } = useConfig();
  const leads = useStoredList(LEADS_KEY, isLead);
  const [view, setView] = useState<View>("board");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Lead | null>(null);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const today = todayISO();

  // leads follow their proposals (sent, accepted, lost)
  useEffect(() => {
    for (const l of syncWithProposals(leads.list, store.list, account)) leads.save(l);
  }, [store.list]);

  const shown = searchLeads(leads.list, q);
  const due = followUpsDue(leads.list, today);
  const open = leads.list.filter(isOpen);

  function createProposal(l: Lead) {
    const p = leadToProposal(l, brand, store.refs);
    store.save(p);
    leads.save(logActivity(moveStage({ ...l, proposalId: p.id }, l.stage === "won" ? "won" : "proposal", account), "note", `Proposal ${p.ref} created`, account));
    setEditing(null);
    onOpen(p.id);
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    const items = await readListFile(file, LEADS_FORMAT, isLead);
    setMsg(items ? `Imported ${leads.importMany(items)} lead${items.length === 1 ? "" : "s"}.` : "That file isn't a lead list from Event Bridge.");
    if (fileRef.current) fileRef.current.value = "";
  }

  const card = (l: Lead) => {
    const late = l.followUp && l.followUp <= today && isOpen(l);
    const i = STAGES.findIndex((s) => s.id === l.stage);
    return (
      <div key={l.id} className={`crm-card${late ? " is-due" : ""}`}>
        <button type="button" className="crm-card-main" onClick={() => setEditing(l)}>
          <strong>{l.name || "Unnamed enquiry"}</strong>
          <span>{[l.dates.length ? formatDates(l.dates) : "", l.guests ? `${l.guests} guests` : "", l.budget ? formatINRShort(l.budget) : ""].filter(Boolean).join(" · ") || sourceLabel(l.source)}</span>
          {l.followUp && isOpen(l) && <small>{late ? "Follow up now" : "Follow up"} · {formatDate(l.followUp)}</small>}
        </button>
        {isOpen(l) && (
          <div className="crm-card-tools">
            {i > 0 && <button type="button" className="btn-ghost btn-sm" aria-label={`Move ${l.name} back to ${STAGES[i - 1].label}`} onClick={() => leads.save(moveStage(l, STAGES[i - 1].id, account))}>←</button>}
            {i < 3 && <button type="button" className="btn-ghost btn-sm" onClick={() => leads.save(moveStage(l, STAGES[i + 1].id, account))}>{STAGES[i + 1].label} →</button>}
            {waNumber(l.phone) && <a className="link-btn" href={waLink(waNumber(l.phone), `Dear ${l.name}, this is ${brand.company}. `)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="ev-page">
      <PageHeader
        crumbs={[{ label: "Dashboard", href: "#/dashboard" }, { label: "CRM" }]}
        title="Enquiries & clients"
        subtitle={`${open.length} open enquir${open.length === 1 ? "y" : "ies"} · ${due.length} to follow up today`}
        actions={
          <>
            <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>Import</button>
            <button type="button" className="btn-ghost" disabled={!leads.list.length} onClick={() => downloadList(`Leads_${today}.json`, LEADS_FORMAT, leads.list)}>Export</button>
            <button type="button" className="btn-primary" onClick={() => setEditing(blank(account))}>New enquiry</button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
          </>
        }
      />
      <main className="ev-main">
        {msg && <p className="toast" role="status">{msg}</p>}
        <div className="ev-filters">
          <div className="seg" role="group" aria-label="Show">
            {(["board", "list", "clients"] as const).map((v) => (
              <button key={v} type="button" className={view === v ? "is-on" : ""} aria-pressed={view === v} onClick={() => setView(v)}>
                {v === "board" ? "Board" : v === "list" ? "List" : "Clients"}
              </button>
            ))}
          </div>
          {view !== "clients" && <input type="search" placeholder="Search name, phone, venue or note" aria-label="Search enquiries" value={q} onChange={(e) => setQ(e.target.value)} />}
        </div>

        {view === "clients" ? (
          <Clients store={store} onOpen={onOpen} />
        ) : leads.list.length === 0 ? (
          <div className="empty-state">
            <p>No enquiries yet. Add each new enquiry from Instagram, WhatsApp or a referral, then move it along as you talk.</p>
            <button type="button" className="btn-primary" onClick={() => setEditing(blank(account))}>Add the first enquiry</button>
          </div>
        ) : view === "board" ? (
          <div className="crm-board">
            {STAGES.map((s) => {
              const col = shown.filter((l) => l.stage === s.id);
              return (
                <section key={s.id} className={`crm-col is-${s.id}`} aria-label={s.label}>
                  <h3>{s.label} <small>{col.length}</small></h3>
                  {col.map(card)}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr><th>Name</th><th>Stage</th><th>Follow up</th><th>Dates</th><th>Source</th><th>Proposal</th></tr>
              </thead>
              <tbody>
                {shown.map((l) => {
                  const p = l.proposalId ? store.list.find((x) => x.id === l.proposalId) : undefined;
                  return (
                    <tr key={l.id}>
                      <td><button type="button" className="link-btn" onClick={() => setEditing(l)}>{l.name || "Unnamed enquiry"}</button><small>{l.phone}</small></td>
                      <td>{stageLabel(l.stage)}</td>
                      <td className={l.followUp && l.followUp <= today && isOpen(l) ? "warn" : ""}>{l.followUp ? formatDate(l.followUp) : "—"}</td>
                      <td>{l.dates.length ? formatDates(l.dates) : "—"}</td>
                      <td>{sourceLabel(l.source)}</td>
                      <td>{p ? <button type="button" className="link-btn" onClick={() => onOpen(p.id)}>{p.ref} · {statusLabel(proposalStatus(p))}</button> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
      {editing && (
        <LeadDialog
          lead={editing}
          isNew={!leads.list.some((x) => x.id === editing.id)}
          account={account}
          eventTypes={catalog.eventTypes}
          proposalLabel={(() => {
            const p = editing.proposalId ? store.list.find((x) => x.id === editing.proposalId) : undefined;
            return p ? `${p.ref} · ${proposalTitle(p, catalog) || "proposal"} · ${statusLabel(proposalStatus(p))}` : undefined;
          })()}
          onSave={(l) => {
            leads.save({ ...l, name: l.name.trim(), updatedAt: new Date().toISOString() });
            setEditing(null);
          }}
          onDelete={(l) => {
            if (confirm(`Delete the enquiry from ${l.name || "this person"}?`)) {
              leads.remove(l.id);
              setEditing(null);
            }
          }}
          onCreateProposal={createProposal}
          onOpenProposal={(id) => {
            setEditing(null);
            onOpen(id);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function Clients({ store, onOpen }: { store: Store; onOpen: (id: string) => void }) {
  const { brand, catalog } = useConfig();
  const clients = clientsFrom(store.list, brand.gstPct);
  if (!clients.length) return <div className="empty-state"><p>Clients appear here once proposals have a name or number.</p></div>;
  return (
    <div className="dash-table-wrap">
      <table className="dash-table">
        <thead>
          <tr><th>Client</th><th>Contact</th><th>Proposals</th><th>Booked</th><th>Latest date</th></tr>
        </thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c.key}>
              <td><strong>{c.name}</strong></td>
              <td>{c.contact || "—"}{waNumber(c.contact) && <> · <a className="link-btn" href={waLink(waNumber(c.contact), `Dear ${c.name}, this is ${brand.company}. `)} target="_blank" rel="noopener noreferrer">WhatsApp</a></>}</td>
              <td>
                {c.proposals.map((p) => (
                  <button key={p.id} type="button" className="link-btn crm-prop" onClick={() => onOpen(p.id)}>{p.ref} · {proposalTitle(p, catalog) || "proposal"} · {statusLabel(proposalStatus(p))}</button>
                ))}
              </td>
              <td>{c.booked ? formatINRShort(c.booked) : "—"}</td>
              <td>{c.lastDate ? formatDate(c.lastDate) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const KIND_LABEL: Record<LeadActivity["kind"], string> = { call: "Call", meeting: "Meeting", whatsapp: "WhatsApp", note: "Note", stage: "Stage" };

function LeadDialog({
  lead,
  isNew,
  account,
  eventTypes,
  proposalLabel,
  onSave,
  onDelete,
  onCreateProposal,
  onOpenProposal,
  onClose,
}: {
  lead: Lead;
  isNew: boolean;
  account: string;
  eventTypes: { id: string; label: string }[];
  proposalLabel?: string;
  onSave: (l: Lead) => void;
  onDelete: (l: Lead) => void;
  onCreateProposal: (l: Lead) => void;
  onOpenProposal: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [l, setL] = useState(lead);
  const [log, setLog] = useState<{ kind: LeadActivity["kind"]; text: string; followUp: string }>({ kind: "call", text: "", followUp: "" });
  const [lostReason, setLostReason] = useState(lead.lostReason ?? "");
  // no close() on cleanup: it fires onClose, and React's dev double-run would dismiss the dialog
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const set = (patch: Partial<Lead>) => setL((cur) => ({ ...cur, ...patch }));
  const addLog = () => {
    if (!log.text.trim()) return;
    setL((cur) => logActivity(cur, log.kind, log.text, account, new Date(), log.followUp || undefined));
    setLog({ kind: "call", text: "", followUp: "" });
  };
  const setStage = (stage: LeadStage) => setL((cur) => moveStage(cur, stage, account, new Date(), stage === "lost" ? lostReason : undefined));

  return createPortal(
    <dialog ref={ref} className="venue-dialog xi exp-dialog" onClose={onClose} aria-labelledby="lead-title">
      <header className="xi-head">
        <h2 id="lead-title">{isNew ? "New enquiry" : l.name || "Enquiry"}</h2>
        <button className="vd-close" onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className="xi-body">
        <div className="exp-grid">
          <label className="field">
            <span>Name</span>
            <input autoFocus={isNew} value={l.name} maxLength={120} placeholder="e.g. Ananya Menon (bride's mother)" onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label className="field">
            <span>Phone / WhatsApp</span>
            <input value={l.phone ?? ""} inputMode="tel" maxLength={20} onChange={(e) => set({ phone: e.target.value || undefined })} />
          </label>
          <label className="field">
            <span>Email <small>(optional)</small></span>
            <input type="email" value={l.email ?? ""} maxLength={120} autoCapitalize="none" onChange={(e) => set({ email: e.target.value || undefined })} />
          </label>
          <label className="field">
            <span>Came from</span>
            <select value={l.source} onChange={(e) => set({ source: e.target.value })}>
              {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Occasion</span>
            <select value={l.eventType ?? ""} onChange={(e) => set({ eventType: e.target.value || null })}>
              <option value="">Not sure yet</option>
              {eventTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Date <small>(first date)</small></span>
            <input type="date" value={l.dates[0] ?? ""} onChange={(e) => set({ dates: e.target.value ? [e.target.value, ...l.dates.slice(1)].sort() : l.dates.slice(1) })} />
          </label>
          <label className="field">
            <span>Guests</span>
            <input type="number" min={0} step={10} value={l.guests ?? ""} onChange={(e) => set({ guests: e.target.value ? Math.max(0, Math.round(Number(e.target.value))) : null })} />
          </label>
          <div className="field">
            <span>Budget</span>
            <MoneyInput label="Budget" value={l.budget ?? null} onChange={(n) => set({ budget: n })} />
          </div>
          <label className="field field-wide">
            <span>Venue in mind</span>
            <input value={l.venue ?? ""} maxLength={120} onChange={(e) => set({ venue: e.target.value || undefined })} />
          </label>
          <label className="field">
            <span>Stage</span>
            <select value={l.stage} onChange={(e) => setStage(e.target.value as LeadStage)}>
              {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          {l.stage === "lost" ? (
            <label className="field">
              <span>Why it was lost</span>
              <input value={lostReason} maxLength={200} placeholder="e.g. went with a cheaper planner" onChange={(e) => { setLostReason(e.target.value); set({ lostReason: e.target.value || undefined }); }} />
            </label>
          ) : (
            <label className="field">
              <span>Next follow-up</span>
              <input type="date" value={l.followUp ?? ""} onChange={(e) => set({ followUp: e.target.value || undefined })} />
            </label>
          )}
          <label className="field field-wide">
            <span>Notes</span>
            <textarea rows={2} value={l.notes ?? ""} maxLength={2000} onChange={(e) => set({ notes: e.target.value || undefined })} />
          </label>
        </div>

        <section className="crm-log" aria-label="Activity">
          <h3 className="adv-h">Activity</h3>
          <div className="crm-log-add">
            <select aria-label="Kind" value={log.kind} onChange={(e) => setLog({ ...log, kind: e.target.value as LeadActivity["kind"] })}>
              {(["call", "meeting", "whatsapp", "note"] as const).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
            <input aria-label="What happened" placeholder="e.g. Called, wants a quote for 600 guests" value={log.text} maxLength={500} onChange={(e) => setLog({ ...log, text: e.target.value })} />
            <input aria-label="Follow up on" type="date" value={log.followUp} onChange={(e) => setLog({ ...log, followUp: e.target.value })} />
            <button type="button" className="btn-ghost btn-sm" disabled={!log.text.trim()} onClick={addLog}>Log</button>
          </div>
          {l.activity.length > 0 && (
            <ol className="crm-log-list">
              {[...l.activity].reverse().map((a, i) => (
                <li key={i}><strong>{KIND_LABEL[a.kind]}</strong> · {a.text}<small> · {a.by}, {formatDate(a.at.slice(0, 10))}</small></li>
              ))}
            </ol>
          )}
        </section>

        <div className="xi-actions">
          {!isNew && <button type="button" className="link-btn link-danger exp-remove" onClick={() => onDelete(lead)}>Delete</button>}
          {l.proposalId && proposalLabel ? (
            <button type="button" className="btn-ghost" onClick={() => { onSave(l); onOpenProposal(l.proposalId!); }}>Open {proposalLabel}</button>
          ) : (
            <button type="button" className="btn-ghost" disabled={!l.name.trim()} onClick={() => onCreateProposal(l)}>Create proposal</button>
          )}
          <button type="button" className="btn-primary" disabled={!l.name.trim()} onClick={() => onSave(l)}>Save</button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
