import { describe, expect, it } from "vitest";
import type { Expense } from "./expenses";
import { areasOf, cleanVendor, isVendor, mergeVendors, searchVendors, spendByVendor, validateVendors, type Vendor } from "./vendors";

const v = (extra: Partial<Vendor>): Vendor => ({ id: "v1", name: "Chalai Flowers", category: "florist", tags: [], createdAt: "", updatedAt: "", ...extra });
const exp = (vendor: string, amount: number, eventId = "ev1", removed = false): Expense =>
  ({
    id: Math.random().toString(36),
    eventId,
    eventRef: "",
    amount,
    paidOn: "2027-02-12",
    category: "decor",
    vendor,
    payer: { kind: "self", name: "a" },
    method: "cash",
    description: "",
    recordedAt: "",
    recordedBy: "a",
    history: [],
    review: { state: "open" },
    ...(removed ? { removed: { by: "a", at: "", reason: "x" } } : {}),
  }) as Expense;

describe("vendor rolodex", () => {
  it("cleans what's typed: trims, de-duplicates tags and keeps the rating in range", () => {
    const c = cleanVendor(v({ name: "  Chalai Flowers ", phone: " ", tags: [" Jasmine", "jasmine", "", "Late-night "], rating: 7 }));
    expect(c).toMatchObject({ name: "Chalai Flowers", phone: undefined, tags: ["jasmine", "late-night"], rating: undefined });
    expect(cleanVendor(v({ rating: 4.4 })).rating).toBe(4);
    expect(isVendor(v({}))).toBe(true);
    expect(isVendor({ id: "x", name: "y" })).toBe(false);
  });

  it("searches name, area, tags and category, best rated first", () => {
    const list = [
      v({ id: "a", name: "Sree Caterers", category: "catering", area: "Kowdiar", rating: 3, tags: ["sadya"] }),
      v({ id: "b", name: "Malabar Kitchen", category: "catering", area: "Pattom", rating: 5 }),
      v({ id: "c", name: "Chalai Flowers", area: "Chalai", tags: ["jasmine"] }),
    ];
    expect(searchVendors(list, { category: "catering" }).map((x) => x.id)).toEqual(["b", "a"]);
    expect(searchVendors(list, { q: "SADYA" }).map((x) => x.id)).toEqual(["a"]);
    expect(searchVendors(list, { q: "florist" }).map((x) => x.id)).toEqual(["c"]);
    expect(searchVendors(list, { area: "kowdiar" }).map((x) => x.id)).toEqual(["a"]);
    expect(areasOf(list)).toEqual(["Chalai", "Kowdiar", "Pattom"]);
  });

  it("puts the team's list first as read-only, letting a device copy with the same id win", () => {
    const merged = mergeVendors([v({ id: "t1", name: "Team florist" }), v({ id: "v1", name: "Team copy" })], [v({ id: "v1", name: "Mine" })]);
    expect(merged.map((x) => [x.name, !!x.team])).toEqual([["Team florist", true], ["Mine", false]]);
  });

  it("totals what's been paid to each vendor across events, matching names loosely", () => {
    const s = spendByVendor([v({})], [exp("chalai flowers", 2400), exp("Chalai  Flowers.", 600, "ev2"), exp("Chalai Flowers", 999, "ev1", true), exp("Someone else", 50)]);
    expect(s.get("v1")).toEqual({ total: 3000, count: 2, events: 2 });
  });

  it("validates vendors.json", () => {
    expect(validateVendors({ vendors: [{ id: "a", name: "A", category: "florist" }] })).toEqual([]);
    expect(validateVendors({})[0]).toMatch(/"vendors"/);
    const errs = validateVendors({ vendors: [{ id: "a", name: "", category: "x", rating: 9 }, { id: "a", name: "B", category: "florist" }] }).join(" ");
    expect(errs).toMatch(/"name"/);
    expect(errs).toMatch(/"category"/);
    expect(errs).toMatch(/"rating"/);
    expect(errs).toMatch(/used twice/);
  });
});
