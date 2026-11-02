import { describe, expect, it } from "vitest";
import type { Line } from "../types";
import { computeTotals, lineAmount, roundOffSuggestions } from "./totals";
import { formatINR, groupINR } from "./format";

const line = (over: Partial<Line> = {}): Line => ({
  uid: Math.random().toString(36),
  elementId: "x",
  name: "Item",
  category: "decor",
  unit: "nos",
  qty: 1,
  rate: 1000,
  notes: "",
  optional: false,
  upgrades: [],
  ...over,
});

describe("totals", () => {
  it("adds included lines and co-ordination", () => {
    const t = computeTotals({ lines: [line({ qty: 150, rate: 160 }), line({ rate: 95000 })], coordinationPct: 3, grandTotal: null }, 18);
    expect(t.subTotal).toBe(119000);
    expect(t.coordination).toBe(3570);
    expect(t.grandTotal).toBe(122570);
    expect(t.roundOff).toBe(0);
    expect(t.gst).toBe(22062.6);
  });

  it("keeps paise on co-ordination", () => {
    const t = computeTotals({ lines: [line({ rate: 428450 })], coordinationPct: 3, grandTotal: null }, 18);
    expect(t.coordination).toBe(12853.5);
  });

  it("excludes as-per-actuals and additional options from the Grand Total", () => {
    const t = computeTotals(
      { lines: [line({ rate: 10000 }), line({ rate: null, name: "Ceremonial" }), line({ rate: 30000, optional: true })], coordinationPct: 0, grandTotal: null },
      18,
    );
    expect(t.subTotal).toBe(10000);
    expect(t.optionsTotal).toBe(30000);
    expect(t.asPerActuals.map((l) => l.name)).toEqual(["Ceremonial"]);
  });

  it("adds included upgrades to the line and lists offered ones as options", () => {
    const l = line({
      rate: 16000,
      upgrades: [
        { id: "a", name: "Line array", price: 35000, mode: "include" },
        { id: "b", name: "Moving heads", price: 18000, mode: "offer" },
        { id: "c", name: "Unused", price: 999, mode: "off" },
      ],
    });
    expect(lineAmount(l)).toBe(51000);
    const t = computeTotals({ lines: [l], coordinationPct: 0, grandTotal: null }, 18);
    expect(t.subTotal).toBe(51000);
    expect(t.optionsTotal).toBe(18000);
  });

  it("derives the round-off from the quoted Grand Total", () => {
    const t = computeTotals({ lines: [line({ rate: 428450 })], coordinationPct: 3, grandTotal: 440000 }, 18);
    expect(t.beforeRound).toBe(441303.5);
    expect(t.roundOff).toBe(-1303.5);
    expect(roundOffSuggestions(t.beforeRound)).toEqual([440000, 441000]);
  });
});

describe("format", () => {
  it("uses Indian grouping", () => {
    expect(groupINR(441303.5)).toBe("4,41,303.50");
    expect(groupINR(12345678)).toBe("1,23,45,678.00");
    expect(groupINR(999)).toBe("999.00");
    expect(formatINR(-1303.5)).toBe("(₹ 1,303.50)");
  });
});
