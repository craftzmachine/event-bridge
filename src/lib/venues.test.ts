import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { VenueDirectory } from "../types";
import { filterVenues, largestCapacity } from "./venues";
import { validateVenues } from "../config/validate";

const dir: VenueDirectory = JSON.parse(readFileSync("public/config/venues.json", "utf8"));
const all = { q: "", type: "all", area: "all" };
const names = (f: Partial<typeof all>) => filterVenues(dir.venues, { ...all, ...f }).map((v) => v.id);

describe("venue directory", () => {
  it("ships a valid list: the five starter venues first, then the team's convention centres and resorts", () => {
    expect(validateVenues(dir)).toEqual([]);
    expect(dir.venues).toHaveLength(29);
    expect(dir.venues.every((v) => v.sources?.length)).toBe(true);
    expect(dir.venues.slice(0, 5).map((v) => v.name)).toEqual([
      "Hyatt Regency Trivandrum",
      "Hilton Garden Inn Trivandrum",
      "Vivanta Thiruvananthapuram",
      "Hycinth Hotels",
      "Taj Green Cove Resort & Spa, Kovalam",
    ]);
  });

  it("filters by type and area", () => {
    expect(names({ type: "resort" })).toHaveLength(10);
    expect(names({ type: "venue" })).toHaveLength(15);
    expect(names({ type: "resort", area: "Poovar" })).toEqual(["poovar-island-resort", "estuary-sarovar-premiere-poovar"]);
    expect(names({ area: "Thycaud" })).toEqual(["hyatt-regency-trivandrum", "vivanta-thiruvananthapuram"]);
  });

  it("searches names, aliases, areas and spaces with every word", () => {
    expect(names({ q: "leela kovalam" })).toEqual(["the-leela-kovalam"]);
    expect(names({ q: "al saj kazhakkoottam" })).toEqual(["al-saj-international-convention-centre", "al-saj-amaranta"]);
    expect(names({ q: "technopark" })).toEqual(["al-saj-amaranta"]);
    expect(names({ q: "sparsa" })).toEqual(["hycinth-hotels"]);
    expect(names({ q: "great hall" })).toEqual(["hyatt-regency-trivandrum"]);
    expect(names({ q: "rooftop thycaud" })).toEqual(["vivanta-thiruvananthapuram"]);
    expect(names({ q: "nowhere" })).toEqual([]);
  });

  it("finds the largest stated capacity", () => {
    expect(largestCapacity(dir.venues[0])).toBe(1000);
    expect(largestCapacity(dir.venues[1])).toBeUndefined();
  });

  it("reports readable errors", () => {
    const bad = structuredClone(dir);
    bad.venues[0].type = "castle";
    bad.venues[1].stars = 7;
    expect(validateVenues(bad)).toEqual([
      `Venue "hyatt-regency-trivandrum" has unknown type "castle".`,
      `Venue "hilton-garden-inn-trivandrum" "stars" must be 1–5.`,
    ]);
  });
});
