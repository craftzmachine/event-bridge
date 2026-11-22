// Staff advances: money given to a team member for an event's purchases, what they spent from it, and settling up
// afterwards (cash returned, or the company repaying an overspend). Pure rules; storage is in src/state/expenses.ts.
import { cleanRef, type Expense, type ExpenseMethod } from "./expenses";

export type MovementKind = "issued" | "topup" | "returned" | "reimbursed";

/** One transfer of money for an advance. Never deleted: a mistake is reversed, with a reason. */
export interface Movement {
  id: string;
  kind: MovementKind;
  amount: number;
  /** YYYY-MM-DD */
  on: string;
  method: ExpenseMethod;
  upiRef?: string;
  note?: string;
  by: string;
  at: string;
  reversed?: { by: string; at: string; reason: string };
}

export interface AdvanceHistory {
  at: string;
  by: string;
  action: "created" | "edited" | "movement" | "reversed" | "closed" | "reopened" | "reviewed";
  note?: string;
}

export interface Advance {
  id: string;
  /** the proposal it's for, and its quotation ref */
  eventId: string;
  eventRef: string;
  fn?: string;
  /** the team member holding the money: their sign-in email, so their own expenses default to it */
  staff: string;
  purpose: string;
  /** above this, a single expense asks "is this right?" */
  limit?: number;
  /** YYYY-MM-DD: when it should be settled by */
  settleBy?: string;
  movements: Movement[];
  createdAt: string;
  createdBy: string;
  closed?: { by: string; at: string; note?: string; writtenOff?: number };
  history: AdvanceHistory[];
}

export const MOVEMENT_LABEL: Record<MovementKind, string> = {
  issued: "Given",
  topup: "Top-up",
  returned: "Returned",
  reimbursed: "Reimbursed",
};

/** Days after the last event date by which an advance should be settled. */
export const SETTLE_DAYS = 3;
/** Under this share of the money given still left, the advance shows as running low. */
export const LOW_SHARE = 0.2;
/** An expense without proof older than this is flagged. */
export const PROOF_GRACE_HOURS = 24;

const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string | undefined) => (s ?? "").normalize("NFKC").trim().toLowerCase();
const live = (a: Advance) => a.movements.filter((m) => !m.reversed);
const sum = (list: { amount: number }[]) => r2(list.reduce((t, x) => t + x.amount, 0));

/** The live expenses paid from this advance. */
export const expensesOf = (a: Advance, expenses: Expense[]) => expenses.filter((e) => e.advanceId === a.id && !e.removed);

/** An expense counts as spent from the advance unless it was rejected. */
const counts = (e: Expense) => e.review.state !== "rejected";
/** At settlement it also needs proof, or a reviewer who checked it without one. */
const accepted = (e: Expense) => counts(e) && (!!e.proof || e.review.state === "checked");

export interface Balance {
  given: number;
  spent: number;
  returned: number;
  reimbursed: number;
  /** what the staff member should still be holding: negative when they've spent more than they were given */
  left: number;
}

/** The running balance, as the staff member sees it: everything recorded and not rejected counts as spent. */
export function balanceOf(a: Advance, expenses: Expense[]): Balance {
  const m = live(a);
  const given = sum(m.filter((x) => x.kind === "issued" || x.kind === "topup"));
  const returned = sum(m.filter((x) => x.kind === "returned"));
  const reimbursed = sum(m.filter((x) => x.kind === "reimbursed"));
  const spent = sum(expensesOf(a, expenses).filter(counts));
  return { given, spent, returned, reimbursed, left: r2(given - spent - returned + reimbursed) };
}

export interface Settlement extends Balance {
  /** spending that counts at settlement: not rejected, and with proof or checked by a reviewer */
  accepted: number;
  /** rejected spending, and spending without proof nobody has checked: the staff member still owes it */
  notAccepted: number;
  /** positive: the staff member returns this; negative: the company owes them this; zero: settled */
  due: number;
  /** why it can't be settled yet */
  holds: string[];
}

export function settlement(a: Advance, expenses: Expense[]): Settlement {
  const b = balanceOf(a, expenses);
  const mine = expensesOf(a, expenses);
  const ok = sum(mine.filter(accepted));
  const holds: string[] = [];
  const queried = mine.filter((e) => e.review.state === "queried").length;
  const open = mine.filter((e) => e.review.state === "open").length;
  if (queried) holds.push(`${queried} expense${queried === 1 ? " is" : "s are"} queried`);
  if (open) holds.push(`${open} expense${open === 1 ? " hasn't" : "s haven't"} been reviewed`);
  return { ...b, accepted: ok, notAccepted: r2(sum(mine) - ok), due: r2(b.given - ok - b.returned + b.reimbursed), holds };
}

export type AdvanceState = "open" | "low" | "over" | "overdue" | "settled" | "closed";

export const STATE_LABEL: Record<AdvanceState, string> = {
  open: "Open",
  low: "Running low",
  over: "Overspent",
  overdue: "Settle now",
  settled: "Ready to close",
  closed: "Closed",
};

/** One state for the advance's chip; the most urgent wins. */
export function advanceState(a: Advance, expenses: Expense[], today: string): AdvanceState {
  if (a.closed) return "closed";
  const b = balanceOf(a, expenses);
  const s = settlement(a, expenses);
  if (b.given > 0 && (b.spent > 0 || b.returned > 0) && s.due === 0 && !s.holds.length) return "settled";
  if (a.settleBy && today > a.settleBy) return "overdue";
  if (b.left < 0) return "over";
  if (b.given > 0 && b.left < b.given * LOW_SHARE) return "low";
  return "open";
}

/** Alerts for an advance, shown on the ledger: running low, overspent, past its settle-by date, proof missing. */
export function advanceAlerts(a: Advance, expenses: Expense[], now: Date, today: string): string[] {
  if (a.closed) return [];
  const b = balanceOf(a, expenses);
  const out: string[] = [];
  if (b.left < 0) out.push(`Overspent by ₹${(-b.left).toLocaleString("en-IN")}`);
  else if (b.given > 0 && b.left < b.given * LOW_SHARE) out.push(`Only ₹${b.left.toLocaleString("en-IN")} left`);
  if (a.settleBy && today > a.settleBy) out.push("Past its settle-by date");
  const stale = expensesOf(a, expenses).filter((e) => !e.proof && e.recordedAt && now.getTime() - new Date(e.recordedAt).getTime() > PROOF_GRACE_HOURS * 3600_000).length;
  if (stale) out.push(`${stale} expense${stale === 1 ? "" : "s"} without proof for over ${PROOF_GRACE_HOURS} h`);
  return out;
}

export type MovementProblem = { kind: "block" | "warn"; text: string };

/**
 * Before recording money given or returned: an amount and a date, a UPI ref not already recorded for this event
 * (on another movement or an expense), and a warning when a return or repayment is more than what's due.
 */
export function checkMovement(
  m: Pick<Movement, "id" | "kind" | "amount" | "on" | "upiRef">,
  a: Advance,
  advances: Advance[],
  expenses: Expense[],
): MovementProblem[] {
  const out: MovementProblem[] = [];
  if (!(m.amount > 0)) out.push({ kind: "block", text: "Enter the amount." });
  if (!m.on) out.push({ kind: "block", text: "Enter the date." });
  const ref = cleanRef(m.upiRef);
  if (ref) {
    const moved = advances
      .filter((x) => x.eventId === a.eventId)
      .flatMap((x) => live(x))
      .find((x) => x.id !== m.id && cleanRef(x.upiRef) === ref);
    const spent = expenses.find((e) => !e.removed && e.eventId === a.eventId && cleanRef(e.upiRef) === ref);
    if (moved || spent) out.push({ kind: "block", text: "This UPI transaction ID is already recorded for this event." });
  }
  if (m.amount > 0 && (m.kind === "returned" || m.kind === "reimbursed")) {
    const due = settlement(a, expenses).due;
    if (m.kind === "returned" && m.amount > Math.max(due, 0)) out.push({ kind: "warn", text: due > 0 ? `That's more than the ₹${due.toLocaleString("en-IN")} to return.` : "Nothing is due back on this advance." });
    if (m.kind === "reimbursed" && m.amount > Math.max(-due, 0)) out.push({ kind: "warn", text: due < 0 ? `That's more than the ₹${(-due).toLocaleString("en-IN")} the company owes.` : "The company doesn't owe anything on this advance." });
  }
  return out;
}

/** What spending this expense from the advance would leave, or a warning when it's over the advance or its limit. */
export function spendWarning(e: Pick<Expense, "id" | "amount" | "advanceId">, a: Advance, expenses: Expense[]): string | undefined {
  const others = expenses.filter((x) => x.id !== e.id);
  const left = r2(balanceOf(a, others).left - (e.amount > 0 ? e.amount : 0));
  if (a.limit && e.amount > a.limit) return `This is over the ₹${a.limit.toLocaleString("en-IN")} limit for one expense on this advance.`;
  if (left < 0) return `This takes the advance ₹${(-left).toLocaleString("en-IN")} over what was given. It'll be repaid at settlement.`;
  return undefined;
}

const at = (now: Date) => now.toISOString();

export function newAdvance(o: { id: string; eventId: string; eventRef: string; fn?: string; staff: string; purpose: string; limit?: number; settleBy?: string; first: Movement; by: string; now?: Date }): Advance {
  const t = at(o.now ?? new Date());
  return {
    id: o.id,
    eventId: o.eventId,
    eventRef: o.eventRef,
    fn: o.fn,
    staff: o.staff.trim(),
    purpose: o.purpose.trim(),
    limit: o.limit,
    settleBy: o.settleBy,
    movements: [{ ...o.first, kind: "issued", by: o.by, at: t }],
    createdAt: t,
    createdBy: o.by,
    history: [{ at: t, by: o.by, action: "created", note: `Given ₹${o.first.amount.toLocaleString("en-IN")}` }],
  };
}

export function addMovement(a: Advance, m: Movement, by: string, now = new Date()): Advance {
  const t = at(now);
  return {
    ...a,
    movements: [...a.movements, { ...m, by, at: t }],
    history: [...a.history, { at: t, by, action: "movement", note: `${MOVEMENT_LABEL[m.kind]} ₹${m.amount.toLocaleString("en-IN")}` }],
  };
}

export function reverseMovement(a: Advance, id: string, by: string, reason: string, now = new Date()): Advance {
  const t = at(now);
  const m = a.movements.find((x) => x.id === id);
  if (!m || m.reversed) return a;
  return {
    ...a,
    movements: a.movements.map((x) => (x.id === id ? { ...x, reversed: { by, at: t, reason } } : x)),
    history: [...a.history, { at: t, by, action: "reversed", note: `${MOVEMENT_LABEL[m.kind]} ₹${m.amount.toLocaleString("en-IN")}: ${reason}` }],
  };
}

/**
 * Closing locks the advance. It needs nothing due either way and no open reviews, unless the manager writes off
 * what's left with a reason.
 */
export function closeAdvance(a: Advance, expenses: Expense[], by: string, writeOffReason?: string, now = new Date()): { error: string } | { advance: Advance } {
  if (a.closed) return { error: "This advance is already closed." };
  const s = settlement(a, expenses);
  const reason = writeOffReason?.trim();
  if ((s.due !== 0 || s.holds.length) && !reason) {
    const owed = s.due > 0 ? `₹${s.due.toLocaleString("en-IN")} still to be returned` : s.due < 0 ? `₹${(-s.due).toLocaleString("en-IN")} still owed to ${a.staff}` : "";
    return { error: `It can't be closed yet: ${[owed, ...s.holds].filter(Boolean).join("; ")}. Settle it, or write it off with a reason.` };
  }
  const t = at(now);
  return {
    advance: {
      ...a,
      closed: { by, at: t, note: reason, writtenOff: reason ? s.due : undefined },
      history: [...a.history, { at: t, by, action: "closed", note: reason ? `Written off ₹${s.due.toLocaleString("en-IN")}: ${reason}` : undefined }],
    },
  };
}

export function reopenAdvance(a: Advance, by: string, reason: string, now = new Date()): Advance {
  const t = at(now);
  const { closed: _closed, ...rest } = a;
  return { ...rest, history: [...a.history, { at: t, by, action: "reopened", note: reason.trim() }] };
}

/** Everyone who gave, held or moved money on these advances: none of them may review the handover. */
export function advanceContributors(list: Advance[]): Set<string> {
  const s = new Set<string>();
  for (const a of list) {
    s.add(norm(a.staff));
    s.add(norm(a.createdBy));
    for (const m of a.movements) s.add(norm(m.by));
    for (const h of a.history) if (h.action !== "reviewed") s.add(norm(h.by));
  }
  return s;
}

/** Who may give money and settle advances: anyone listed in brand.json "advanceManagers", or anyone when it's unset. */
export const canManage = (managers: string[] | undefined, account: string) => !managers?.length || managers.some((m) => norm(m) === norm(account));

/** The advances an expense can be paid from: open ones for that event, the account's own first. */
export function openAdvancesFor(advances: Advance[], eventId: string, account: string): Advance[] {
  return advances
    .filter((a) => a.eventId === eventId && !a.closed)
    .sort((a, b) => Number(norm(b.staff) === norm(account)) - Number(norm(a.staff) === norm(account)) || a.createdAt.localeCompare(b.createdAt));
}

/** "2027-02-17": SETTLE_DAYS after the last event date. */
export function defaultSettleBy(dates: string[]): string | undefined {
  if (!dates.length) return undefined;
  const d = new Date(`${[...dates].sort().at(-1)}T00:00:00`);
  d.setDate(d.getDate() + SETTLE_DAYS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
