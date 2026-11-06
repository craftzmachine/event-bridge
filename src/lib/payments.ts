// The payment plan (milestones as a share of the total including GST, since the terms charge GST on top)
// and what has been received. Pure, so the rules are tested in Node.
import type { Brand, Milestone, Payment, PaymentMethod, Proposal } from "../types";
import { computeTotals } from "./totals";
import { eventDates } from "./proposal";
import { todayISO } from "./format";

export const METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "upi", label: "UPI" },
  { id: "bank", label: "Bank transfer" },
  { id: "cheque", label: "Cheque" },
  { id: "card", label: "Card" },
  { id: "cash", label: "Cash" },
];

/** The terms' "70% advance with the work order", then the balance before the event — unless brand.json says otherwise. */
export function standardPlan(brand: Brand): { label: string; pct: number; when: "booking" | "before-event" }[] {
  return brand.paymentPlan?.length
    ? brand.paymentPlan
    : [
        { label: "Advance with the work order", pct: 70, when: "booking" },
        { label: "Balance before the event", pct: 30, when: "before-event" },
      ];
}

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return todayISO(d);
};

/** The proposal's own plan, or the standard one dated from its booking and first event date. */
export function planFor(p: Proposal, brand: Brand): Milestone[] {
  if (p.payments?.plan?.length) return p.payments.plan;
  const first = eventDates(p)[0];
  const booked = p.status === "accepted" && p.statusAt ? todayISO(new Date(p.statusAt)) : "";
  return standardPlan(brand).map((m, i) => ({
    id: `m${i + 1}`,
    label: m.label,
    pct: m.pct,
    due: m.when === "booking" ? booked : first ? addDays(first, -(brand.balanceDueDays ?? 7)) : "",
  }));
}

export type MilestoneState = "paid" | "part" | "due" | "overdue" | "upcoming";

export interface ScheduledMilestone extends Milestone {
  amount: number;
  paid: number;
  state: MilestoneState;
}

export interface PaymentSchedule {
  /** the total including GST that the plan divides */
  total: number;
  received: number;
  balance: number;
  milestones: ScheduledMilestone[];
  /** the plan's percentages don't add up to 100 */
  planOff: boolean;
}

/**
 * Amounts to the rupee, with the last milestone taking the remainder so they add up exactly. Payments are applied
 * to milestones in order. A milestone is overdue once its date has passed and it isn't fully paid.
 */
export function schedule(p: Proposal, brand: Brand, today = todayISO()): PaymentSchedule {
  const total = computeTotals(p, brand.gstPct).totalWithGst;
  const plan = planFor(p, brand);
  const received = Math.round(paidTotal(p) * 100) / 100;
  let left = received;
  let allotted = 0;
  const milestones = plan.map((m, i) => {
    const amount = i === plan.length - 1 ? Math.round((total - allotted) * 100) / 100 : Math.round((total * m.pct) / 100);
    allotted += amount;
    const paid = Math.min(Math.max(left, 0), amount);
    left -= paid;
    const state: MilestoneState =
      amount > 0 && paid >= amount - 0.005 ? "paid" : paid > 0 ? "part" : m.due && m.due < today ? "overdue" : m.due && m.due <= addDays(today, 14) ? "due" : "upcoming";
    return { ...m, amount, paid, state: state === "part" && m.due && m.due < today ? "overdue" : state };
  });
  const pctSum = plan.reduce((s, m) => s + m.pct, 0);
  return { total, received, balance: Math.round((total - received) * 100) / 100, milestones, planOff: Math.abs(pctSum - 100) > 0.01 };
}

export const paidTotal = (p: Pick<Proposal, "payments">) => (p.payments?.received ?? []).reduce((s, x) => s + x.amount, 0);

/** "R-20261102-KQZ-2": the quotation reference and the payment's number on it. */
export const nextReceiptNo = (p: Pick<Proposal, "ref" | "payments">) => `R-${p.ref || "DRAFT"}-${(p.payments?.received.length ?? 0) + 1}`;

/** Milestones still owed: overdue ones and those due in the next 14 days, for the dashboard. */
export function dueItems(p: Proposal, brand: Brand, today = todayISO()) {
  return schedule(p, brand, today).milestones.filter((m) => m.state === "overdue" || m.state === "due").map((m) => ({ ...m, outstanding: Math.round((m.amount - m.paid) * 100) / 100 }));
}

// ---- amount in words (Indian system: thousand, lakh, crore) -------------------------------------

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const twoDigits = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`);
const threeDigits = (n: number) => [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : "", twoDigits(n % 100)].filter(Boolean).join(" ");

function intWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1e3);
  const rest = n % 1e3;
  if (crore) parts.push(`${intWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  return parts.join(" ");
}

/** "Rupees Two Lakh Fifty Thousand and Fifty Paise Only" */
export function amountInWords(amount: number): string {
  const rupees = Math.floor(Math.round(amount * 100) / 100);
  const paise = Math.round((amount - rupees) * 100);
  return `Rupees ${intWords(rupees)}${paise ? ` and ${twoDigits(paise)} Paise` : ""} Only`;
}

export const emptyPayment = (p: Proposal, brand: Brand, today = todayISO()): Omit<Payment, "id"> => {
  const next = schedule(p, brand, today).milestones.find((m) => m.state !== "paid");
  return { date: today, amount: next ? Math.round((next.amount - next.paid) * 100) / 100 : 0, method: "upi", reference: "", note: "", receiptNo: nextReceiptNo(p) };
};
