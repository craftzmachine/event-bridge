// An expense "book": what a ledger, its advances and its handover belong to. Either one event (a proposal), or the
// company's own running costs (office, fuel, marketing…), which use the fixed id "company" in place of a proposal id.
import type { Brand, Catalog, Proposal } from "../types";
import type { PackEvent } from "./handover";
import { DEFAULT_CATEGORIES, eventWindow } from "./expenses";
import { eventDates, proposalTitle } from "./proposal";
import { functionsOf } from "./functions";
import { computeTotals } from "./totals";

export const COMPANY_BOOK_ID = "company";
export const COMPANY_REF = "COMPANY";

export interface Book {
  id: string;
  kind: "event" | "company";
  /** the quotation ref, or COMPANY */
  ref: string;
  title: string;
  subtitle: string;
  functions: { id: string; label: string }[];
  /** the days an expense normally falls in; none for the company */
  window?: { from: string; to: string };
  dates: string[];
  /** the proposal's Grand Total, for reference */
  quoted?: number;
  /** who and what, for the handover pack */
  client: string;
  venue: string;
}

export const COMPANY_CATEGORIES = [
  { id: "co-office", label: "Office & rent" },
  { id: "co-utilities", label: "Utilities & internet" },
  { id: "co-fuel", label: "Fuel & travel" },
  { id: "co-marketing", label: "Marketing & ads" },
  { id: "co-salaries", label: "Salaries & wages" },
  { id: "co-equipment", label: "Equipment" },
  { id: "co-professional", label: "Professional fees" },
  { id: "co-bank", label: "Bank charges" },
  { id: "other", label: "Other" },
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-11" → "November 2026" */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return MONTHS[m - 1] ? `${MONTHS[m - 1]} ${y}` : ym;
}

/** "2026-11" → "2026-10" */
export function previousMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function bookFromProposal(p: Proposal, catalog: Catalog, brand: Brand): Book {
  const dates = eventDates(p);
  return {
    id: p.id,
    kind: "event",
    ref: p.ref,
    title: p.client.name || "Untitled client",
    subtitle: proposalTitle(p, catalog) || "Occasion not set",
    functions: functionsOf(p).map(({ id, label }) => ({ id, label })),
    window: eventWindow(dates),
    dates,
    quoted: computeTotals(p, brand.gstPct).grandTotal,
    client: p.client.name,
    venue: p.client.venue,
  };
}

export function companyBook(brand: Brand): Book {
  return {
    id: COMPANY_BOOK_ID,
    kind: "company",
    ref: COMPANY_REF,
    title: "Company expenses",
    subtitle: `${brand.company}'s own running costs: office, travel, marketing, wages`,
    functions: [],
    dates: [],
    client: brand.company,
    venue: "",
  };
}

/** The handover's event: a company handover covers one month, and its ref says which ("COMPANY-2026-11"). */
export function packEvent(book: Book, month?: string): PackEvent {
  if (book.kind === "company")
    return { id: book.id, ref: month ? `${COMPANY_REF}-${month}` : COMPANY_REF, client: book.client, title: month ? `Company expenses, ${monthLabel(month)}` : "Company expenses", dates: [], venue: "", functions: [] };
  return { id: book.id, ref: book.ref, client: book.client, title: book.subtitle, dates: book.dates, venue: book.venue, functions: book.functions };
}

/** The categories offered for a book: its defaults, the team's from brand.json, your own, and Other last. */
export function categoriesFor(kind: Book["kind"], brand: Pick<Brand, "expenseCategories" | "companyExpenseCategories">, custom: { id: string; label: string }[]) {
  const defaults = kind === "company" ? COMPANY_CATEGORIES : DEFAULT_CATEGORIES;
  const team = (kind === "company" ? brand.companyExpenseCategories : brand.expenseCategories) ?? [];
  const other = defaults.find((c) => c.id === "other")!;
  return [...defaults.filter((c) => c.id !== "other"), ...team, ...custom, other].filter((c, i, a) => a.findIndex((x) => x.id === c.id) === i);
}
