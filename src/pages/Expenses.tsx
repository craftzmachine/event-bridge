import { useEffect, useMemo, useRef, useState } from "react";
import type { Proposal } from "../types";
import { useConfig } from "../config/context";
import { uid } from "../state/proposals";
import {
  clearEvent,
  deleteReceived,
  getProof,
  getReceived,
  listAdvances,
  listExpenses,
  listReceived,
  listSent,
  putAdvances,
  putExpenses,
  putProof,
  putReceived,
  putSent,
  readCustomCategories,
  receivedFileId,
  useEventAdvances,
  useEventExpenses,
  writeCustomCategories,
} from "../state/expenses";
import { DEFAULT_CATEGORIES, eventWindow, filterExpenses, flagsOf, maskUpi, payerLabel, summarise, type Expense, type ExpenseFilter, type ReviewState } from "../lib/expenses";
import { advanceAlerts, advanceState, balanceOf, canManage, defaultSettleBy, settlement, STATE_LABEL, type Advance } from "../lib/advances";
import { applyReply, canReviewPack, dueText, handoverReceiptDoc, packData, packSummaryDoc, signOff, withReviews, type PackData, type ReceivedHandover, type SentHandover } from "../lib/handover";
import { eventDates, proposalTitle } from "../lib/proposal";
import { proposalStatus, statusLabel } from "../lib/status";
import { functionsOf } from "../lib/functions";
import { computeTotals } from "../lib/totals";
import { formatDate, formatINR, formatINRShort, todayISO } from "../lib/format";
import { saveBlob } from "../lib/files";
import AppearanceControls from "../components/AppearanceControls";
import ExpenseDialog, { type ExpenseEventInfo } from "../components/ExpenseDialog";
import AdvanceDialog from "../components/AdvanceDialog";
import ProofThumb from "../components/ProofThumb";

const FLAG_LABEL = { missingProof: "Proof missing", possibleDuplicate: "Check duplicate", queried: "Queried", rejected: "Rejected" } as const;

function useCategories() {
  const { brand } = useConfig();
  const [custom, setCustom] = useState(readCustomCategories);
  const team = brand.expenseCategories ?? [];
  const all = [...DEFAULT_CATEGORIES.filter((c) => c.id !== "other"), ...team, ...custom, DEFAULT_CATEGORIES.find((c) => c.id === "other")!].filter(
    (c, i, a) => a.findIndex((x) => x.id === c.id) === i,
  );
  const add = (label: string) => {
    const name = label.trim();
    const existing = all.find((c) => c.label.toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    const c = { id: `c-${uid()}`, label: name };
    const next = [...custom, c];
    writeCustomCategories(next);
    setCustom(next);
    return c.id;
  };
  return { all, add };
}

/**
 * #/expenses: events with expenses and handovers waiting for review; #/expenses/<proposalId>: one event's ledger;
 * #/expenses/review/<handoverId>: reviewing a handover received from a colleague.
 */
export default function Expenses({ path, proposals, account, onBack }: { path: string[]; proposals: Proposal[]; account: string; onBack: () => void }) {
  const { brand } = useConfig();
  const p = path[0] && path[0] !== "review" ? proposals.find((x) => x.id === path[0]) : undefined;
  return (
    <div className="exp-page">
      <header className="topbar">
        <button className="btn-ghost btn-sm" onClick={onBack} aria-label="Back">←<span className="hide-phone"> Back</span></button>
        <img className="topbar-logo" src={`${import.meta.env.BASE_URL}${brand.logo}`} alt={brand.company} />
        <div className="topbar-title">
          <span className="eyebrow">Event expenses</span>
          <strong>{p ? p.client.name || "Untitled client" : path[0] === "review" ? "Handover review" : "Expenses"}</strong>
        </div>
        <AppearanceControls />
      </header>
      <main className="exp-main">
        {path[0] === "review" && path[1] ? (
          <Review id={path[1]} account={account} />
        ) : p ? (
          <Ledger p={p} account={account} />
        ) : path[0] ? (
          <div className="empty-state"><p>That proposal isn't on this device. Expenses are kept on the device they were recorded on.</p><a className="btn-ghost" href="#/expenses">All events</a></div>
        ) : (
          <Index proposals={proposals} account={account} />
        )}
      </main>
    </div>
  );
}

// ---- #/expenses ----------------------------------------------------------------------------------------------

function Index({ proposals, account }: { proposals: Proposal[]; account: string }) {
  const { catalog } = useConfig();
  const [all, setAll] = useState<Expense[]>([]);
  const [received, setReceived] = useState<ReceivedHandover[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => {
    listExpenses().then(setAll).catch((e: Error) => setErr(e.message));
    listReceived().then(setReceived).catch(() => {});
    listAdvances().then(setAdvances).catch(() => {});
  };
  useEffect(refresh, []);

  async function receive(file: File | undefined) {
    if (!file) return;
    setErr("");
    setMsg("Checking the handover file…");
    try {
      const { readPack } = await import("../lib/handoverPack");
      const { pack, images, problems } = await readPack(file, account);
      const fatal = problems.find((x) => x.fatal);
      if (!pack || fatal) {
        setMsg("");
        return setErr(fatal?.text ?? "This file couldn't be used.");
      }
      for (const [fileId, blob] of images) await putProof(receivedFileId(pack.id, fileId), blob);
      const existing = received.find((r) => r.id === pack.id);
      await putReceived({ id: pack.id, pack, receivedAt: new Date().toISOString(), reviewer: account, reviews: existing?.reviews ?? {}, state: "reviewing" });
      setMsg(problems.length ? `Received, with ${problems.length} thing${problems.length === 1 ? "" : "s"} to note: ${problems.map((x) => x.text).join(" ")}` : "");
      location.hash = `/expenses/review/${pack.id}`;
    } catch (e) {
      setMsg("");
      setErr(`The handover couldn't be opened: ${(e as Error).message}`);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const byEvent = new Map<string, Expense[]>();
  for (const e of all) if (!e.removed) byEvent.set(e.eventId, [...(byEvent.get(e.eventId) ?? []), e]);
  // money still with staff on each event: what's left on its open advances
  const withStaff = new Map<string, number>();
  for (const a of advances) if (!a.closed) withStaff.set(a.eventId, (withStaff.get(a.eventId) ?? 0) + Math.max(balanceOf(a, all).left, 0));
  const outTotal = [...withStaff.values()].reduce((t, n) => t + n, 0);
  // accepted events first, then any with expenses, then the rest
  const events = [...proposals]
    .filter((x) => proposalStatus(x) !== "lost" || byEvent.has(x.id))
    .sort((a, b) => Number(byEvent.has(b.id)) - Number(byEvent.has(a.id)) || Number(proposalStatus(b) === "accepted") - Number(proposalStatus(a) === "accepted") || (eventDates(a)[0] ?? "9").localeCompare(eventDates(b)[0] ?? "9"));

  return (
    <>
      <div className="exp-head">
        <div>
          <h1>Event expenses</h1>
          <p className="lede">Record what's spent on each wedding with its proof, then hand it over to a colleague to check.</p>
          {outTotal > 0 && <p className="adv-out">{formatINR(outTotal)} is with staff on open advances, across {withStaff.size} event{withStaff.size === 1 ? "" : "s"}.</p>}
        </div>
        <div className="exp-head-tools">
          <button className="btn-ghost" onClick={() => fileRef.current?.click()}>Receive a handover</button>
          <input ref={fileRef} type="file" accept=".zip,application/zip" hidden onChange={(e) => receive(e.target.files?.[0])} />
        </div>
      </div>
      {msg && <p className="toast" role="status">{msg}</p>}
      {err && <p className="error" role="alert">{err}</p>}

      {received.length > 0 && (
        <section className="dash-card">
          <h2>Handovers received</h2>
          <ul className="exp-events">
            {received.map((r) => {
              const s = summarise(r.pack.expenses);
              return (
                <li key={r.id}>
                  <a href={`#/expenses/review/${r.id}`}>
                    <strong>{r.pack.event.client || "Untitled client"}</strong>
                    <span>{r.pack.event.title} · from {r.pack.from} · {s.count} expenses, {formatINR(s.total)}</span>
                  </a>
                  <span className={`exp-state is-${r.state}`}>{r.state === "reviewing" ? "To review" : r.state === "reconciled" ? "Reconciled" : "Returned"}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="dash-card">
        <h2>Events</h2>
        {events.length === 0 ? (
          <p className="dash-empty">No proposals on this device yet.</p>
        ) : (
          <ul className="exp-events">
            {events.map((x) => {
              const list = byEvent.get(x.id) ?? [];
              const s = summarise(list);
              return (
                <li key={x.id}>
                  <a href={`#/expenses/${x.id}`}>
                    <strong>{x.client.name || "Untitled client"}</strong>
                    <span>{proposalTitle(x, catalog) || "Occasion not set"} · {eventDates(x).length ? formatDate(eventDates(x)[0]) : "date to be confirmed"} · {statusLabel(proposalStatus(x))}</span>
                  </a>
                  <span className="exp-count">
                    {list.length ? `${s.count} · ${formatINRShort(s.total)}` : "No expenses"}
                    {s.missingProof > 0 && <small className="warn"> · {s.missingProof} without proof</small>}
                    {(withStaff.get(x.id) ?? 0) > 0 && <small> · {formatINRShort(withStaff.get(x.id)!)} with staff</small>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

// ---- #/expenses/<proposalId> -----------------------------------------------------------------------------------

function Ledger({ p, account }: { p: Proposal; account: string }) {
  const { catalog, brand } = useConfig();
  const { list, error, refresh, save } = useEventExpenses(p.id);
  const adv = useEventAdvances(p.id);
  const cats = useCategories();
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const [opened, setOpened] = useState<Advance | "new" | null>(null);
  const [filter, setFilter] = useState<ExpenseFilter>({});
  const [handover, setHandover] = useState(false);
  const event: ExpenseEventInfo = useMemo(
    () => ({ id: p.id, ref: p.ref, functions: functionsOf(p).map(({ id, label }) => ({ id, label })), window: eventWindow(eventDates(p)) }),
    [p],
  );
  const all = list ?? [];
  const s = summarise(all);
  const shown = filterExpenses(all, filter);
  const catLabel = (id: string) => cats.all.find((c) => c.id === id)?.label ?? id;
  const fnLabel = (id?: string) => event.functions.find((f) => f.id === id)?.label;
  const vendors = [...new Set(all.map((e) => e.vendor).filter(Boolean))].sort();
  const quoted = computeTotals(p, brand.gstPct).grandTotal;

  return (
    <>
      <div className="exp-head">
        <div>
          <h1>{p.client.name || "Untitled client"}</h1>
          <p className="lede">
            {proposalTitle(p, catalog) || "Occasion not set"} · {eventDates(p).length ? eventDates(p).map(formatDate).join(", ") : "date to be confirmed"} · quotation {p.ref}
          </p>
        </div>
        <div className="exp-head-tools">
          {canManage(brand.advanceManagers, account) && <button className="btn-ghost" onClick={() => setOpened("new")}>Give money</button>}
          <button className="btn-ghost" onClick={() => setHandover(true)} disabled={!s.count && !adv.list.length}>Prepare handover</button>
          <button className="btn-primary" onClick={() => setEditing("new")}>Add expense</button>
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      <section className="dash-kpis" aria-label="Spending so far">
        <div className="dash-kpi">
          <span>Spent so far</span>
          <strong>{formatINRShort(s.total)}</strong>
          <small>{s.count} expense{s.count === 1 ? "" : "s"} · the quote is {formatINRShort(quoted)} (for reference)</small>
        </div>
        <div className="dash-kpi">
          <span>Needs attention</span>
          <strong>{s.missingProof + s.duplicates + s.queried}</strong>
          <small>{s.missingProof} without proof · {s.duplicates} to check for duplicates · {s.queried} queried</small>
        </div>
        <div className="dash-kpi">
          <span>By category</span>
          <small className="exp-split">{s.byCategory.slice(0, 4).map((c) => `${catLabel(c.id)} ${formatINRShort(c.total)}`).join(" · ") || "—"}</small>
        </div>
        <div className="dash-kpi">
          <span>Paid by</span>
          <small className="exp-split">{s.byPayer.map((x) => `${x.label} ${formatINRShort(x.total)}`).join(" · ") || "—"}</small>
        </div>
      </section>

      {adv.list.length > 0 && <Advances list={adv.list} expenses={all} account={account} onOpen={setOpened} />}

      <div className="exp-filters">
        <input type="search" placeholder="Search vendor, item, UPI ref, amount" aria-label="Search expenses" value={filter.q ?? ""} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
        <select aria-label="Category" value={filter.category ?? ""} onChange={(e) => setFilter({ ...filter, category: e.target.value || undefined })}>
          <option value="">All categories</option>
          {cats.all.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select aria-label="Paid by" value={filter.payer ?? ""} onChange={(e) => setFilter({ ...filter, payer: e.target.value || undefined })}>
          <option value="">Anyone paid</option>
          {s.byPayer.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
        </select>
        <select aria-label="Show" value={filter.flag ?? ""} onChange={(e) => setFilter({ ...filter, flag: (e.target.value || undefined) as ExpenseFilter["flag"] })}>
          <option value="">All expenses</option>
          <option value="missingProof">Proof missing</option>
          <option value="possibleDuplicate">Possible duplicates</option>
          <option value="queried">Queried</option>
          <option value="removed">Removed</option>
        </select>
      </div>

      {list === null ? (
        <p className="hint" role="status">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="empty-state">
          <p>{all.length ? "No expenses match." : "No expenses yet. Add the first one with its GPay screenshot or a photo of the receipt."}</p>
        </div>
      ) : (
        <ul className="exp-list">
          {shown.map((e) => (
            <li key={e.id} className={e.removed ? "is-removed" : ""}>
              <button className="exp-row" onClick={() => setEditing(e)}>
                <ProofThumb fileId={e.proof?.fileId} alt="" />
                <span className="exp-row-main">
                  <strong>{e.vendor}</strong>
                  <span>{[e.description, catLabel(e.category), fnLabel(e.fn), payerLabel(e), maskUpi(e.payeeUpi)].filter(Boolean).join(" · ")}</span>
                  <span className="exp-flags">
                    {flagsOf(e, all).map((f) => <em key={f} className={`is-${f}`}>{FLAG_LABEL[f]}</em>)}
                    {e.review.state === "checked" && <em className="is-checked">Checked</em>}
                    {e.removed && <em>Removed: {e.removed.reason}</em>}
                  </span>
                </span>
                <span className="exp-row-amt">
                  <strong>{formatINR(e.amount)}</strong>
                  <small>{formatDate(e.paidOn)}{e.paidAt ? ` ${e.paidAt}` : ""}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <ExpenseDialog
          key={editing === "new" ? "new" : editing.id}
          event={event}
          expense={editing === "new" ? undefined : editing}
          all={all}
          advances={adv.list}
          account={account}
          categories={cats.all}
          vendors={vendors}
          onAddCategory={cats.add}
          onSave={save}
          onOpenOther={(id) => setEditing(all.find((x) => x.id === id) ?? null)}
          onClose={() => setEditing(null)}
        />
      )}
      {opened && (
        <AdvanceDialog
          key={opened === "new" ? "new" : opened.id}
          event={{ ...event, settleBy: defaultSettleBy(eventDates(p)) }}
          advance={opened === "new" ? undefined : opened}
          advances={adv.list}
          expenses={all}
          account={account}
          manager={canManage(brand.advanceManagers, account)}
          people={[...new Set([...adv.list.map((a) => a.staff), ...all.map((e) => e.recordedBy)].filter((x) => x && x !== account))].sort()}
          onSave={adv.save}
          onClose={() => setOpened(null)}
        />
      )}
      {handover && <Handover p={p} list={all} advances={adv.list} account={account} categories={cats.all} onDone={() => { refresh(); adv.refresh(); }} onClose={() => setHandover(false)} />}
    </>
  );
}

// ---- staff advances on the ledger ----------------------------------------------------------------------------------

function Advances({ list, expenses, account, onOpen }: { list: Advance[]; expenses: Expense[]; account: string; onOpen: (a: Advance) => void }) {
  const today = todayISO();
  const now = new Date();
  const mine = list.filter((a) => !a.closed && a.staff.toLowerCase() === account.toLowerCase());
  return (
    <section className="dash-card adv-card" aria-label="Staff advances">
      <h2>Staff advances</h2>
      {mine.map((a) => {
        const left = balanceOf(a, expenses).left;
        return (
          <button key={a.id} className="adv-mine" onClick={() => onOpen(a)}>
            <span>Your advance{mine.length > 1 ? ` for ${a.purpose}` : ""}</span>
            <strong className={left < 0 ? "is-over" : ""}>{left < 0 ? `${formatINR(-left)} over` : `${formatINR(left)} left`}</strong>
          </button>
        );
      })}
      <ul className="adv-rows">
        {list.map((a) => {
          const b = settlement(a, expenses);
          const st = advanceState(a, expenses, today);
          const alerts = advanceAlerts(a, expenses, now, today);
          return (
            <li key={a.id}>
              <button className="adv-row" onClick={() => onOpen(a)}>
                <span className="adv-row-main">
                  <strong>{a.staff}</strong>
                  <span>{a.purpose}{a.settleBy && !a.closed ? ` · settle by ${formatDate(a.settleBy)}` : ""}</span>
                  {alerts.length > 0 && <small className="hint warn">{alerts.join(" · ")}</small>}
                </span>
                <span className="adv-row-figs">
                  <span>Given {formatINRShort(b.given)} · spent {formatINRShort(b.spent)}{b.returned ? ` · returned ${formatINRShort(b.returned)}` : ""}</span>
                  <strong>{a.closed ? "Closed" : b.left < 0 ? `${formatINRShort(-b.left)} over` : `${formatINRShort(b.left)} left`}</strong>
                  <em className={`adv-state is-${st}`}>{st === "settled" || st === "closed" ? STATE_LABEL[st] : b.holds.length ? `${STATE_LABEL[st]} · settles after review` : `${STATE_LABEL[st]} · ${dueText(b.due, "them")}`}</em>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---- preparing a handover (the recorder) --------------------------------------------------------------------------

function Handover({ p, list, advances, account, categories, onDone, onClose }: { p: Proposal; list: Expense[]; advances: Advance[]; account: string; categories: { id: string; label: string }[]; onDone: () => void; onClose: () => void }) {
  const { catalog, brand } = useConfig();
  const ref = useRef<HTMLDialogElement>(null);
  const replyRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState<SentHandover[]>([]);
  const s = summarise(list);
  const live = list.filter((e) => !e.removed);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    listSent(p.id).then(setSent).catch(() => {});
  }, [p.id]);

  async function create() {
    setBusy("Making the handover file…");
    setMsg("");
    try {
      const id = `h-${uid()}`;
      const pack: PackData = packData({
        id,
        event: { id: p.id, ref: p.ref, client: p.client.name, title: proposalTitle(p, catalog) || "Event", dates: eventDates(p), venue: p.client.venue, functions: functionsOf(p).map(({ id, label }) => ({ id, label })) },
        from: account,
        note: note.trim(),
        categories,
        expenses: list,
        advances,
      });
      const images = new Map<string, Blob>();
      for (const e of live) if (e.proof) {
        const b = await getProof(e.proof.fileId);
        if (b) images.set(e.proof.fileId, b);
      }
      const [{ buildPack }, { renderPdf }] = await Promise.all([import("../lib/handoverPack"), import("../lib/exportPdf")]);
      const summary = await renderPdf(brand, (logo) => packSummaryDoc(pack, brand, logo));
      const zip = await buildPack(pack, images, summary);
      saveBlob(zip, `Expenses_${p.ref}_${todayISO()}.zip`);
      const h: SentHandover = { id, eventId: p.id, from: account, createdAt: pack.createdAt, expenseIds: live.map((e) => e.id), total: s.total, state: "sent" };
      await putSent(h);
      setSent((x) => [h, ...x]);
      setMsg("Downloaded. Send the file to the colleague who'll review it, then import their reply here.");
    } catch (e) {
      setMsg(`The handover file couldn't be made: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  async function importReply(file: File | undefined) {
    if (!file) return;
    try {
      const r = applyReply(JSON.parse(await file.text()), sent, list, advances);
      if ("error" in r) return setMsg(r.error);
      await putExpenses(r.expenses);
      await putAdvances(r.advances);
      await putSent(r.handover);
      setSent((x) => x.map((h) => (h.id === r.handover.id ? r.handover : h)));
      onDone();
      setMsg(r.handover.state === "reconciled" ? `Reconciled by ${r.handover.reviewer}.` : `Returned by ${r.handover.reviewer} with queries: they're marked on the expenses.`);
    } catch {
      setMsg("That file isn't a handover reply.");
    } finally {
      if (replyRef.current) replyRef.current.value = "";
    }
  }

  const last = [...sent].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return (
    <dialog ref={ref} className="venue-dialog xi" onClose={onClose} aria-labelledby="ho-title">
      <header className="xi-head">
        <h2 id="ho-title">Hand over the expenses</h2>
        <button className="vd-close" onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className="xi-body">
        <ul className="exp-checklist">
          <li className={s.missingProof ? "is-warn" : "is-ok"}>{s.missingProof ? `${s.missingProof} expense${s.missingProof === 1 ? " has" : "s have"} no proof` : "Every expense has proof"}</li>
          <li className={s.duplicates ? "is-warn" : "is-ok"}>{s.duplicates ? `${s.duplicates} may be duplicates: check them first` : "No possible duplicates"}</li>
          <li className={s.queried ? "is-warn" : "is-ok"}>{s.queried ? `${s.queried} still queried from the last review` : "No open queries"}</li>
          <li>{s.count} expenses, {formatINR(s.total)}</li>
          {advances.length > 0 && <li>{advances.length} staff advance{advances.length === 1 ? "" : "s"}, {advances.filter((a) => !a.closed).length} open: the reviewer sees what's due on each</li>}
        </ul>
        <div>
          <span className="field-label">To reimburse or settle</span>
          <ul className="exp-payers">
            {s.byPayer.map((x) => <li key={x.key}><span>{x.label}</span><strong>{formatINR(x.total)}</strong></li>)}
          </ul>
        </div>
        <label className="field">
          <span>Note for the reviewer</span>
          <textarea rows={3} value={note} maxLength={1000} placeholder="e.g. Two cash payments to the nadaswaram team have no receipt; Ravi paid the florist's balance." onChange={(e) => setNote(e.target.value)} />
        </label>
        <p className="hint">The file holds the payment details and screenshots. Send it only to the reviewer, and delete it once it's signed off.</p>
        {last && (
          <p className="notice">
            Last handover {formatDate(last.createdAt.slice(0, 10))}:{" "}
            {last.state === "sent" ? "waiting for the reply" : `${last.state === "reconciled" ? "reconciled" : "returned with queries"} by ${last.reviewer}, ${formatDate((last.signedAt ?? "").slice(0, 10))}`}.
          </p>
        )}
        {busy && <p className="hint" role="status">{busy}</p>}
        {msg && <p className="toast" role="status">{msg}</p>}
        <div className="xi-actions">
          {sent.length > 0 && <button className="btn-ghost" onClick={() => replyRef.current?.click()}>Import the reply</button>}
          <input ref={replyRef} type="file" accept=".json,application/json" hidden onChange={(e) => importReply(e.target.files?.[0])} />
          {last?.state === "reconciled" && (
            <button className="btn-ghost" onClick={async () => {
              if (!confirm("Remove this event's expenses and screenshots from this device? Keep the handover file as the record.")) return;
              await clearEvent(p.id);
              onDone();
              onClose();
            }}>Clear from this device</button>
          )}
          <button className="btn-primary" onClick={create} disabled={!!busy || (!live.length && !advances.length)}>Create handover file</button>
        </div>
      </div>
    </dialog>
  );
}

// ---- #/expenses/review/<id> (the reviewer) -------------------------------------------------------------------------

function Review({ id, account }: { id: string; account: string }) {
  const { brand } = useConfig();
  const [h, setH] = useState<ReceivedHandover | null | undefined>(undefined);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    getReceived(id).then((x) => setH(x ?? null)).catch(() => setH(null));
  }, [id]);
  if (h === undefined) return <p className="hint" role="status">Loading…</p>;
  if (h === null) return <div className="empty-state"><p>This handover isn't on this device.</p><a className="btn-ghost" href="#/expenses">All events</a></div>;

  const live = h.pack.expenses.filter((e) => !e.removed);
  const own = !canReviewPack(h.pack, account);
  const advances = h.pack.advances ?? [];
  const reviewed = withReviews(h);
  const cat = (c: string) => h.pack.categories.find((x) => x.id === c)?.label ?? c;
  // builds on the latest state, so quick successive decisions don't overwrite each other
  const decide = (eid: string, state: ReviewState, note?: string) =>
    setH((cur) => {
      if (!cur) return cur;
      const next = { ...cur, reviews: { ...cur.reviews, [eid]: { state, note } }, state: "reviewing" as const };
      void putReceived(next);
      return next;
    });
  const s = summarise(live);
  const done = live.filter((e) => (h.reviews[e.id]?.state ?? "open") !== "open").length;

  async function finish() {
    const r = signOff({ ...h!, reviewer: account });
    if (!r.ok) return setMsg(`${r.open} expense${r.open === 1 ? " is" : "s are"} still to review.`);
    const next: ReceivedHandover = { ...h!, reviewer: account, state: r.state, signedAt: r.reply.signedAt };
    await putReceived(next);
    setH(next);
    // the reply for the recorder, and the receipt for the files
    const blob = new Blob([JSON.stringify(r.reply, null, 2)], { type: "application/json" });
    saveBlob(blob, `Handover_reply_${h!.pack.event.ref}.json`);
    const { renderPdf } = await import("../lib/exportPdf");
    saveBlob(await renderPdf(brand, (logo) => handoverReceiptDoc(next, r.reply, brand, logo)), `Handover_${h!.pack.event.ref}_${r.state}.pdf`);
    setMsg(r.state === "reconciled" ? "Signed off as reconciled. Send the reply file back to the recorder; the receipt PDF is for your records." : "Returned with queries. Send the reply file back so the recorder can answer them.");
  }

  return (
    <>
      <div className="exp-head">
        <div>
          <h1>{h.pack.event.client || "Untitled client"}</h1>
          <p className="lede">{h.pack.event.title} · quotation {h.pack.event.ref} · handed over by {h.pack.from} on {formatDate(h.pack.createdAt.slice(0, 10))}</p>
        </div>
        <div className="exp-head-tools">
          <button className="btn-ghost" onClick={async () => { if (confirm("Delete this handover and its screenshots from this device?")) { await deleteReceived(h); location.hash = "/expenses"; } }}>Delete from this device</button>
          <button className="btn-primary" onClick={finish} disabled={own || h.state !== "reviewing"}>Sign off</button>
        </div>
      </div>
      {own && <p className="error" role="alert">You recorded or edited some of these expenses, or gave or held the money, so another team member has to review them.</p>}
      {h.pack.note && <p className="notice">Note from {h.pack.from}: {h.pack.note}</p>}
      {h.state !== "reviewing" && <p className="toast">{h.state === "reconciled" ? "Reconciled" : "Returned with queries"} by {h.reviewer} on {formatDate((h.signedAt ?? "").slice(0, 10))}.</p>}
      {msg && <p className="toast" role="status">{msg}</p>}
      <p className="hint">{done} of {live.length} reviewed · total {formatINR(s.total)}</p>
      {advances.length > 0 && (
        <section className="dash-card adv-card" aria-label="Staff advances">
          <h2>Staff advances, with your decisions so far</h2>
          <ul className="exp-payers">
            {advances.map((a) => {
              const st = settlement(a, reviewed);
              return (
                <li key={a.id}>
                  <span>{a.staff} · {a.purpose}<small className="hint"> · given {formatINRShort(st.given)}, accepted {formatINRShort(st.accepted)}, returned {formatINRShort(st.returned)}{st.reimbursed ? `, repaid ${formatINRShort(st.reimbursed)}` : ""}</small></span>
                  <strong>{a.closed ? "Closed" : dueText(st.due, a.staff)}</strong>
                </li>
              );
            })}
          </ul>
          <p className="hint">Rejected expenses, and ones without proof that you don't check, stay with the person who held the money.</p>
        </section>
      )}

      <ul className="exp-review">
        {live.map((e) => {
          const rv = h.reviews[e.id] ?? { state: "open" as const };
          return (
            <li key={e.id} className={`is-${rv.state}`}>
              <ProofThumb fileId={e.proof ? receivedFileId(h.id, e.proof.fileId) : undefined} alt={`Proof of payment to ${e.vendor}`} full />
              <div className="exp-review-body">
                <strong>{e.vendor} · {formatINR(e.amount)}</strong>
                <span>{formatDate(e.paidOn)}{e.paidAt ? ` ${e.paidAt}` : ""} · {cat(e.category)} · paid by {payerLabel(e)}</span>
                {e.description && <span>{e.description}</span>}
                <span>{e.upiRef ? `UPI ref ${e.upiRef}` : "No UPI ref"}{e.payeeUpi ? ` · to ${maskUpi(e.payeeUpi)}` : ""} · recorded by {e.recordedBy}</span>
                <span className="exp-flags">{flagsOf(e, h.pack.expenses).filter((f) => f === "missingProof" || f === "possibleDuplicate").map((f) => <em key={f} className={`is-${f}`}>{FLAG_LABEL[f]}</em>)}</span>
                <div className="seg" role="group" aria-label={`Review ${e.vendor}`}>
                  {(["checked", "queried", "rejected"] as const).map((st) => (
                    <button key={st} type="button" disabled={own || h.state !== "reviewing"} className={rv.state === st ? "is-on" : ""} aria-pressed={rv.state === st}
                      onClick={() => decide(e.id, st, st === "checked" ? undefined : rv.note)}>
                      {st === "checked" ? "Checked" : st === "queried" ? "Query" : "Reject"}
                    </button>
                  ))}
                </div>
                {(rv.state === "queried" || rv.state === "rejected") && (
                  <input aria-label="What's wrong" placeholder={rv.state === "queried" ? "Your question, e.g. which invoice is this?" : "Why, e.g. personal purchase"} value={rv.note ?? ""} maxLength={300}
                    disabled={h.state !== "reviewing"} onChange={(ev) => decide(e.id, rv.state, ev.target.value)} />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
