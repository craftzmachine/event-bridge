import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { VenueDirectory } from "../types";
import { filterVenues, largestCapacity } from "./venues";
import { validateVenues } from "../config/validate";

const dir: VenueDirectory = JSON.parse(readFileSync("public/config/venues.json", "utf8"));
const all = { q: "", type: "all", area: "all" };
const names = (f: Partial<typeof all>) => filterVenues(dir.venues, { ...all, ...f }).map((v) => v.id);

describe("venue directory", () => {
  it("ships a valid list with Taj Green Cove featured first", () => {
    expect(validateVenues(dir)).toEqual([]);
    expect(dir.venues).toHaveLength(29);
    expect(dir.venues.every((v) => v.sources?.length)).toBe(true);
    expect(dir.venues.filter((v) => v.featured).map((v) => v.id)).toEqual(["taj-green-cove-kovalam"]);
    expect(dir.venues.slice(0, 5).map((v) => v.name)).toEqual([
      "Taj Green Cove Resort & Spa, Kovalam",
      "Hyatt Regency Trivandrum",
      "Hilton Garden Inn Trivandrum",
      "Vivanta Thiruvananthapuram",
      "Hycinth Hotels",
    ]);
  });

  it("only shows photos of the actual venue, each with a licence credit", () => {
    const withPhoto = dir.venues.filter((v) => v.photo);
    expect(withPhoto.map((v) => v.id)).toEqual(["taj-green-cove-kovalam", "the-leela-kovalam"]);
    for (const v of withPhoto) {
      expect(v.photoIsRepresentative).toBe(false);
      expect(v.photo?.startsWith("https://upload.wikimedia.org/")).toBe(true);
      expect(v.photoCredit?.source.startsWith("https://commons.wikimedia.org/wiki/File:")).toBe(true);
      expect(v.sources).toContain(v.photoCredit?.source);
    }
  });

  it("filters by type and area", () => {
    expect(names({ type: "resort" })).toHaveLength(10);
    expect(names({ type: "venue" })).toHaveLength(15);
    expect(names({ type: "resort", area: "Poovar" })).toEqual(["poovar-island-resort", "estuary-sarovar-premiere-poovar", "havelia-island-resort"]);
    expect(names({ area: "Thycaud" })).toEqual(["hyatt-regency-trivandrum", "vivanta-thiruvananthapuram"]);
  });

  it("searches names, aliases, areas, descriptions and spaces with every word", () => {
    expect(names({ q: "leela kovalam" })).toEqual(["the-leela-kovalam"]);
    expect(names({ q: "al saj kazhakkoottam" })).toEqual(["al-saj-international-convention-centre", "al-saj-amaranta"]);
    expect(names({ q: "technopark" })).toEqual(["al-saj-amaranta"]);
    expect(names({ q: "sparsa" })).toEqual(["hycinth-hotels"]);
    expect(names({ q: "great hall" })).toEqual(["hyatt-regency-trivandrum"]);
    expect(names({ q: "rooftop thycaud" })).toEqual(["vivanta-thiruvananthapuram"]);
    expect(names({ q: "floating cottages" })).toEqual(["poovar-island-resort"]);
    expect(names({ q: "nowhere" })).toEqual([]);
  });

  it("finds the largest stated capacity", () => {
    expect(largestCapacity(dir.venues[0])).toBe(3000);
    expect(largestCapacity(dir.venues.find((v) => v.id === "hyatt-regency-trivandrum")!)).toBe(1000);
    expect(largestCapacity(dir.venues.find((v) => v.id === "hilton-garden-inn-trivandrum")!)).toBeUndefined();
  });

  it("reports readable errors", () => {
    const bad = structuredClone(dir);
    bad.venues[1].type = "castle";
    bad.venues[2].stars = 7;
    bad.venues[3].photo = "https://example.com/hotel.jpg";
    bad.venues[4].featured = true;
    expect(validateVenues(bad)).toEqual([
      `Venue "hyatt-regency-trivandrum" has unknown type "castle".`,
      `Venue "hilton-garden-inn-trivandrum" "stars" must be 1–5.`,
      `Venue "vivanta-thiruvananthapuram" has a photo but no "photoCredit" (author, license and source).`,
      `Only one venue can be "featured".`,
    ]);
  });
});
