import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Brand, Catalog } from "../types";
import { lineFromElement, newProposal } from "../state/proposals";
import { computeTotals } from "./totals";
import { pageSnapshot, snapshotProposal } from "./proposalPage";

const catalog: Catalog = JSON.parse(readFileSync("public/config/catalog.json", "utf8"));
const brand: Brand = JSON.parse(readFileSync("public/config/brand.json", "utf8"));

function proposal() {
  const p = newProposal(brand, []);
  p.client = { name: "Ms. Asha Pillai", contact: "", date: "2027-02-14", venue: "The Leela", location: "Kovalam" };
  p.eventType = "wedding";
  p.style = "christian";
  p.lines = catalog.elements.slice(0, 3).map(lineFromElement);
  p.lines[0].upgrades = [
    { id: "a", name: "Included", price: 1000, mode: "include" },
    { id: "b", name: "Offered", price: 2000, mode: "offer" },
    { id: "c", name: "Not offered", price: 3000, mode: "off" },
  ];
  p.status = "sent";
  p.shareId = "0123456789abcdef0123456789abcdef";
  return p;
}

describe("web page snapshot", () => {
  it("keeps what the preview shows, in the chosen theme, and leaves out the rest", () => {
    const p = proposal();
    const s = pageSnapshot(p, catalog, "solarized-dark", "2026-11-06");
    expect(s).toMatchObject({ v: 1, theme: "solarized-dark", dated: "2026-11-06" });
    expect(s.proposal.client.dates).toEqual(["2027-02-14"]);
    expect(s.proposal.lines[0].upgrades.map((u) => u.name)).toEqual(["Included", "Offered"]);
    expect(s.catalog.ceremonyStyles.map((c) => c.id)).toEqual(["christian"]);
    expect(s.catalog.eventTypes.map((c) => c.id)).toEqual(["wedding"]);
    const text = JSON.stringify(s);
    expect(text).not.toMatch(/shareId|"status"|Not offered|elementId":"/);
  });

  it("renders the same totals as the proposal it came from", () => {
    const p = proposal();
    const back = snapshotProposal(pageSnapshot(p, catalog, "dark"));
    expect(computeTotals(back, brand.gstPct)).toEqual(computeTotals(p, brand.gstPct));
  });
});
