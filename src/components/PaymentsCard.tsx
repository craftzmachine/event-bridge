import { useState } from "react";
import type { Milestone, Payment, Proposal } from "../types";
import { useConfig } from "../config/context";
import { uid } from "../state/proposals";
import { emptyPayment, METHODS, nextReceiptNo, planFor, schedule, type MilestoneState } from "../lib/payments";
import { formatDate, formatINR, todayISO } from "../lib/format";
import MoneyInput from "./MoneyInput";

type Set = (patch: Partial<Proposal> | ((cur: Proposal) => Partial<Proposal>)) => void;

const STATE: Record<MilestoneState, string> = { paid: "Paid", part: "Part paid", due: "Due soon", overdue: "Overdue", upcoming: "Upcoming" };

/**
 * Review step: the payment plan (as a share of the total including GST), payments received, and a receipt for
 * each. The plan starts from the standard terms and can be changed for this proposal.
 */
export default function PaymentsCard({ p, set }: { p: Proposal; set: Set }) {
  const { catalog, brand } = useConfig();
  const s = schedule(p, brand);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Omit<Payment, "id"> | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const received = p.payments?.received ?? [];

  const savePlan = (plan: Milestone[]) => set((cur) => ({ payments: { received: cur.payments?.received ?? [], plan } }));
  const editMilestone = (id: string, patch: Partial<Milestone>) => savePlan(planFor(p, brand).map((m) => (m.id === id ? { ...m, ...patch } : m)));

  function record() {
    if (!form) return;
    if (!(form.amount > 0)) return setErr("Enter the amount received.");
    if (!form.date) return setErr("Enter the date it was received.");
    setErr("");
    const pay: Payment = { ...form, id: uid(), receiptNo: nextReceiptNo(p), reference: form.reference?.trim() || undefined, note: form.note?.trim() || undefined };
    set((cur) => ({ payments: { plan: cur.payments?.plan, received: [...(cur.payments?.received ?? []), pay] } }));
    setForm(null);
  }

  async function receipt(pay: Payment) {
    setBusy(pay.id);
    try {
      await (await import("../lib/exportReceipt")).downloadReceipt(p, pay, catalog, brand);
    } catch (e) {
      setErr(`The receipt couldn't be made: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="side-card payments">
      <h3>Payments</h3>
      <p className="hint">Of the total including GST, {formatINR(s.total)}.</p>
      <ol className="pay-plan">
        {s.milestones.map((m) => (
          <li key={m.id} className={`is-${m.state}`}>
            {editing ? (
              <div className="pay-edit">
                <input aria-label="Milestone" value={m.label} onChange={(e) => editMilestone(m.id, { label: e.target.value })} />
                <label className="pay-pct"><input type="number" min={0} max={100} step={1} aria-label={`${m.label} percentage`} value={m.pct}
                  onChange={(e) => editMilestone(m.id, { pct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />%</label>
                <input type="date" aria-label={`${m.label} due date`} value={m.due} onChange={(e) => editMilestone(m.id, { due: e.target.value })} />
              </div>
            ) : (
              <div className="pay-row">
                <span className="pay-label">{m.label} <small>{m.pct}% · {m.due ? `due ${formatDate(m.due)}` : m.id === "m1" ? "on booking" : "date to be set"}</small></span>
                <span className="pay-amt">{formatINR(m.amount)}</span>
                <span className="pay-state">{STATE[m.state]}{m.state === "part" || (m.state === "overdue" && m.paid) ? ` · ${formatINR(m.paid)} paid` : ""}</span>
              </div>
            )}
          </li>
        ))}
      </ol>
      {s.planOff && <p className="notice" role="status">The milestones add up to {planFor(p, brand).reduce((t, m) => t + m.pct, 0)}%, not 100%; the last one takes the difference.</p>}
      <div className="pay-tools">
        <button className="link-btn" onClick={() => setEditing((e) => !e)}>{editing ? "Done" : "Change the plan"}</button>
        {editing && (
          <>
            <button className="link-btn" onClick={() => savePlan([...planFor(p, brand), { id: `m-${uid()}`, label: "Instalment", pct: 0, due: "" }])}>+ Add a milestone</button>
            <button className="link-btn" onClick={() => set((cur) => ({ payments: { received: cur.payments?.received ?? [] } }))}>Reset to standard</button>
          </>
        )}
      </div>

      <div className="pay-totals">
        <span>Received {formatINR(s.received)}</span>
        <strong>{s.balance >= 0 ? `Balance ${formatINR(s.balance)}` : `Overpaid by ${formatINR(-s.balance)}`}</strong>
      </div>
      {received.length > 0 && (
        <ul className="pay-received">
          {received.map((x) => (
            <li key={x.id}>
              <span>
                {formatDate(x.date)} · {METHODS.find((m) => m.id === x.method)?.label}
                {x.reference ? ` · ${x.reference}` : ""}
                <small>{x.receiptNo}</small>
              </span>
              <strong>{formatINR(x.amount)}</strong>
              <button className="link-btn" disabled={busy === x.id} onClick={() => receipt(x)}>{busy === x.id ? "Preparing…" : "Receipt"}</button>
              <button className="icon-btn icon-danger" aria-label={`Remove the payment of ${formatINR(x.amount)}`}
                onClick={() => confirm(`Remove the payment of ${formatINR(x.amount)} on ${formatDate(x.date)}?`) && set((cur) => ({ payments: { plan: cur.payments?.plan, received: (cur.payments?.received ?? []).filter((y) => y.id !== x.id) } }))}>×</button>
            </li>
          ))}
        </ul>
      )}

      {form ? (
        <div className="pay-form">
          <div className="pay-form-grid">
            <label className="field"><span>Date received</span><input type="date" max={todayISO()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
            <div className="field"><span>Amount</span><MoneyInput label="Amount received" value={form.amount} onChange={(n) => setForm({ ...form, amount: n ?? 0 })} /></div>
            <label className="field"><span>Method</span>
              <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as Payment["method"] })}>
                {METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <label className="field"><span>Reference</span><input value={form.reference ?? ""} placeholder="UTR / cheque no." onChange={(e) => setForm({ ...form, reference: e.target.value })} /></label>
          </div>
          <label className="field"><span>Note</span><input value={form.note ?? ""} placeholder="Optional" onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <div className="pay-form-actions">
            <button className="btn-ghost btn-sm" onClick={() => { setForm(null); setErr(""); }}>Cancel</button>
            <button className="btn-primary btn-sm" onClick={record}>Save payment</button>
          </div>
        </div>
      ) : (
        <button className="btn-ghost btn-sm" disabled={!p.lines.length} onClick={() => setForm(emptyPayment(p, brand))}>Record a payment</button>
      )}
      {err && <p className="error" role="alert">{err}</p>}
    </div>
  );
}
