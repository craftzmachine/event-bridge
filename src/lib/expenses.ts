// Event expenses: the record, the safeguards (duplicates, missing proof, out-of-window dates), summaries and the
// audit trail. Pure, so every rule is tested in Node. Storage is in src/state/expenses.ts.

/** "advance": paid from money given to a team member (`advanceId`, with `name` their email) */
export type PayerKind = "self" | "colleague" | "company" | "advance";
export type ExpenseMethod = "gpay" | "upi" | "cash" | "card" | "bank";
export type ReviewState = "open" | "checked" | "queried" | "rejected";

export interface ExpenseProof {
  /** key of the image in the device store */
  fileId: string;
  name: string;
  type: string;
  size: number;
  /** SHA-256 of the stored image, hex: finds the same screenshot attached twice, and checks a handover pack */
  sha256: string;
  takenFrom: "camera" | "upload" | "paste";
}

export interface HistoryEntry {
  at: string;
  by: string;
  action: "created" | "edited" | "removed" | "restored" | "reviewed";
  /** field → [before, after], for edits */
  changes?: Record<string, [unknown, unknown]>;
  note?: string;
}

export interface Expense {
  id: string;
  /** the proposal it was spent on, and its quotation ref */
  eventId: string;
  eventRef: string;
  /** the proposal's function (Haldi, Reception…), if any */
  fn?: string;
  amount: number;
  /** YYYY-MM-DD, and HH:MM when known */
  paidOn: string;
  paidAt?: string;
  category: string;
  vendor: string;
  /** the recipient's UPI ID, shown masked */
  payeeUpi?: string;
  payer: { kind: PayerKind; name: string };
  /** the staff advance it was paid from, when payer.kind is "advance" */
  advanceId?: string;
  method: ExpenseMethod;
  /** UPI transaction ID / UTR: unique within an event */
  upiRef?: string;
  description: string;
  proof?: ExpenseProof;
  recordedAt: string;
  recordedBy: string;
  history: HistoryEntry[];
  review: { state: ReviewState; note?: string; by?: string; at?: string };
  removed?: { by: string; at: string; reason: string };
}

export const DEFAULT_CATEGORIES = [
  { id: "purchases", label: "Purchases" },
  { id: "ceremonial", label: "Ceremonial" },
  { id: "travel", label: "Travel" },
  { id: "food", label: "Food & refreshments" },
  { id: "decor", label: "Décor & flowers" },
  { id: "vendor", label: "Vendor payment" },
  { id: "staff", label: "Staff & labour" },
  { id: "other", label: "Other" },
];

export const METHODS: { id: ExpenseMethod; label: string }[] = [
  { id: "gpay", label: "Google Pay (UPI)" },
  { id: "upi", label: "Other UPI app" },
  { id: "cash", label: "Cash" },
  { id: "card", label: "Card" },
  { id: "bank", label: "Bank transfer" },
];

export const PAYERS: { id: PayerKind; label: string }[] = [
  { id: "self", label: "I paid" },
  { id: "colleague", label: "A colleague paid" },
  { id: "company", label: "Company account" },
];

/** Who paid, as shown on the ledger and in the handover. */
export function payerLabel(e: Pick<Expense, "payer">): string {
  if (e.payer.kind === "company") return "Company account";
  if (e.payer.kind === "advance") return `${e.payer.name || "Staff"}'s advance`;
  return e.payer.name || "Unnamed";
}

/** above this, saving asks "is this right?" */
export const LARGE_AMOUNT = 100000;

const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string | undefined) => (s ?? "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");

/** "ananya.menon@okaxis" → "an…on@okaxis"; short IDs keep only their first letter. */
export function maskUpi(id: string | undefined): string {
  if (!id) return "";
  const [name, bank] = id.split("@");
  if (!bank) return id.length > 4 ? `${id.slice(0, 2)}…${id.slice(-2)}` : id;
  const shown = name.length > 4 ? `${name.slice(0, 2)}…${name.slice(-2)}` : `${name.slice(0, 1)}…`;
  return `${shown}@${bank}`;
}

/** A UPI transaction ID / UTR as typed or read: digits only, 12 for UPI (some banks show longer). */
export function cleanRef(ref: string | undefined): string {
  return (ref ?? "").replace(/[\s-]/g, "").toUpperCase();
}

export type Problem = { kind: "block" | "warn"; field: string; text: string; otherId?: string };

/**
 * Everything wrong or worth a second look before saving. A "block" stops the save (a UPI ref already recorded for
 * this event); a "warn" asks the person to confirm.
 */
export function checkExpense(
  e: Pick<Expense, "id" | "amount" | "paidOn" | "vendor" | "upiRef" | "proof" | "eventId" | "method">,
  others: Expense[],
  window?: { from: string; to: string },
): Problem[] {
  const out: Problem[] = [];
  const live = others.filter((o) => o.id !== e.id && !o.removed && o.eventId === e.eventId);
  if (!(e.amount > 0)) out.push({ kind: "block", field: "amount", text: "Enter the amount paid." });
  if (!e.paidOn) out.push({ kind: "block", field: "paidOn", text: "Enter the date it was paid." });
  if (!e.vendor.trim()) out.push({ kind: "block", field: "vendor", text: "Enter who was paid." });
  const ref = cleanRef(e.upiRef);
  if (ref) {
    if (!/^[0-9A-Z]{10,22}$/.test(ref)) out.push({ kind: "warn", field: "upiRef", text: "A UPI transaction ID is usually 12 digits. Check it against the screenshot." });
    const same = live.find((o) => cleanRef(o.upiRef) === ref);
    if (same) out.push({ kind: "block", field: "upiRef", text: `This UPI transaction ID is already recorded: ${same.vendor}, ₹${same.amount} on ${same.paidOn}.`, otherId: same.id });
  } else if (e.method === "gpay" || e.method === "upi") {
    out.push({ kind: "warn", field: "upiRef", text: "No UPI transaction ID. Add it from the screenshot so duplicates can be caught." });
  }
  if (e.proof) {
    const same = live.find((o) => o.proof?.sha256 === e.proof!.sha256);
    if (same) out.push({ kind: "warn", field: "proof", text: `The same screenshot is already attached to ${same.vendor} (₹${same.amount}).`, otherId: same.id });
  } else out.push({ kind: "warn", field: "proof", text: "No proof attached. It's saved as “proof missing” until one is added." });
  if (e.amount > 0 && e.paidOn && e.vendor.trim()) {
    const same = live.find((o) => o.amount === e.amount && o.paidOn === e.paidOn && norm(o.vendor) === norm(e.vendor) && (!ref || !cleanRef(o.upiRef)));
    if (same && !out.some((p) => p.otherId === same.id)) out.push({ kind: "warn", field: "amount", text: `An expense of the same amount to ${same.vendor} on the same day is already recorded.`, otherId: same.id });
  }
  if (e.amount >= LARGE_AMOUNT) out.push({ kind: "warn", field: "amount", text: `₹${e.amount.toLocaleString("en-IN")} is a large amount. Check it before saving.` });
  if (window && e.paidOn && (e.paidOn < window.from || e.paidOn > window.to))
    out.push({ kind: "warn", field: "paidOn", text: "The date is well outside this event's dates. Check it's the right event." });
  return out;
}

/** The days an expense for this event normally falls in: 60 days before the first event date to 14 after the last. */
export function eventWindow(dates: string[]): { from: string; to: string } | undefined {
  if (!dates.length) return undefined;
  const shift = (iso: string, days: number) => {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + days);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const sorted = [...dates].sort();
  return { from: shift(sorted[0], -60), to: shift(sorted[sorted.length - 1], 14) };
}

export type Flag = "missingProof" | "possibleDuplicate" | "queried" | "rejected";

/** Flags shown on the ledger and the handover checklist. */
export function flagsOf(e: Expense, all: Expense[]): Flag[] {
  const f: Flag[] = [];
  if (!e.proof) f.push("missingProof");
  const live = all.filter((o) => o.id !== e.id && !o.removed && o.eventId === e.eventId);
  const dup = live.some(
    (o) =>
      (e.upiRef && cleanRef(o.upiRef) === cleanRef(e.upiRef)) ||
      (e.proof && o.proof?.sha256 === e.proof.sha256) ||
      (o.amount === e.amount && o.paidOn === e.paidOn && norm(o.vendor) === norm(e.vendor)),
  );
  if (dup) f.push("possibleDuplicate");
  if (e.review.state === "queried") f.push("queried");
  if (e.review.state === "rejected") f.push("rejected");
  return f;
}

export interface ExpenseSummary {
  total: number;
  count: number;
  byCategory: { id: string; total: number; count: number }[];
  /** who paid, for reimbursement: "Company account", an advance, or the person's name */
  byPayer: { key: string; label: string; kind: PayerKind; total: number }[];
  byFunction: { fn: string | null; total: number }[];
  missingProof: number;
  duplicates: number;
  queried: number;
}

/** "company", "a:<advanceId>" or "p:<name>": one reimbursement or settlement line per key. */
export const payerKey = (e: Expense) => (e.payer.kind === "company" ? "company" : e.payer.kind === "advance" ? `a:${e.advanceId ?? ""}` : `p:${norm(e.payer.name)}`);

export function summarise(list: Expense[]): ExpenseSummary {
  const live = list.filter((e) => !e.removed);
  const total = r2(live.reduce((t, e) => t + e.amount, 0));
  const group = <K extends string>(key: (e: Expense) => K) => {
    const m = new Map<K, { total: number; count: number; sample: Expense }>();
    for (const e of live) {
      const k = key(e);
      const g = m.get(k) ?? { total: 0, count: 0, sample: e };
      g.total = r2(g.total + e.amount);
      g.count++;
      m.set(k, g);
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  };
  return {
    total,
    count: live.length,
    byCategory: group((e) => e.category).map(([id, g]) => ({ id, total: g.total, count: g.count })),
    byPayer: group(payerKey).map(([key, g]) => ({
      key,
      kind: g.sample.payer.kind,
      label: payerLabel(g.sample),
      total: g.total,
    })),
    byFunction: group((e) => e.fn ?? "").map(([fn, g]) => ({ fn: fn || null, total: g.total })),
    missingProof: live.filter((e) => !e.proof).length,
    duplicates: live.filter((e) => flagsOf(e, live).includes("possibleDuplicate")).length,
    queried: live.filter((e) => e.review.state === "queried").length,
  };
}

export interface ExpenseFilter {
  q?: string;
  category?: string;
  /** a payerKey */
  payer?: string;
  flag?: Flag | "removed" | "";
}

export function filterExpenses(list: Expense[], f: ExpenseFilter): Expense[] {
  const q = norm(f.q);
  return list
    .filter((e) => (f.flag === "removed" ? !!e.removed : !e.removed))
    .filter((e) => !f.category || e.category === f.category)
    .filter((e) => !f.payer || payerKey(e) === f.payer)
    .filter((e) => !f.flag || f.flag === "removed" || flagsOf(e, list).includes(f.flag))
    .filter((e) => !q || [e.vendor, e.description, e.upiRef, e.payer.name, String(e.amount)].some((x) => norm(x).includes(q)))
    .sort((a, b) => (b.paidOn + (b.paidAt ?? "")).localeCompare(a.paidOn + (a.paidAt ?? "")) || b.recordedAt.localeCompare(a.recordedAt));
}

const TRACKED: (keyof Expense)[] = ["amount", "paidOn", "paidAt", "category", "vendor", "payeeUpi", "payer", "advanceId", "method", "upiRef", "description", "fn", "proof"];

/** What changed between two versions of an expense, for the history ("Amount 2,400 → 2,450"). */
export function diff(before: Expense, after: Expense): Record<string, [unknown, unknown]> {
  const out: Record<string, [unknown, unknown]> = {};
  for (const k of TRACKED) {
    const a = k === "proof" ? before.proof?.sha256 : before[k];
    const b = k === "proof" ? after.proof?.sha256 : after[k];
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) out[k] = [a ?? null, b ?? null];
  }
  return out;
}

/** The saved version: an edit with its changes in the history, or a new expense with "created". */
export function saveExpense(next: Expense, before: Expense | undefined, by: string, now = new Date()): Expense {
  const at = now.toISOString();
  if (!before) return { ...next, recordedAt: at, recordedBy: by, history: [{ at, by, action: "created" }] };
  const changes = diff(before, next);
  if (!Object.keys(changes).length) return next;
  return { ...next, history: [...before.history, { at, by, action: "edited", changes }] };
}

export function removeExpense(e: Expense, by: string, reason: string, now = new Date()): Expense {
  const at = now.toISOString();
  return { ...e, removed: { by, at, reason }, history: [...e.history, { at, by, action: "removed", note: reason }] };
}

export function restoreExpense(e: Expense, by: string, now = new Date()): Expense {
  const at = now.toISOString();
  const { removed: _removed, ...rest } = e;
  return { ...rest, history: [...e.history, { at, by, action: "restored" }] };
}

/** Everyone who recorded or edited any of these expenses: none of them may approve the handover. */
export function contributors(list: Expense[]): Set<string> {
  const s = new Set<string>();
  for (const e of list) {
    s.add(norm(e.recordedBy));
    for (const h of e.history) if (h.action !== "reviewed") s.add(norm(h.by));
  }
  return s;
}

export const canReview = (list: Expense[], reviewer: string) => !!reviewer && !contributors(list).has(norm(reviewer));
