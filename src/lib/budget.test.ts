import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Brand, Catalog, VenueDirectory } from "../types";
import { lineFromElement, newProposal } from "../state/proposals";
import { budgetState, budgetSuggestions, swapLine } from "./budget";
import { applyGuests, capacityWarning, guestQty } from "./guests";

const catalog: Catalog = JSON.parse(readFileSync("public/config/catalog.json", "utf8"));
const brand: Brand = JSON.parse(readFileSync("public/config/brand.json", "utf8"));
const venues: VenueDirectory = JSON.parse(readFileSync("public/config/venues.json", "utf8"));

describe("budget", () => {
  it("is under, near (within 5%) or over", () => {
    expect(budgetState(100, null)).toEqual({ kind: "none" });
    expect(budgetState(80, 100)).toMatchObject({ kind: "under", diff: 20 });
    expect(budgetState(96, 100).kind).toBe("near");
    expect(budgetState(120, 100)).toMatchObject({ kind: "over", diff: -20 });
  });

  it("suggests the closest cheaper element in the same category, biggest saving first", () => {
    const p = newProposal(brand);
    p.eventType = "wedding";
    p.style = "hindu";
    // the priciest décor element that has a cheaper one beside it
    const decor = catalog.elements.filter((e) => e.category === "decor" && e.defaultPrice !== null && e.eventTypes.includes("*") && e.ceremonyStyles.includes("*"));
    const top = [...decor].sort((a, b) => b.defaultPrice! - a.defaultPrice!)[0];
    p.lines = [{ ...lineFromElement(top), qty: 2, notes: "keep me", fn: "f1" }];
    const [s] = budgetSuggestions(p, catalog);
    expect(s.alt.category).toBe("decor");
    expect(s.alt.defaultPrice!).toBeLessThan(top.defaultPrice!);
    expect(s.saving).toBe((top.defaultPrice! - s.alt.defaultPrice!) * 2);
    const swapped = swapLine(p.lines[0], lineFromElement(s.alt));
    expect(swapped).toMatchObject({ uid: p.lines[0].uid, elementId: s.alt.id, qty: 2, notes: "keep me", fn: "f1", rate: s.alt.defaultPrice });
    // already-chosen alternatives and optional lines aren't suggested
    p.lines.push({ ...lineFromElement(s.alt) });
    expect(budgetSuggestions(p, catalog).some((x) => x.alt.id === s.alt.id)).toBe(false);
  });
});

describe("guests", () => {
  it("rounds per-guest quantities up", () => {
    expect(guestQty(650, 1)).toBe(650);
    expect(guestQty(650, 0.1)).toBe(65);
    expect(guestQty(655, 0.1)).toBe(66);
    expect(guestQty(0, 1)).toBe(0);
  });

  it("updates only the lines that follow the guest count", () => {
    const p = newProposal(brand);
    const a = { ...lineFromElement(catalog.elements[0]), perGuest: 0.5, qty: 1 };
    const b = { ...lineFromElement(catalog.elements[1]), qty: 3 };
    const next = applyGuests([a, b], 400);
    expect(next[0].qty).toBe(200);
    expect(next[1]).toBe(b);
    expect(applyGuests(p.lines, null)).toBe(p.lines);
  });

  it("warns when the guests exceed the venue's largest space", () => {
    const v = venues.venues.find((x) => x.spaces.some((s) => s.capacity))!;
    const cap = Math.max(...v.spaces.map((s) => s.capacity ?? 0));
    const p = newProposal(brand);
    p.client.venue = v.name.toUpperCase();
    p.client.guests = cap;
    expect(capacityWarning(p, venues.venues)).toBeNull();
    p.client.guests = cap + 1;
    expect(capacityWarning(p, venues.venues)).toContain(v.name);
    p.client.venue = "A hall not in the directory";
    expect(capacityWarning(p, venues.venues)).toBeNull();
  });
});
