import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { VenueDirectory } from "../types";
import { filterVenues, largestCapacity } from "./venues";
import { validateVenues } from "../config/validate";

const dir: VenueDirectory = JSON.parse(readFileSync("public/config/venues.json", "utf8"));
const all = { q: "", type: "all", area: "all" };
const names = (f: Partial<typeof all>) => filterVenues(dir.venues, { ...all, ...f }).map((v) => v.id);

describe("venue directory", () => {
  it("ships a valid starter list with the five requested venues", () => {
    expect(validateVenues(dir)).toEqual([]);
    expect(dir.venues.map((v) => v.name)).toEqual([
      "Hyatt Regency Trivandrum",
      "Hilton Garden Inn Trivandrum",
      "Vivanta Thiruvananthapuram",
      "Hycinth Hotels",
      "Taj Green Cove Resort & Spa, Kovalam",
    ]);
  });

  it("filters by type and area", () => {
    expect(names({ type: "resort" })).toEqual(["taj-green-cove-kovalam"]);
    expect(names({ type: "venue" })).toEqual([]);
    expect(names({ area: "Thycaud" })).toEqual(["hyatt-regency-trivandrum", "vivanta-thiruvananthapuram"]);
  });

  it("searches names, aliases, areas and spaces with every word", () => {
    expect(names({ q: "kovalam" })).toEqual(["taj-green-cove-kovalam"]);
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
