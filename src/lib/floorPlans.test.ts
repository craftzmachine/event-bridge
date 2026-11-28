import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Brand } from "../types";
import { asProposal, copyIntoWedding, duplicatePlan, fromProposal, isFloorPlan, newPlan, planFromWedding } from "./floorPlans";
import { importGuests } from "./guestList";
import { starterLayout } from "./layout";
import { autoSeat, householdsFor, normalise, tablesOf } from "./seating";
import { newProposal } from "../state/proposals";

const brand = JSON.parse(readFileSync("public/config/brand.json", "utf8")) as Brand;

function seatedPlan() {
  const plan = { ...newPlan("Mock-up", "Taj Green Cove", 40), layout: starterLayout("rounds", 40) };
  let p = asProposal(plan);
  p = { ...p, guestList: { guests: importGuests(p, "Menons,,bride,Family,4\nRahul,,groom,College,1") } };
  // the editor sees every household as coming, so seating works without RSVPs
  const back = fromProposal(plan, p);
  const view = asProposal(back);
  const tables = tablesOf(view.layouts![""]);
  const seated = autoSeat(normalise({}, tables).plan, tables, householdsFor(view, "", false)).plan;
  return fromProposal(back, { ...view, seating: { "": seated } });
}

describe("standalone floor plans", () => {
  it("round-trips through the wedding editor's shape, with every household coming", () => {
    const plan = seatedPlan();
    expect(isFloorPlan(plan)).toBe(true);
    expect(plan.guests.map((g) => [g.name, g.invited])).toEqual([["Menons", 4], ["Rahul", 1]]);
    expect(plan.guests[0].reply).toBeUndefined();
    expect(Object.values(plan.seating!).flat().filter(Boolean)).toHaveLength(5);
    expect(householdsFor(asProposal(plan), "", false).map((h) => h.people.length)).toEqual([4, 1]);
  });

  it("duplicates with fresh ids and seating that follows them", () => {
    const plan = seatedPlan();
    const copy = duplicatePlan(plan);
    expect(copy.id).not.toBe(plan.id);
    expect(copy.layout!.items.map((i) => i.id)).not.toEqual(plan.layout!.items.map((i) => i.id));
    const ids = new Set(copy.guests.map((g) => g.id));
    const keys = Object.values(copy.seating!).flat().filter((k): k is string => !!k);
    expect(keys).toHaveLength(5);
    expect(keys.every((k) => ids.has(k.slice(0, k.lastIndexOf(":"))))).toBe(true);
    expect(Object.keys(copy.seating!).every((t) => copy.layout!.items.some((i) => i.id === t))).toBe(true);
  });

  it("copies a layout into a wedding and saves a wedding's layout as a plan, never the guests", () => {
    const plan = seatedPlan();
    const wedding = { ...newProposal(brand, []), seating: { f1: { x: ["a:0"] } } };
    const w = copyIntoWedding(plan, wedding, "f1");
    expect(w.layouts!.f1.items).toHaveLength(plan.layout!.items.length);
    expect(w.seating!.f1).toBeUndefined();
    expect(w.guestList).toBeUndefined();
    const back = planFromWedding(w, "f1", "Reception");
    expect(back).toMatchObject({ guests: [] });
    expect(back!.name).toContain("Reception");
    expect(planFromWedding(w, "nope", "")).toBeNull();
  });
});
