import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Brand, Catalog } from "../types";
import { newProposal } from "../state/proposals";
import { validateBrand } from "../config/validate";
import { bookFromProposal, categoriesFor, COMPANY_BOOK_ID, companyBook, monthLabel, packEvent, previousMonth } from "./books";
import { filterExpenses, monthsOf, summarise, type Expense } from "./expenses";
import { applyReply, packData, signOff, type ReceivedHandover, type SentHandover } from "./handover";
import { buildPack, readPack } from "./handoverPack";
import { computeTotals } from "./totals";

const catalog: Catalog = JSON.parse(readFileSync("public/config/catalog.json", "utf8"));
const brand: Brand = JSON.parse(readFileSync("public/config/brand.json", "utf8"));
const RAVI = "ravi@studio.test";
const MEERA = "meera@studio.test";

function exp(extra: Partial<Expense> = {}): Expense {
  return {
    id: `x-${Math.random().toString(36).slice(2, 8)}`,
    eventId: COMPANY_BOOK_ID,
    eventRef: "COMPANY",
    amount: 1000,
    paidOn: "2026-11-05",
    category: "co-fuel",
    vendor: "Indian Oil, Kowdiar",
    payer: { kind: "self", name: RAVI },
    method: "cash",
    description: "",
    recordedAt: "2026-11-05T10:00:00.000Z",
    recordedBy: RAVI,
    history: [{ at: "2026-11-05T10:00:00.000Z", by: RAVI, action: "created" }],
    review: { state: "open" },
    ...extra,
  };
}

describe("books", () => {
  it("reads an event book from its proposal, as the ledger did", () => {
    const p = newProposal(brand);
    p.client = { ...p.client, name: "Ms. Ananya Menon", venue: "Taj Green Cove", dates: ["2027-02-14", "2027-02-12"], date: "2027-02-12" };
    p.functions = [{ id: "f1", label: "Haldi", date: "2027-02-12" }];
    const b = bookFromProposal(p, catalog, brand);
    expect(b).toMatchObject({ id: p.id, kind: "event", ref: p.ref, title: "Ms. Ananya Menon", functions: [{ id: "f1", label: "Haldi" }], window: { from: "2026-12-14", to: "2027-02-28" } });
    expect(b.quoted).toBe(computeTotals(p, brand.gstPct).grandTotal);
    expect(packEvent(b)).toMatchObject({ id: p.id, ref: p.ref, client: "Ms. Ananya Menon", venue: "Taj Green Cove", functions: [{ id: "f1", label: "Haldi" }] });
  });

  it("gives the company book no event window, functions or quote, and a handover ref per month", () => {
    const c = companyBook(brand);
    expect(c).toMatchObject({ id: "company", kind: "company", ref: "COMPANY", functions: [], dates: [], client: brand.company });
    expect(c.window).toBeUndefined();
    expect(c.quoted).toBeUndefined();
    expect(packEvent(c, "2026-11")).toMatchObject({ ref: "COMPANY-2026-11", title: "Company expenses, November 2026", functions: [] });
    expect(packEvent(c).ref).toBe("COMPANY");
    expect(monthLabel("2027-01")).toBe("January 2027");
    expect(previousMonth("2027-01")).toBe("2026-12");
    expect(previousMonth("2026-11")).toBe("2026-10");
  });

  it("offers each book its own categories, the team's, your own, and Other last", () => {
    const b = { expenseCategories: [{ id: "t1", label: "Return gifts" }], companyExpenseCategories: [{ id: "t2", label: "Software" }] };
    const mine = [{ id: "c-1", label: "Courier" }];
    const co = categoriesFor("company", b, mine).map((c) => c.label);
    expect(co[0]).toBe("Office & rent");
    expect(co).toContain("Software");
    expect(co).not.toContain("Return gifts");
    expect(co.slice(-2)).toEqual(["Courier", "Other"]);
    const ev = categoriesFor("event", b, mine).map((c) => c.label);
    expect(ev[0]).toBe("Purchases");
    expect(ev).toContain("Return gifts");
    expect(ev).not.toContain("Software");
    expect(validateBrand({ ...brand, companyExpenseCategories: [{ id: "x" }] }).join(" ")).toMatch(/companyExpenseCategories/);
    expect(validateBrand({ ...brand, companyExpenseCategories: [{ id: "x", label: "X" }] })).toEqual([]);
  });

  it("filters and totals by month", () => {
    const list = [exp({ amount: 1000 }), exp({ amount: 2500, paidOn: "2026-11-20" }), exp({ amount: 400, paidOn: "2026-10-31" })];
    expect(filterExpenses(list, { month: "2026-11" }).map((e) => e.amount)).toEqual([2500, 1000]);
    expect(summarise(list).byMonth).toEqual([{ month: "2026-11", total: 3500, count: 2 }, { month: "2026-10", total: 400, count: 1 }]);
    expect(monthsOf(list, "2026-12")).toEqual(["2026-12", "2026-11", "2026-10"]);
  });

  it("hands over one month of company expenses, round trip and reply", async () => {
    const nov = [exp({ id: "a", amount: 1200 }), exp({ id: "b", amount: 800, paidOn: "2026-11-21" })];
    const oct = exp({ id: "c", paidOn: "2026-10-02" });
    const month = "2026-11";
    const book = companyBook(brand);
    const pack = packData({ id: "h1", event: packEvent(book, month), from: RAVI, note: "", categories: categoriesFor("company", brand, []), expenses: filterExpenses([...nov, oct], { month }) });
    expect(pack.expenses.map((e) => e.id).sort()).toEqual(["a", "b"]);
    const back = await readPack(await buildPack(pack, new Map()), MEERA);
    expect(back.problems.filter((p) => p.fatal)).toEqual([]);
    expect(back.pack!.event).toMatchObject({ id: "company", ref: "COMPANY-2026-11" });

    const rx: ReceivedHandover = { id: "h1", pack: back.pack!, receivedAt: "", reviewer: MEERA, reviews: { a: { state: "checked" }, b: { state: "checked" } }, state: "reviewing" };
    const r = signOff(rx);
    if (!r.ok) throw new Error("expected a sign-off");
    const sent: SentHandover = { id: "h1", eventId: "company", from: RAVI, createdAt: "", expenseIds: ["a", "b"], total: 2000, state: "sent", month };
    const applied = applyReply(r.reply, [sent], [...nov, oct]);
    if ("error" in applied) throw new Error(applied.error);
    expect(applied.handover).toMatchObject({ state: "reconciled", month });
    expect(applied.expenses.map((e) => e.id)).toEqual(["a", "b"]);
  });
});
