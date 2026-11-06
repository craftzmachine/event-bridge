import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Brand, Catalog } from "../types";
import { lineFromElement, newProposal } from "../state/proposals";
import { applyCosts, lineCost, marginOf, parseCsv, readCostSheet } from "./margin";
import { computeTotals } from "./totals";
import { buildPdfDoc } from "./exportPdf";
import { buildWorkbook } from "./exportXlsx";
import { pageSnapshot } from "./proposalPage";

const catalog: Catalog = JSON.parse(readFileSync("public/config/catalog.json", "utf8"));
const brand: Brand = JSON.parse(readFileSync("public/config/brand.json", "utf8"));
const el = (id: string) => catalog.elements.find((e) => e.id === id)!;

function quote() {
  const p = newProposal(brand);
  p.client.name = "Ms. Priya Nair";
  p.eventType = "wedding";
  p.style = "hindu";
  p.lines = [
    { ...lineFromElement(el("sound-basic")), cost: 31337 },
    { ...lineFromElement(el("chiavari")), qty: 100, cost: 77.77 },
    { ...lineFromElement(el("lighting")) }, // no cost yet
    { ...lineFromElement(el("fusion-band")), optional: true, cost: 99999 },
  ];
  return p;
}
const flatten = (x: unknown): string => (typeof x === "string" ? x : typeof x === "number" ? String(x) : Array.isArray(x) ? x.map(flatten).join(" ") : x && typeof x === "object" ? Object.values(x).map(flatten).join(" ") : "");

describe("margin", () => {
  it("is the Grand Total less the cost of included lines that have one", () => {
    const p = quote();
    const m = marginOf(p, brand.gstPct);
    expect(lineCost(p.lines[1])).toBe(7777);
    expect(m.cost).toBe(31337 + 7777);
    expect(m.revenue).toBe(computeTotals(p, brand.gstPct).grandTotal);
    expect(m.margin).toBe(Math.round((m.revenue - m.cost) * 100) / 100);
    expect([m.priced, m.costed]).toEqual([3, 2]); // the option's cost isn't counted
  });

  it("reads a cost sheet from Excel rows or CSV, matching catalogue names only", () => {
    const csv = parseCsv(`Element,Cost\n"${el("sound-basic").name}",30000\n"Something else, unknown",100\n"${el("lighting").name}","12,500"\n`);
    expect(csv[1][0]).toBe(el("sound-basic").name);
    const r = readCostSheet(csv, catalog);
    expect(r.costs).toEqual({ "sound-basic": 30000, lighting: 12500 });
    expect(r.unmatched).toEqual(["Something else, unknown"]);
    const filled = applyCosts(quote().lines, r.costs);
    expect(filled[0].cost).toBe(31337); // an entered cost is kept
    expect(filled[2].cost).toBe(12500);
  });

  it("never appears in anything the client gets", () => {
    const p = quote();
    const secrets = /31337|7777|77\.77|99999/;
    expect(flatten(buildPdfDoc(p, catalog, brand))).not.toMatch(secrets);
    const wb = buildWorkbook(p, catalog, brand);
    const cells: string[] = [];
    wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => cells.push(flatten(c.value)))));
    expect(cells.join(" ")).not.toMatch(secrets);
    const snap = JSON.stringify(pageSnapshot(p, catalog, "dark"));
    expect(snap).not.toMatch(secrets);
    expect(snap).not.toContain('"cost"');
  });
});
