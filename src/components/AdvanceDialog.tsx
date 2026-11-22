import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { uid } from "../state/proposals";
import { cleanRef, METHODS, type Expense, type ExpenseMethod } from "../lib/expenses";
import {
  addMovement,
  advanceAlerts,
  advanceState,
  checkMovement,
  closeAdvance,
  expensesOf,
  MOVEMENT_LABEL,
  newAdvance,
  reopenAdvance,
  reverseMovement,
  settlement,
  STATE_LABEL,
  type Advance,
  type Movement,
  type MovementKind,
} from "../lib/advances";
import { dueText } from "../lib/handover";
import { formatDate, formatINR, todayISO } from "../lib/format";
import MoneyInput from "./MoneyInput";

export interface AdvanceEventInfo {
  id: string;
  ref: string;
  functions: { id: string; label: string }[];
  settleBy?: string;
}

const REVIEW_LABEL = { open: "Not reviewed", checked: "Checked", queried: "Queried", rejected: "Rejected" } as const;

/** A movement being typed: the money given, topped up, returned or repaid. */
function blankMove(kind: MovementKind): Movement {
  return { id: `m-${uid()}`, kind, amount: 0, on: todayISO(), method: kind === "returned" ? "cash" : "gpay", by: "", at: "" };
}

/**
 * Give money to a team member for an event (a new advance), or open one: its balance, settlement, the money moved
 * and the expenses paid from it. Managers record top-ups, returned cash and repayments, and close it.
 */
export default function AdvanceDialog({
  event,
  advance,
  advances,
  expenses,
  account,
  manager,
  people,
  onSave,
  onClose,
}: {
  event: AdvanceEventInfo;
  advance?: Advance;
  advances: Advance[];
  expenses: Expense[];
  account: string;
  /** may give money, record movements and close */
  manager: boolean;
  /** emails seen on this event, for the staff field */
  people: string[];
  onSave: (a: Advance) => Promise<void>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [a, setA] = useState<Advance | undefined>(advance);
  const [form, setForm] = useState({ staff: "", purpose: "", fn: "", settleBy: event.settleBy ?? "", limit: null as number | null });
  const [move, setMove] = useState<Movement | null>(advance ? null : blankMove("issued"));
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState<{ for: "reverse" | "close" | "reopen"; id?: string; text: string } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // no close() on cleanup: it fires onClose, and React's dev double-run would dismiss the dialog
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const today = todayISO();
  async function commit(next: Advance) {
    setBusy(true);
    try {
      await onSave(next);
      setA(next);
      setMove(null);
      setReason(null);
      setConfirmed(false);
      setErr("");
    } catch (x) {
      setErr(`It couldn't be saved: ${(x as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  // the advance a movement is checked against: the saved one, or the one being created
  const draft: Advance = a ?? newAdvance({ id: "draft", eventId: event.id, eventRef: event.ref, staff: form.staff, purpose: form.purpose, first: { ...blankMove("issued"), amount: 0 }, by: account });
  const problems = move ? checkMovement({ ...move, upiRef: cleanRef(move.upiRef) || undefined }, { ...draft, movements: a ? draft.movements : [] }, advances, expenses) : [];
  const blocks = problems.filter((p) => p.kind === "block");
  const warns = problems.filter((p) => p.kind === "warn");

  async function saveMove() {
    if (!move) return;
    const clean: Movement = { ...move, upiRef: cleanRef(move.upiRef) || undefined, note: move.note?.trim() || undefined };
    if (!a) {
      const staff = form.staff.trim().toLowerCase();
      if (!staff.includes("@")) return setErr("Enter the team member's sign-in email, so their expenses can be paid from it.");
      if (!form.purpose.trim()) return setErr("Say what the money is for.");
    }
    if (blocks.length) return setErr(blocks[0].text);
    if (warns.length && !confirmed) return setErr("Check the point above, then tick “These details are right”.");
    if (!a)
      return commit(
        newAdvance({
          id: `adv-${uid()}`,
          eventId: event.id,
          eventRef: event.ref,
          fn: form.fn || undefined,
          staff: form.staff.trim().toLowerCase(),
          purpose: form.purpose,
          limit: form.limit ?? undefined,
          settleBy: form.settleBy || undefined,
          first: clean,
          by: account,
        }),
      );
    return commit(addMovement(a, clean, account));
  }

  const s = a ? settlement(a, expenses) : undefined;
  const st = a ? advanceState(a, expenses, today) : undefined;
  const alerts = a ? advanceAlerts(a, expenses, new Date(), today) : [];
  const spent = a ? expensesOf(a, expenses) : [];
  const fnLabel = (id?: string) => event.functions.find((f) => f.id === id)?.label;
  const editable = manager && a && !a.closed;

  const moveForm = move && (
    <section className="adv-move" aria-label={MOVEMENT_LABEL[move.kind]}>
      {a && <h3>{move.kind === "topup" ? "Give more money" : move.kind === "returned" ? "Record cash returned" : "Repay the overspend"}</h3>}
      <div className="exp-grid">
        <div className="field">
          <span>Amount</span>
          <MoneyInput label="Amount" value={move.amount || null} onChange={(n) => { setConfirmed(false); setMove({ ...move, amount: n ?? 0 }); }} />
        </div>
        <label className="field">
          <span>Date</span>
          <input type="date" value={move.on} onChange={(ev) => setMove({ ...move, on: ev.target.value })} />
        </label>
        <label className="field">
          <span>{move.kind === "returned" ? "Returned as" : "Paid with"}</span>
          <select value={move.method} onChange={(ev) => setMove({ ...move, method: ev.target.value as ExpenseMethod })}>
            {METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        {move.method !== "cash" && (
          <label className="field">
            <span>UPI transaction ID / UTR <small>(optional)</small></span>
            <input value={move.upiRef ?? ""} inputMode="numeric" maxLength={30} onChange={(ev) => setMove({ ...move, upiRef: ev.target.value })} />
          </label>
        )}
        <label className="field field-wide">
          <span>Note <small>(optional)</small></span>
          <input value={move.note ?? ""} maxLength={200} placeholder={move.kind === "returned" ? "e.g. handed to Lakshmi at the office" : ""} onChange={(ev) => setMove({ ...move, note: ev.target.value })} />
        </label>
      </div>
      {problems.map((p, i) => <p key={i} className={p.kind === "block" ? "error" : "hint warn"}>{p.text}</p>)}
      {warns.length > 0 && !blocks.length && (
        <label className="check exp-confirm">
          <input type="checkbox" checked={confirmed} onChange={(ev) => setConfirmed(ev.target.checked)} />
          <span>These details are right.</span>
        </label>
      )}
    </section>
  );

  return createPortal(
    <dialog ref={ref} className="venue-dialog xi exp-dialog" onClose={onClose} aria-labelledby="adv-title">
      <header className="xi-head">
        <h2 id="adv-title">{a ? `${a.staff}'s advance` : "Give money to a team member"}</h2>
        <button className="vd-close" onClick={onClose} aria-label="Close" disabled={busy}>×</button>
      </header>
      <div className="xi-body">
        {!a ? (
          <>
            <p className="hint">Record money handed over for this event's purchases. Their expenses are then paid from it, and what's left is settled afterwards.</p>
            <div className="exp-grid">
              <label className="field">
                <span>Team member's sign-in email</span>
                <input value={form.staff} list="adv-people" type="email" autoCapitalize="none" spellCheck={false} maxLength={120} onChange={(ev) => setForm({ ...form, staff: ev.target.value })} />
                <datalist id="adv-people">{people.map((p) => <option key={p} value={p} />)}</datalist>
              </label>
              <label className="field">
                <span>For</span>
                <input value={form.purpose} maxLength={120} placeholder="e.g. Haldi flowers and puja items" onChange={(ev) => setForm({ ...form, purpose: ev.target.value })} />
              </label>
              {event.functions.length > 0 && (
                <label className="field">
                  <span>Function</span>
                  <select value={form.fn} onChange={(ev) => setForm({ ...form, fn: ev.target.value })}>
                    <option value="">Whole event</option>
                    {event.functions.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </label>
              )}
              <label className="field">
                <span>Settle by</span>
                <input type="date" value={form.settleBy} onChange={(ev) => setForm({ ...form, settleBy: ev.target.value })} />
              </label>
              <div className="field">
                <span>Limit for one expense <small>(optional)</small></span>
                <MoneyInput label="Limit for one expense" value={form.limit} onChange={(n) => setForm({ ...form, limit: n })} />
              </div>
            </div>
            {moveForm}
          </>
        ) : (
          <>
            <div className="adv-sum">
              <div className="adv-left">
                <span>Left with {a.staff}</span>
                <strong className={s!.left < 0 ? "is-over" : ""}>{s!.left < 0 ? `${formatINR(-s!.left)} over` : formatINR(s!.left)}</strong>
                <small>{a.purpose}{fnLabel(a.fn) ? ` · ${fnLabel(a.fn)}` : ""}{a.settleBy ? ` · settle by ${formatDate(a.settleBy)}` : ""}</small>
              </div>
              <dl className="adv-figs">
                <div><dt>Given</dt><dd>{formatINR(s!.given)}</dd></div>
                <div><dt>Spent</dt><dd>{formatINR(s!.spent)}</dd></div>
                <div><dt>Returned</dt><dd>{formatINR(s!.returned)}</dd></div>
                <div><dt>Repaid</dt><dd>{formatINR(s!.reimbursed)}</dd></div>
              </dl>
            </div>
            <p className={`adv-due is-${st}`}>
              <strong>{STATE_LABEL[st!]}</strong> · {a.closed ? `closed by ${a.closed.by}, ${formatDate(a.closed.at.slice(0, 10))}${a.closed.note ? `: ${a.closed.note}` : ""}` : `settlement: ${dueText(s!.due, a.staff)}`}
              {!a.closed && s!.holds.length > 0 && <small> (provisional: {s!.holds.join(", ")})</small>}
              {!a.closed && s!.notAccepted > 0 && <small> {formatINR(s!.notAccepted)} of spending is rejected or has no proof, so it isn't counted.</small>}
            </p>
            {alerts.length > 0 && <ul className="adv-alerts">{alerts.map((x) => <li key={x}>{x}</li>)}</ul>}

            {editable && !move && !reason && (
              <div className="adv-actions">
                <button className="btn-ghost btn-sm" onClick={() => setMove(blankMove("topup"))}>Give more</button>
                <button className="btn-ghost btn-sm" onClick={() => setMove({ ...blankMove("returned"), amount: Math.max(s!.due, 0) })}>Record cash returned</button>
                <button className="btn-ghost btn-sm" onClick={() => setMove({ ...blankMove("reimbursed"), amount: Math.max(-s!.due, 0) })}>Repay overspend</button>
                <button className="btn-ghost btn-sm" onClick={async () => {
                  const r = closeAdvance(a, expenses, account);
                  if ("error" in r) { setErr(r.error); setReason({ for: "close", text: "" }); } else await commit(r.advance);
                }}>Close</button>
              </div>
            )}
            {manager && a.closed && !reason && <div className="adv-actions"><button className="btn-ghost btn-sm" onClick={() => setReason({ for: "reopen", text: "" })}>Reopen…</button></div>}
            {moveForm}
            {reason && (
              <div className="exp-removing">
                <input autoFocus value={reason.text} maxLength={200}
                  placeholder={reason.for === "close" ? "Write off what's left because… e.g. cash lost at the venue" : reason.for === "reopen" ? "Why reopen? e.g. a late receipt" : "Why? e.g. entered twice"}
                  onChange={(ev) => setReason({ ...reason, text: ev.target.value })} />
                <button className="btn-ghost btn-sm" disabled={!reason.text.trim() || busy} onClick={async () => {
                  if (reason.for === "reverse") return commit(reverseMovement(a, reason.id!, account, reason.text.trim()));
                  if (reason.for === "reopen") return commit(reopenAdvance(a, account, reason.text));
                  const r = closeAdvance(a, expenses, account, reason.text);
                  if ("error" in r) return setErr(r.error);
                  return commit(r.advance);
                }}>{reason.for === "close" ? "Write off and close" : reason.for === "reopen" ? "Reopen" : "Reverse"}</button>
                <button className="link-btn" onClick={() => { setReason(null); setErr(""); }}>Cancel</button>
              </div>
            )}

            <section>
              <h3 className="adv-h">Money moved</h3>
              <ul className="adv-moves">
                {a.movements.map((m) => (
                  <li key={m.id} className={m.reversed ? "is-reversed" : ""}>
                    <span>
                      <strong>{MOVEMENT_LABEL[m.kind]}</strong> {formatDate(m.on)} · {METHODS.find((x) => x.id === m.method)?.label ?? m.method}{m.upiRef ? ` · ${m.upiRef}` : ""} · by {m.by}
                      {m.note && <small> · {m.note}</small>}
                      {m.reversed && <small> · reversed by {m.reversed.by}: {m.reversed.reason}</small>}
                    </span>
                    <span className="adv-amt">
                      {m.kind === "returned" ? "−" : "+"}{formatINR(m.amount)}
                      {editable && !m.reversed && !reason && <button className="link-btn" onClick={() => setReason({ for: "reverse", id: m.id, text: "" })}>Reverse</button>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="adv-h">Paid from it ({spent.length})</h3>
              {spent.length === 0 ? (
                <p className="hint">Nothing yet. When {a.staff} adds an expense, it's paid from this advance by default.</p>
              ) : (
                <ul className="adv-moves">
                  {spent.map((e) => (
                    <li key={e.id} className={e.review.state === "rejected" ? "is-reversed" : ""}>
                      <span>{e.vendor} · {formatDate(e.paidOn)}<small> · {e.proof ? REVIEW_LABEL[e.review.state] : `no proof · ${REVIEW_LABEL[e.review.state]}`}</small></span>
                      <span className="adv-amt">{formatINR(e.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <details className="exp-history">
              <summary>History ({a.history.length})</summary>
              <ol>
                {a.history.map((h, i) => (
                  <li key={i}><strong>{h.action}</strong> by {h.by}, {formatDate(h.at.slice(0, 10))} {h.at.slice(11, 16)}{h.note && <span> · {h.note}</span>}</li>
                ))}
              </ol>
            </details>
            {!manager && <p className="hint">Only a manager can record money given or returned, and close the advance.</p>}
          </>
        )}

        {err && <p className="error" role="alert">{err}</p>}
        <div className="xi-actions">
          {move ? (
            <>
              <button className="btn-ghost" onClick={() => (a ? (setMove(null), setErr("")) : onClose())} disabled={busy}>Cancel</button>
              <button className="btn-primary" onClick={saveMove} disabled={busy}>{a ? "Save" : "Give money"}</button>
            </>
          ) : (
            <button className="btn-ghost" onClick={onClose} disabled={busy}>Done</button>
          )}
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
