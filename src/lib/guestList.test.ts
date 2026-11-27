import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Brand, Proposal } from "../types";
import { newProposal } from "../state/proposals";
import { guestCode, importGuests, inviteSnapshot, invitedTo, isCode, mergeRsvp, rsvpSummary } from "./guestList";
import { pageSnapshot } from "./proposalPage";
import { portalSnapshot } from "./portal";

const brand = JSON.parse(readFileSync("public/config/brand.json", "utf8")) as Brand;

function wedding(): Proposal {
  const p = newProposal(brand, []);
  p.client = { ...p.client, name: "Priya & Arjun", venue: "Taj Green Cove", location: "Kovalam" };
  p.functions = [
    { id: "f1", label: "Sangeet", date: "2027-02-13" },
    { id: "f2", label: "Wedding", date: "2027-02-14" },
  ];
  return p;
}

describe("guest list and RSVP", () => {
  it("imports pasted rows, skipping a header, with party sizes and sides", () => {
    const p = wedding();
    const gs = importGuests(p, "Name\tPhone\tSide\tGroup\tParty\nThe Menon family\t9847012345\tBride\tFamily\t4\nRahul, , groom, Work,\n\n");
    expect(gs.map((g) => [g.name, g.side, g.invited, g.group])).toEqual([["The Menon family", "bride", 4, "Family"], ["Rahul", "groom", 1, "Work"]]);
    expect(gs.every((g) => isCode(g.code) && g.fns.join() === "f1,f2")).toBe(true);
    expect(isCode(guestCode())).toBe(true);
  });

  it("sums people per function and merges newer replies only", () => {
    const p = wedding();
    p.guestList = { guests: importGuests(p, "Menons,,,,4\nRahul"), rsvp: { meals: ["Veg"], open: true } };
    const [m, r] = p.guestList.guests;
    const merged = mergeRsvp(p, {
      [m.code]: { replies: { f1: { status: "yes", count: 3 }, f2: { status: "no", count: 0 } }, meal: "Veg", at: Date.parse("2026-12-01") },
      "open-0123456789abcdef": { name: "Asha", phone: "9847012345", replies: { f2: { status: "yes", count: 2 } }, at: Date.parse("2026-12-02") },
    })!;
    expect(rsvpSummary(merged).map((s) => [s.fn.id, s.yes, s.no, s.pending])).toEqual([["f1", 3, 0, 1], ["f2", 2, 4, 1]]);
    expect(merged.guestList!.guests.find((g) => g.source === "rsvp")?.name).toBe("Asha");
    // an older reply doesn't overwrite a newer one
    expect(mergeRsvp(merged, { [m.code]: { replies: { f1: { status: "no", count: 0 } }, at: Date.parse("2026-11-01") } })).toBeNull();
    expect(invitedTo(merged, r)).toEqual(["f1", "f2"]);
  });

  it("sends the server only names, party sizes and functions, and keeps guests off the shared proposal", () => {
    const p = wedding();
    p.guestList = { guests: importGuests(p, "Menons\t9847012345\tbride\tFamily\t4") };
    const inv = inviteSnapshot(p, brand, { meals: [], open: false });
    expect(Object.keys(inv.guests[0]).sort()).toEqual(["code", "fns", "invited", "name"]);
    const catalog = JSON.parse(readFileSync("public/config/catalog.json", "utf8"));
    expect(JSON.stringify(pageSnapshot(p, catalog, "dark"))).not.toContain("Menons");
    expect(JSON.stringify(portalSnapshot(p, catalog, brand, "dark"))).not.toContain("Menons");
  });
});
