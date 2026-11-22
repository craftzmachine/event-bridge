import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { createPortal } from "react-dom";
import { uid } from "../state/proposals";
import { putProof } from "../state/expenses";
import { prepareProof } from "../lib/proofImage";
import { checkExpense, cleanRef, maskUpi, METHODS, PAYERS, removeExpense, restoreExpense, saveExpense, type Expense, type Problem } from "../lib/expenses";
import { balanceOf, spendWarning, type Advance } from "../lib/advances";
import { formatDate, formatINRShort, todayISO } from "../lib/format";
import MoneyInput from "./MoneyInput";
import ProofThumb from "./ProofThumb";

export interface ExpenseEventInfo {
  id: string;
  ref: string;
  functions: { id: string; label: string }[];
  window?: { from: string; to: string };
}

/** A new expense: paid from the account's own open advance when they hold one, else by them. */
const blank = (ev: ExpenseEventInfo, by: string, advances: Advance[] = []): Expense => {
  const own = advances.find((a) => !a.closed && a.staff.toLowerCase() === by.toLowerCase());
  return {
    ...base(ev, by),
    payer: own ? { kind: "advance", name: own.staff } : { kind: "self", name: by },
    advanceId: own?.id,
  };
};

const base = (ev: ExpenseEventInfo, by: string): Expense => ({
  id: `x-${uid()}`,
  eventId: ev.id,
  eventRef: ev.ref,
  amount: 0,
  paidOn: todayISO(),
  category: "purchases",
  vendor: "",
  payer: { kind: "self", name: by },
  method: "gpay",
  description: "",
  recordedAt: "",
  recordedBy: by,
  history: [],
  review: { state: "open" },
});

/**
 * Add or edit an expense: the proof first (camera, screenshot or paste), then the details. Safeguards run as you
 * type: a UPI reference already recorded blocks the save; a repeated screenshot, a same-day same-amount payment,
 * a large amount or a date outside the event ask you to confirm.
 */
export default function ExpenseDialog({
  event,
  expense,
  all,
  advances = [],
  account,
  categories,
  vendors,
  onAddCategory,
  onSave,
  onOpenOther,
  onClose,
}: {
  event: ExpenseEventInfo;
  expense?: Expense;
  all: Expense[];
  /** the event's staff advances: open ones can pay for an expense */
  advances?: Advance[];
  account: string;
  categories: { id: string; label: string }[];
  vendors: string[];
  onAddCategory: (label: string) => string;
  onSave: (e: Expense) => Promise<void>;
  onOpenOther: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // a new expense starts in the first category offered (the company ledger has no "Purchases")
  const [e, setE] = useState<Expense>(() => {
    if (expense) return expense;
    const b = blank(event, account, advances);
    return categories.some((c) => c.id === b.category) ? b : { ...b, category: categories[0]?.id ?? "other" };
  });
  const [proofBlob, setProofBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [newCat, setNewCat] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const set = (patch: Partial<Expense>) => {
    setConfirmed(false);
    setE((cur) => ({ ...cur, ...patch }));
  };

  // no close() on cleanup: it fires onClose, and React's dev double-run would dismiss the dialog
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  async function attach(file: File | null | undefined, takenFrom: "camera" | "upload" | "paste") {
    if (!file) return;
    setBusy("Preparing the image…");
    setErr("");
    try {
      const { blob, sha256, type } = await prepareProof(file);
      const fileId = `p-${uid()}`;
      setProofBlob(blob);
      set({ proof: { fileId, name: file.name || `${takenFrom}.webp`, type, size: blob.size, sha256, takenFrom } });
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy("");
    }
  }
  const onPaste = (ev: ClipboardEvent) => {
    const item = [...ev.clipboardData.items].find((i) => i.type.startsWith("image/"));
    if (item) {
      ev.preventDefault();
      void attach(item.getAsFile(), "paste");
    }
  };

  // open advances, plus a closed one this expense already uses
  const usable = advances.filter((a) => !a.closed || a.id === e.advanceId);
  const others = all.filter((x) => x.id !== e.id);
  const advLabel = (a: Advance) =>
    `From ${a.staff.toLowerCase() === account.toLowerCase() ? "my" : `${a.staff}'s`} advance (${formatINRShort(balanceOf(a, others).left)} left)${a.closed ? ", closed" : ""}`;
  const chosen = e.payer.kind === "advance" ? usable.find((a) => a.id === e.advanceId) : undefined;
  const overspend = chosen ? spendWarning(e, chosen, all) : undefined;
  const problems: Problem[] = [
    ...checkExpense({ ...e, upiRef: cleanRef(e.upiRef) || undefined }, all, event.window),
    ...(overspend ? [{ kind: "warn" as const, field: "payer", text: overspend }] : []),
    ...(e.payer.kind === "advance" && !e.advanceId ? [{ kind: "block" as const, field: "payer", text: "Choose the advance it was paid from." }] : []),
  ];
  const blocks = problems.filter((p) => p.kind === "block");
  const warns = problems.filter((p) => p.kind === "warn");

  async function save(again: boolean) {
    if (blocks.length) return setErr(blocks[0].text);
    if (warns.length && !confirmed) return setErr("Check the points above, then tick “These details are right” to save.");
    setBusy("Saving…");
    try {
      if (proofBlob && e.proof) await putProof(e.proof.fileId, proofBlob);
      const clean: Expense = { ...e, upiRef: cleanRef(e.upiRef) || undefined, vendor: e.vendor.trim(), description: e.description.trim(), payeeUpi: e.payeeUpi?.trim() || undefined };
      await onSave(saveExpense(clean, expense, account));
      if (again) {
        setE({ ...base(event, account), category: e.category, payer: e.payer, advanceId: e.advanceId, method: e.method, fn: e.fn, paidOn: e.paidOn });
        setProofBlob(null);
        setConfirmed(false);
        setErr("");
      } else onClose();
    } catch (x) {
      setErr(`It couldn't be saved: ${(x as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  const fieldProblems = (field: string) => problems.filter((p) => p.field === field);
  const note = (field: string) =>
    fieldProblems(field).map((p, i) => (
      <small key={i} className={p.kind === "block" ? "error" : "hint warn"}>
        {p.text}
        {p.otherId && (
          <button type="button" className="link-btn" onClick={() => onOpenOther(p.otherId!)}>Open it</button>
        )}
      </small>
    ));

  return createPortal(
    <dialog ref={ref} className="venue-dialog xi exp-dialog" onClose={onClose} onCancel={(ev) => busy && ev.preventDefault()} aria-labelledby="exp-title" onPaste={onPaste}>
      <header className="xi-head">
        <h2 id="exp-title">{expense ? (expense.removed ? "Removed expense" : "Edit expense") : "Add an expense"}</h2>
        <button className="vd-close" onClick={onClose} aria-label="Close" disabled={!!busy}>×</button>
      </header>
      <div className="xi-body">
        <section className="exp-proof" aria-label="Proof">
          {e.proof ? (
            <ProofThumb fileId={proofBlob ? undefined : e.proof.fileId} blob={proofBlob ?? undefined} alt={`Proof of payment to ${e.vendor || "the vendor"}`} full />
          ) : (
            <p className="hint">Attach the GPay screenshot or a photo of the receipt. You can also paste a screenshot here (Ctrl+V).</p>
          )}
          <div className="exp-proof-tools">
            <button type="button" className="btn-ghost btn-sm" onClick={() => camRef.current?.click()} disabled={!!busy}>Take photo</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => fileRef.current?.click()} disabled={!!busy}>{e.proof ? "Replace screenshot" : "Choose screenshot"}</button>
            {e.proof && <button type="button" className="link-btn" onClick={() => { setProofBlob(null); set({ proof: undefined }); }}>Remove proof</button>}
            <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(ev) => attach(ev.target.files?.[0], "camera")} />
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(ev) => attach(ev.target.files?.[0], "upload")} />
          </div>
          {note("proof")}
        </section>

        <div className="exp-grid">
          <div className="field">
            <span>Amount</span>
            <MoneyInput label="Amount paid" value={e.amount || null} onChange={(n) => set({ amount: n ?? 0 })} />
            {note("amount")}
          </div>
          <label className="field">
            <span>Paid on</span>
            <input type="date" value={e.paidOn} onChange={(ev) => set({ paidOn: ev.target.value })} />
            {note("paidOn")}
          </label>
          <label className="field">
            <span>Time <small>(optional)</small></span>
            <input type="time" value={e.paidAt ?? ""} onChange={(ev) => set({ paidAt: ev.target.value || undefined })} />
          </label>
          <label className="field">
            <span>Paid to</span>
            <input value={e.vendor} list="exp-vendors" maxLength={120} placeholder="e.g. Chalai flower market" onChange={(ev) => set({ vendor: ev.target.value })} />
            <datalist id="exp-vendors">{vendors.map((v) => <option key={v} value={v} />)}</datalist>
            {note("vendor")}
          </label>
          <label className="field field-wide">
            <span>What it was for</span>
            <input value={e.description} maxLength={200} placeholder="e.g. 40 kg jasmine for the mandap" onChange={(ev) => set({ description: ev.target.value })} />
          </label>
          <label className="field">
            <span>Category</span>
            {newCat === null ? (
              <select value={e.category} onChange={(ev) => (ev.target.value === "__new" ? setNewCat("") : set({ category: ev.target.value }))}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                <option value="__new">+ New category…</option>
              </select>
            ) : (
              <span className="exp-newcat">
                <input autoFocus value={newCat} maxLength={40} placeholder="e.g. Return gifts" onChange={(ev) => setNewCat(ev.target.value)} />
                <button type="button" className="btn-ghost btn-sm" disabled={!newCat.trim()} onClick={() => { set({ category: onAddCategory(newCat) }); setNewCat(null); }}>Add</button>
                <button type="button" className="link-btn" onClick={() => setNewCat(null)}>Cancel</button>
              </span>
            )}
          </label>
          {event.functions.length > 0 && (
            <label className="field">
              <span>Function</span>
              <select value={e.fn ?? ""} onChange={(ev) => set({ fn: ev.target.value || undefined })}>
                <option value="">Whole event</option>
                {event.functions.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </label>
          )}
          <label className="field">
            <span>Who paid</span>
            <select value={e.payer.kind === "advance" ? `adv:${e.advanceId ?? ""}` : e.payer.kind} onChange={(ev) => {
              const v = ev.target.value;
              const a = v.startsWith("adv:") ? usable.find((x) => x.id === v.slice(4)) : undefined;
              if (a) return set({ payer: { kind: "advance", name: a.staff }, advanceId: a.id });
              const kind = v as Expense["payer"]["kind"];
              set({ payer: { kind, name: kind === "self" ? account : kind === "company" ? "" : e.payer.kind === "colleague" ? e.payer.name : "" }, advanceId: undefined });
            }}>
              {usable.map((a) => <option key={a.id} value={`adv:${a.id}`}>{advLabel(a)}</option>)}
              {e.payer.kind === "advance" && !chosen && <option value={`adv:${e.advanceId ?? ""}`}>An advance not on this device</option>}
              {PAYERS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
            {note("payer")}
          </label>
          {e.payer.kind === "colleague" && (
            <label className="field">
              <span>Colleague's name</span>
              <input value={e.payer.name} maxLength={80} onChange={(ev) => set({ payer: { kind: "colleague", name: ev.target.value } })} />
            </label>
          )}
          <label className="field">
            <span>Paid with</span>
            <select value={e.method} onChange={(ev) => set({ method: ev.target.value as Expense["method"] })}>
              {METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          {(e.method === "gpay" || e.method === "upi" || e.method === "bank") && (
            <>
              <label className="field">
                <span>UPI transaction ID / UTR</span>
                <input value={e.upiRef ?? ""} inputMode="numeric" maxLength={30} placeholder="12 digits, from the screenshot" onChange={(ev) => set({ upiRef: ev.target.value })} />
                {note("upiRef")}
              </label>
              <label className="field">
                <span>Paid to UPI ID <small>(optional)</small></span>
                <input value={e.payeeUpi ?? ""} maxLength={80} placeholder="name@bank" autoCapitalize="none" spellCheck={false} onChange={(ev) => set({ payeeUpi: ev.target.value })} />
                {e.payeeUpi && <small className="hint">Shown to others as {maskUpi(e.payeeUpi)}.</small>}
              </label>
            </>
          )}
        </div>

        {warns.length > 0 && !blocks.length && (
          <label className="check exp-confirm">
            <input type="checkbox" checked={confirmed} onChange={(ev) => setConfirmed(ev.target.checked)} />
            <span>These details are right; save anyway.</span>
          </label>
        )}
        {busy && <p className="hint" role="status">{busy}</p>}
        {err && <p className="error" role="alert">{err}</p>}

        {expense && expense.history.length > 0 && (
          <details className="exp-history">
            <summary>History ({expense.history.length})</summary>
            <ol>
              {expense.history.map((h, i) => (
                <li key={i}>
                  <strong>{h.action}</strong> by {h.by}, {formatDate(h.at.slice(0, 10))} {h.at.slice(11, 16)}
                  {h.changes && <span> · {Object.entries(h.changes).map(([k, [a, b]]) => `${k}: ${fmt(a)} → ${fmt(b)}`).join("; ")}</span>}
                  {h.note && <span> · {h.note}</span>}
                </li>
              ))}
            </ol>
          </details>
        )}

        <div className="xi-actions">
          {expense && !expense.removed && removing === null && (
            <button type="button" className="link-btn link-danger exp-remove" onClick={() => setRemoving("")}>Remove…</button>
          )}
          {removing !== null && (
            <span className="exp-removing">
              <input autoFocus value={removing} maxLength={120} placeholder="Why? e.g. entered twice" onChange={(ev) => setRemoving(ev.target.value)} />
              <button type="button" className="btn-ghost btn-sm" disabled={!removing.trim()} onClick={async () => { await onSave(removeExpense(expense!, account, removing.trim())); onClose(); }}>Remove</button>
            </span>
          )}
          {expense?.removed ? (
            <button type="button" className="btn-primary" onClick={async () => { await onSave(restoreExpense(expense, account)); onClose(); }}>Restore</button>
          ) : (
            <>
              <button type="button" className="btn-ghost" onClick={onClose} disabled={!!busy}>Cancel</button>
              {!expense && <button type="button" className="btn-ghost" onClick={() => save(true)} disabled={!!busy}>Save &amp; add another</button>}
              <button type="button" className="btn-primary" onClick={() => save(false)} disabled={!!busy}>Save</button>
            </>
          )}
        </div>
      </div>
    </dialog>,
    document.body,
  );
}

const fmt = (x: unknown) => (x === null || x === undefined || x === "" ? "—" : typeof x === "object" ? (x as { name?: string; kind?: string }).name || (x as { kind?: string }).kind || "…" : String(x).slice(0, 24));
