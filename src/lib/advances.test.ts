import { describe, expect, it } from "vitest";
import type { Expense } from "./expenses";
import { summarise, filterExpenses, payerLabel } from "./expenses";
import {
  addMovement,
  advanceAlerts,
  advanceState,
  balanceOf,
  canManage,
  checkMovement,
  closeAdvance,
  defaultSettleBy,
  newAdvance,
  openAdvancesFor,
  reopenAdvance,
  reverseMovement,
  settlement,
  spendWarning,
  type Advance,
  type Movement,
} from "./advances";
import { applyReply, canReviewPack, packData, signOff, verifyPack, type ReceivedHandover, type SentHandover } from "./handover";
import { buildPack, ledgerWorkbook, readPack } from "./handoverPack";

const MANAGER = "lakshmi@studio.test";
const RAVI = "ravi@studio.test";
const MEERA = "meera@studio.test";
const NOW = new Date("2027-02-12T10:00:00Z");

const mv = (extra: Partial<Movement> = {}): Movement => ({ id: `m-${Math.random().toString(36).slice(2, 8)}`, kind: "topup", amount: 5000, on: "2027-02-11", method: "cash", by: MANAGER, at: "", ...extra });

function adv(amount = 20000, extra: Partial<Advance> = {}): Advance {
  return {
    ...newAdvance({ id: "a1", eventId: "ev1", eventRef: "20262011-ABC", staff: RAVI, purpose: "Haldi flowers and puja items", first: mv({ id: "m0", kind: "issued", amount }), by: MANAGER, now: NOW }),
    ...extra,
  };
}

function exp(extra: Partial<Expense> = {}): Expense {
  return {
    id: `x-${Math.random().toString(36).slice(2, 8)}`,
    eventId: "ev1",
    eventRef: "20262011-ABC",
    amount: 4000,
    paidOn: "2027-02-12",
    category: "decor",
    vendor: "Chalai flower market",
    payer: { kind: "advance", name: RAVI },
    advanceId: "a1",
    method: "gpay",
    description: "",
    proof: { fileId: "f", name: "s.webp", type: "image/webp", size: 1, sha256: Math.random().toString(16).slice(2), takenFrom: "upload" },
    recordedAt: "2027-02-12T10:00:00.000Z",
    recordedBy: RAVI,
    history: [{ at: "2027-02-12T10:00:00.000Z", by: RAVI, action: "created" }],
    review: { state: "open" },
    ...extra,
  };
}

describe("balances", () => {
  it("counts top-ups, spending, returns and repayments, but not reversed movements or removed expenses", () => {
    let a = adv();
    a = addMovement(a, mv({ id: "t1", amount: 5000 }), MANAGER, NOW);
    a = addMovement(a, mv({ id: "t2", amount: 999 }), MANAGER, NOW);
    a = reverseMovement(a, "t2", MANAGER, "entered twice", NOW);
    const list = [exp({ amount: 6000 }), exp({ amount: 1500.5 }), exp({ amount: 9999, removed: { by: RAVI, at: "", reason: "x" } }), exp({ amount: 50, advanceId: "other" })];
    expect(balanceOf(a, list)).toEqual({ given: 25000, spent: 7500.5, returned: 0, reimbursed: 0, left: 17499.5 });
    a = addMovement(a, mv({ id: "r1", kind: "returned", amount: 17499.5 }), MANAGER, NOW);
    expect(balanceOf(a, list).left).toBe(0);
    expect(a.history.map((h) => h.action)).toEqual(["created", "movement", "movement", "reversed", "movement"]);
    expect(reverseMovement(a, "t2", MANAGER, "again", NOW)).toBe(a);
  });

  it("leaves rejected spending with the staff member, and holds settlement for queries and unreviewed expenses", () => {
    const a = adv(10000);
    const ok = exp({ amount: 3000, review: { state: "checked" } });
    const bad = exp({ amount: 2000, review: { state: "rejected", note: "personal" } });
    const asked = exp({ amount: 1000, review: { state: "queried" } });
    const s = settlement(a, [ok, bad, asked]);
    expect(s.spent).toBe(4000); // the rejected 2,000 doesn't count
    expect(s.accepted).toBe(4000);
    expect(s.due).toBe(6000);
    expect(s.holds).toEqual(["1 expense is queried"]);
    expect(settlement(a, [ok, exp()]).holds).toEqual(["1 expense hasn't been reviewed"]);
  });

  it("counts an expense without proof only once a reviewer has checked it", () => {
    const a = adv(10000);
    const noProof = exp({ amount: 2500, proof: undefined });
    expect(settlement(a, [noProof])).toMatchObject({ spent: 2500, accepted: 0, notAccepted: 2500, due: 10000 });
    expect(settlement(a, [{ ...noProof, review: { state: "checked", note: "no bill from the vendor" } }])).toMatchObject({ accepted: 2500, due: 7500 });
  });

  it("shows an overspend as owed to the staff member, settled by a repayment", () => {
    let a = adv(5000);
    const list = [exp({ amount: 6200, review: { state: "checked" } })];
    expect(settlement(a, list).due).toBe(-1200);
    expect(advanceState(a, list, "2027-02-12")).toBe("over");
    a = addMovement(a, mv({ id: "p1", kind: "reimbursed", amount: 1200 }), MANAGER, NOW);
    expect(settlement(a, list).due).toBe(0);
    expect(advanceState(a, list, "2027-02-12")).toBe("settled");
  });
});

describe("states and alerts", () => {
  it("runs open → low → overdue → closed", () => {
    const a = adv(10000, { settleBy: "2027-02-17" });
    expect(advanceState(a, [], "2027-02-12")).toBe("open");
    const list = [exp({ amount: 8500 })];
    expect(advanceState(a, list, "2027-02-12")).toBe("low");
    expect(advanceAlerts(a, list, NOW, "2027-02-12")).toEqual(["Only ₹1,500 left"]);
    expect(advanceState(a, list, "2027-02-18")).toBe("overdue");
    expect(advanceAlerts(a, list, NOW, "2027-02-18")).toContain("Past its settle-by date");
  });

  it("flags expenses left without proof for more than a day", () => {
    const list = [exp({ proof: undefined, recordedAt: "2027-02-10T08:00:00.000Z" }), exp({ proof: undefined, recordedAt: "2027-02-12T09:00:00.000Z" })];
    expect(advanceAlerts(adv(), list, NOW, "2027-02-12")).toEqual(["1 expense without proof for over 24 h"]);
  });
});

describe("recording money", () => {
  it("blocks a missing amount and a UPI ref already recorded for the event", () => {
    const a = adv(10000, { movements: [mv({ id: "m0", kind: "issued", amount: 10000, upiRef: "412345678901" })] });
    expect(checkMovement({ id: "n", kind: "topup", amount: 0, on: "2027-02-12" }, a, [a], [])).toEqual([{ kind: "block", text: "Enter the amount." }]);
    expect(checkMovement({ id: "n", kind: "topup", amount: 500, on: "2027-02-12", upiRef: "4123 4567 8901" }, a, [a], [])[0].kind).toBe("block");
    expect(checkMovement({ id: "n", kind: "topup", amount: 500, on: "2027-02-12", upiRef: "999" }, a, [a], [exp({ upiRef: "999" })])[0].kind).toBe("block");
    expect(checkMovement({ id: "n", kind: "topup", amount: 500, on: "2027-02-12", upiRef: "555" }, a, [a], [])).toEqual([]);
  });

  it("warns when a return or repayment is more than what's due", () => {
    const a = adv(10000);
    const list = [exp({ amount: 4000, review: { state: "checked" } })];
    expect(checkMovement({ id: "n", kind: "returned", amount: 6000, on: "2027-02-14" }, a, [a], list)).toEqual([]);
    expect(checkMovement({ id: "n", kind: "returned", amount: 7000, on: "2027-02-14" }, a, [a], list)[0]).toMatchObject({ kind: "warn" });
    expect(checkMovement({ id: "n", kind: "reimbursed", amount: 100, on: "2027-02-14" }, a, [a], list)[0].text).toMatch(/doesn't owe/);
  });

  it("warns when an expense goes over the advance or its per-expense limit", () => {
    const a = adv(5000, { limit: 3000 });
    const first = exp({ id: "e1", amount: 2000 });
    expect(spendWarning({ id: "e2", amount: 2500, advanceId: "a1" }, a, [first])).toBeUndefined();
    expect(spendWarning({ id: "e2", amount: 3500, advanceId: "a1" }, a, [first])).toMatch(/limit/);
    expect(spendWarning({ id: "e2", amount: 2900, advanceId: "a1" }, { ...a, limit: undefined }, [first, exp({ amount: 1000 })])).toMatch(/₹900 over/);
    // editing an expense doesn't count its own old amount twice
    expect(spendWarning({ id: "e1", amount: 5000, advanceId: "a1" }, { ...a, limit: undefined }, [first])).toBeUndefined();
  });
});

describe("closing", () => {
  it("closes only when settled, or with a written-off reason, and reopening is recorded", () => {
    const a = adv(10000);
    const list = [exp({ amount: 4000, review: { state: "checked" } })];
    const refused = closeAdvance(a, list, MANAGER, undefined, NOW);
    expect(refused).toEqual({ error: expect.stringContaining("₹6,000 still to be returned") });
    const returned = addMovement(a, mv({ id: "r", kind: "returned", amount: 6000 }), MANAGER, NOW);
    const closed = closeAdvance(returned, list, MANAGER, undefined, NOW);
    if ("error" in closed) throw new Error(closed.error);
    expect(closed.advance.closed).toMatchObject({ by: MANAGER, writtenOff: undefined });
    expect(advanceState(closed.advance, list, "2027-03-01")).toBe("closed");
    expect(closeAdvance(closed.advance, list, MANAGER)).toEqual({ error: "This advance is already closed." });

    const off = closeAdvance(a, list, MANAGER, "Cash lost at the venue", NOW);
    if ("error" in off) throw new Error(off.error);
    expect(off.advance.closed).toMatchObject({ writtenOff: 6000, note: "Cash lost at the venue" });
    const again = reopenAdvance(off.advance, MANAGER, "Found the receipt", NOW);
    expect(again.closed).toBeUndefined();
    expect(again.history.at(-1)).toMatchObject({ action: "reopened", note: "Found the receipt" });
  });
});

describe("helpers", () => {
  it("decides who manages, which advances an expense can use, and the settle-by date", () => {
    expect(canManage(undefined, RAVI)).toBe(true);
    expect(canManage([" Lakshmi@Studio.test"], MANAGER)).toBe(true);
    expect(canManage([MANAGER], RAVI)).toBe(false);
    const mine = adv(1000, { id: "b", staff: MEERA, createdAt: "2027-02-12T11:00:00Z" });
    const closed = adv(1000, { id: "c", closed: { by: MANAGER, at: "" } });
    expect(openAdvancesFor([adv(), mine, closed, adv(1, { id: "d", eventId: "ev2" })], "ev1", MEERA).map((a) => a.id)).toEqual(["b", "a1"]);
    expect(defaultSettleBy(["2027-02-14", "2027-02-12"])).toBe("2027-02-17");
    expect(defaultSettleBy([])).toBeUndefined();
  });

  it("shows advance spending as its own line in the totals and the payer filter", () => {
    const list = [exp({ amount: 1000 }), exp({ amount: 500, payer: { kind: "self", name: RAVI }, advanceId: undefined })];
    const s = summarise(list);
    expect(s.byPayer.map((x) => [x.key, x.label, x.total])).toEqual([["a:a1", `${RAVI}'s advance`, 1000], [`p:${RAVI}`, RAVI, 500]]);
    expect(filterExpenses(list, { payer: "a:a1" })).toHaveLength(1);
    expect(payerLabel({ payer: { kind: "company", name: "" } })).toBe("Company account");
  });
});

describe("handover with advances", () => {
  const event = { id: "ev1", ref: "20262011-ABC", client: "Ms. Ananya Menon", title: "Hindu Wedding", dates: ["2027-02-14"], venue: "Taj Green Cove", functions: [] };
  const cats = [{ id: "decor", label: "Décor & flowers" }];

  it("works out the settlement after review, and the reply notes it on the advance", () => {
    const a = adv(10000);
    const x1 = exp({ id: "x1", amount: 3000 });
    const x2 = exp({ id: "x2", amount: 2000 });
    const pack = packData({ id: "h1", event, from: RAVI, note: "", categories: cats, expenses: [x1, x2], advances: [a] });
    expect(pack.v).toBe(2);
    const rx: ReceivedHandover = { id: "h1", pack, receivedAt: "", reviewer: MEERA, reviews: { x1: { state: "checked" }, x2: { state: "rejected", note: "personal" } }, state: "reviewing" };
    const r = signOff(rx, NOW);
    if (!r.ok) throw new Error("expected a sign-off");
    expect(r.state).toBe("returned");
    expect(r.reply.settlements).toEqual({ a1: { due: 7000 } });

    const sent: SentHandover = { id: "h1", eventId: "ev1", from: RAVI, createdAt: "", expenseIds: ["x1", "x2"], total: 5000, state: "sent" };
    const applied = applyReply(r.reply, [sent], [x1, x2], [a]);
    if ("error" in applied) throw new Error(applied.error);
    expect(applied.expenses.find((e) => e.id === "x2")!.review.state).toBe("rejected");
    expect(applied.advances[0].history.at(-1)).toMatchObject({ action: "reviewed", by: MEERA, note: "Settlement after review: ₹ 7,000.00 to return" });
    expect(settlement(applied.advances[0], applied.expenses).due).toBe(7000);
    // the manager who gave the money can't sign the reply
    expect(applyReply({ ...r.reply, reviewer: MANAGER }, [sent], [x1, x2], [a])).toHaveProperty("error");
  });

  it("refuses a reviewer who gave or held the money, and still reads a v1 pack", async () => {
    const a = adv(10000);
    const pack = packData({ id: "h2", event, from: RAVI, note: "", categories: cats, expenses: [exp({ id: "x", proof: undefined, recordedBy: "someone@studio.test", history: [] })], advances: [a] });
    expect(canReviewPack(pack, MANAGER)).toBe(false);
    expect(canReviewPack(pack, RAVI)).toBe(false);
    expect(canReviewPack(pack, MEERA)).toBe(true);
    expect(verifyPack(pack, {}, MANAGER).problems[0]).toMatchObject({ fatal: true, text: expect.stringContaining("advances") });

    const { advances: _a, ...rest } = pack;
    const v1 = verifyPack({ ...rest, v: 1 }, {}, MEERA);
    expect(v1.problems).toEqual([]);
    expect(v1.pack!.advances).toEqual([]);
    expect(verifyPack({ ...rest, v: 2 }, {}, MEERA).problems[0].fatal).toBe(true);

    const zip = await buildPack(pack, new Map());
    const back = await readPack(zip, MEERA);
    expect(back.pack!.advances.map((x) => x.id)).toEqual(["a1"]);
    const sheet = ledgerWorkbook(pack).getWorksheet("Advances")!;
    expect(sheet.getRow(2).getCell(1).value).toBe(RAVI);
    expect(sheet.getRow(2).getCell(3).value).toBe(10000);
    expect(sheet.getRow(2).getCell(8).value).toBe("₹ 10,000.00 to return");
    expect(ledgerWorkbook({ ...pack, advances: [] }).getWorksheet("Advances")).toBeUndefined();
  });
});
