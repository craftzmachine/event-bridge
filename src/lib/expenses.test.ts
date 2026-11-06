import { describe, expect, it } from "vitest";
import { canReview, checkExpense, cleanRef, diff, eventWindow, filterExpenses, flagsOf, maskUpi, removeExpense, restoreExpense, saveExpense, summarise, type Expense } from "./expenses";
import { applyReply, packData, signOff, verifyPack, type ReceivedHandover, type SentHandover } from "./handover";
import { buildPack, ledgerWorkbook, readPack } from "./handoverPack";
import { fingerprint } from "./proofImage";

const ANJALI = "anjali@studio.test";
const RAVI = "ravi@studio.test";
const MEERA = "meera@studio.test";

function exp(extra: Partial<Expense> = {}): Expense {
  return {
    id: `x-${Math.random().toString(36).slice(2, 8)}`,
    eventId: "ev1",
    eventRef: "20262011-ABC",
    amount: 2400,
    paidOn: "2027-02-12",
    category: "decor",
    vendor: "Chalai flower market",
    payer: { kind: "self", name: ANJALI },
    method: "gpay",
    upiRef: "412345678901",
    description: "Jasmine, 40 kg",
    recordedAt: "2027-02-12T10:00:00.000Z",
    recordedBy: ANJALI,
    history: [{ at: "2027-02-12T10:00:00.000Z", by: ANJALI, action: "created" }],
    review: { state: "open" },
    ...extra,
  };
}
const proof = (sha256: string) => ({ fileId: `f-${sha256.slice(0, 6)}`, name: "s.webp", type: "image/webp", size: 10, sha256, takenFrom: "upload" as const });

describe("expense safeguards", () => {
  it("blocks a UPI ref already recorded for the event, and missing essentials", () => {
    const first = exp();
    const again = exp({ id: "x-2", upiRef: "4123 4567 8901" });
    const p = checkExpense(again, [first]);
    expect(p.find((x) => x.field === "upiRef")).toMatchObject({ kind: "block", otherId: first.id });
    expect(checkExpense(exp({ id: "x-3", amount: 0, vendor: " ", paidOn: "" }), []).filter((x) => x.kind === "block").map((x) => x.field)).toEqual(["amount", "paidOn", "vendor"]);
    // a different event may have the same ref (it can't really, but it isn't this event's duplicate)
    expect(checkExpense({ ...again, eventId: "ev2" }, [first]).some((x) => x.kind === "block")).toBe(false);
    // removed expenses don't count
    expect(checkExpense(again, [removeExpense(first, ANJALI, "typo")]).some((x) => x.kind === "block")).toBe(false);
  });

  it("warns about a repeated screenshot, a same-day same-amount payment, no proof, a large amount and a far-off date", () => {
    const first = exp({ proof: proof("aa11") });
    const warns = (e: Expense) => checkExpense(e, [first], eventWindow(["2027-02-14"])).filter((x) => x.kind === "warn").map((x) => x.field);
    expect(warns(exp({ id: "a", upiRef: "999999999999", proof: proof("aa11") }))).toContain("proof");
    expect(warns(exp({ id: "b", upiRef: undefined, proof: proof("bb22") }))).toEqual(["upiRef", "amount"]);
    expect(warns(exp({ id: "c", upiRef: "111111111111" }))).toEqual(["proof"]);
    expect(warns(exp({ id: "d", upiRef: "222222222222", proof: proof("cc33"), amount: 150000 }))).toEqual(["amount"]);
    expect(warns(exp({ id: "e", upiRef: "333333333333", proof: proof("dd44"), paidOn: "2026-06-01" }))).toEqual(["paidOn"]);
    expect(warns(exp({ id: "f", upiRef: "12-34", proof: proof("ee55"), amount: 10 }))).toEqual(["upiRef"]);
  });

  it("flags missing proof and possible duplicates on the ledger", () => {
    const a = exp({ proof: proof("aa11") });
    const b = exp({ id: "x-b", upiRef: undefined });
    expect(flagsOf(a, [a, b])).toEqual(["possibleDuplicate"]);
    expect(flagsOf(b, [a, b])).toEqual(["missingProof", "possibleDuplicate"]);
  });

  it("masks UPI IDs and cleans references", () => {
    expect(maskUpi("ananya.menon@okaxis")).toBe("an…on@okaxis");
    expect(maskUpi("ab@ybl")).toBe("a…@ybl");
    expect(cleanRef(" 4123-4567 8901 ")).toBe("412345678901");
  });
});

describe("summaries and history", () => {
  it("totals by category, payer and function, ignoring removed expenses", () => {
    const list = [
      exp({ amount: 1000, category: "food", payer: { kind: "company", name: "" } }),
      exp({ id: "2", amount: 2500.5, upiRef: "2", fn: "f1", payer: { kind: "colleague", name: "Ravi" } }),
      exp({ id: "3", amount: 500, upiRef: "3", fn: "f1", payer: { kind: "colleague", name: " ravi " } }),
      removeExpense(exp({ id: "4", amount: 9999, upiRef: "4" }), ANJALI, "entered twice"),
    ];
    const s = summarise(list);
    expect(s.total).toBe(4000.5);
    expect(s.count).toBe(3);
    expect(s.byCategory).toEqual([{ id: "decor", total: 3000.5, count: 2 }, { id: "food", total: 1000, count: 1 }]);
    expect(s.byPayer.map((x) => [x.label, x.total])).toEqual([["Ravi", 3000.5], ["Company account", 1000]]);
    expect(s.byFunction).toEqual([{ fn: "f1", total: 3000.5 }, { fn: null, total: 1000 }]);
    expect(filterExpenses(list, { q: "ravi" })).toHaveLength(2);
    expect(filterExpenses(list, { flag: "removed" })).toHaveLength(1);
    expect(filterExpenses(list, { payer: "company" })).toHaveLength(1);
  });

  it("records who created, edited, removed and restored", () => {
    const now = new Date("2027-02-13T09:00:00Z");
    const created = saveExpense(exp({ history: [], recordedBy: "" }), undefined, ANJALI, now);
    expect(created.history).toEqual([{ at: now.toISOString(), by: ANJALI, action: "created" }]);
    const edited = saveExpense({ ...created, amount: 2450 }, created, RAVI, now);
    expect(edited.history[1]).toMatchObject({ by: RAVI, action: "edited", changes: { amount: [2400, 2450] } });
    expect(saveExpense(edited, edited, RAVI, now).history).toHaveLength(2); // no change, no entry
    const removed = removeExpense(edited, RAVI, "duplicate", now);
    expect(removed.removed).toMatchObject({ by: RAVI, reason: "duplicate" });
    expect(restoreExpense(removed, ANJALI, now).removed).toBeUndefined();
    expect(Object.keys(diff(created, { ...created, proof: proof("ff66") }))).toEqual(["proof"]);
  });

  it("lets only someone who didn't record or edit the expenses review them", () => {
    const list = [exp(), saveExpense({ ...exp({ id: "2", upiRef: "2" }), amount: 10 }, exp({ id: "2", upiRef: "2" }), RAVI)];
    expect(canReview(list, ANJALI)).toBe(false);
    expect(canReview(list, " Ravi@Studio.test ")).toBe(false);
    expect(canReview(list, MEERA)).toBe(true);
    expect(canReview(list, "")).toBe(false);
  });
});

describe("handover", () => {
  const event = { id: "ev1", ref: "20262011-ABC", client: "Ms. Ananya Menon", title: "Hindu Wedding", dates: ["2027-02-14"], venue: "Taj Green Cove", functions: [] };
  const cats = [{ id: "decor", label: "Décor & flowers" }];

  it("signs off as reconciled only when every expense is checked, and the reply updates the recorder's ledger", () => {
    const a = exp({ id: "a" });
    const b = exp({ id: "b", upiRef: "2" });
    const pack = packData({ id: "h1", event, from: ANJALI, note: "", categories: cats, expenses: [a, b] });
    const rx: ReceivedHandover = { id: "h1", pack, receivedAt: "", reviewer: MEERA, reviews: { a: { state: "checked" } }, state: "reviewing" };
    expect(signOff(rx)).toEqual({ ok: false, open: 1 });
    const queried = signOff({ ...rx, reviews: { a: { state: "checked" }, b: { state: "queried", note: "Which invoice?" } } });
    expect(queried.ok && queried.state).toBe("returned");
    const ok = signOff({ ...rx, reviews: { a: { state: "checked" }, b: { state: "checked" } } }, new Date("2027-02-20T08:00:00Z"));
    if (!ok.ok) throw new Error("expected a sign-off");
    expect(ok.state).toBe("reconciled");

    const sent: SentHandover = { id: "h1", eventId: "ev1", from: ANJALI, createdAt: "", expenseIds: ["a", "b"], total: 4800, state: "sent" };
    const applied = applyReply(ok.reply, [sent], [a, b]);
    if ("error" in applied) throw new Error(applied.error);
    expect(applied.handover).toMatchObject({ state: "reconciled", reviewer: MEERA });
    expect(applied.expenses.map((e) => e.review.state)).toEqual(["checked", "checked"]);
    expect(applied.expenses[0].history.at(-1)).toMatchObject({ action: "reviewed", by: MEERA });
    // a reply signed by the recorder doesn't count
    expect(applyReply({ ...ok.reply, reviewer: ANJALI }, [sent], [a, b])).toHaveProperty("error");
    expect(applyReply({ ...ok.reply, handoverId: "other" }, [sent], [a, b])).toHaveProperty("error");
  });

  it("round-trips a pack with its proof, and refuses a changed image or the recorder's own review", async () => {
    const bytes = new TextEncoder().encode("pretend this is a screenshot");
    const sha = await fingerprint(bytes);
    const a = exp({ id: "a", proof: { ...proof(sha), fileId: "img1" } });
    const b = exp({ id: "b", upiRef: "2" });
    const pack = packData({ id: "h2", event, from: ANJALI, note: "Two cash payments have no receipt", categories: cats, expenses: [a, b] });
    const zip = await buildPack(pack, new Map([["img1", new Blob([bytes], { type: "image/webp" })]]));

    const ok = await readPack(zip, MEERA);
    expect(ok.problems).toEqual([]);
    expect(ok.pack!.expenses.map((e) => e.id)).toEqual(["a", "b"]);
    expect(new Uint8Array(await ok.images.get("img1")!.arrayBuffer())).toEqual(bytes);

    expect((await readPack(zip, ANJALI)).problems[0]).toMatchObject({ fatal: true });
    const tampered = verifyPack(pack, { img1: "0".repeat(64) }, MEERA);
    expect(tampered.problems[0]).toMatchObject({ fatal: true });
    expect(verifyPack(pack, {}, MEERA).problems[0]).toMatchObject({ fatal: false });
    expect((await readPack(new Blob(["not a zip"]), MEERA)).problems[0].fatal).toBe(true);

    const ws = ledgerWorkbook(pack).getWorksheet("Expenses")!;
    expect(ws.getRow(2).getCell(4).value).toBe("Chalai flower market");
    expect(String(ws.getRow(2).getCell(12).value)).toMatch(/^proof\/2027-02-12_Chalai-flower-market_2400_/);
    expect(ws.getRow(3).getCell(12).value).toBe("missing");
  });
});
