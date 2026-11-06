import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Brand, Catalog, Proposal } from "../types";
import { lineFromElement, newProposal } from "../state/proposals";
import { computeTotals, functionTotals } from "./totals";
import { byFunction, fnOf, removeFunction } from "./functions";
import { buildWorkbook } from "./exportXlsx";
import { buildPdfDoc } from "./exportPdf";
import { readWorkbook } from "./readWorkbook";
import { convertWorkbook } from "./excelImport";
import { pageSnapshot } from "./proposalPage";
import { validatePage } from "../../server/page";

const catalog: Catalog = JSON.parse(readFileSync("public/config/catalog.json", "utf8"));
const brand: Brand = JSON.parse(readFileSync("public/config/brand.json", "utf8"));
const el = (id: string) => catalog.elements.find((e) => e.id === id)!;
const flatten = (x: unknown): string => (typeof x === "string" ? x : Array.isArray(x) ? x.map(flatten).join(" ") : x && typeof x === "object" ? Object.values(x).map(flatten).join(" ") : "");

/** Haldi on the 12th, Muhurtham on the 14th, Reception with no date yet */
function wedding(): Proposal {
  const p = newProposal(brand);
  p.client = { name: "Ms. Ananya Menon", contact: "", date: "2027-02-12", dates: ["2027-02-12", "2027-02-14"], venue: "Taj Green Cove", location: "Kovalam" };
  p.eventType = "wedding";
  p.style = "hindu";
  p.functions = [
    { id: "fh", label: "Haldi", date: "2027-02-12" },
    { id: "fm", label: "Muhurtham", date: "2027-02-14" },
    { id: "fr", label: "Reception", date: "" },
  ];
  p.lines = [
    { ...lineFromElement(el("sound-basic")), fn: "fh" },
    { ...lineFromElement(el("ceremonial")), fn: "fm" },
    { ...lineFromElement(el("lighting")), fn: "fm" },
    { ...lineFromElement(el("chiavari")), qty: 150, fn: "fr" },
    { ...lineFromElement(el("fusion-band")), optional: true, fn: "fr" },
  ];
  return p;
}

describe("functions", () => {
  it("subtotals add up to the Sub Total, and options stay out", () => {
    const p = wedding();
    const subs = functionTotals(p);
    expect(subs.map((s) => s.fn.label)).toEqual(["Haldi", "Muhurtham", "Reception"]);
    expect(subs.reduce((t, s) => t + s.subTotal, 0)).toBe(computeTotals(p, brand.gstPct).subTotal);
    expect(functionTotals({ ...p, functions: [] })).toEqual([]);
  });

  it("puts a line without a known function in the first one, and moves lines off a removed function", () => {
    const p = wedding();
    expect(fnOf(p, { fn: "gone" })).toBe("fh");
    expect(fnOf({ functions: [] }, { fn: "fh" })).toBeNull();
    expect(byFunction({ functions: [] }, p.lines)).toEqual([{ fn: null, lines: p.lines }]);
    const after = removeFunction(p, "fm");
    expect(after.functions!.map((f) => f.id)).toEqual(["fh", "fr"]);
    expect(after.lines.filter((l) => l.fn === "fh")).toHaveLength(3);
  });

  it("shows each function with its subtotal in the PDF", () => {
    const text = flatten(buildPdfDoc(wedding(), catalog, brand).content);
    expect(text).toContain("Haldi — 12th February 2027");
    expect(text).toContain("Muhurtham subtotal");
    expect(text).toContain("Reception subtotal");
  });

  it("writes function rows and subtotals in Excel, and the Sub Total adds the subtotals", () => {
    const p = wedding();
    const ws = buildWorkbook(p, catalog, brand).getWorksheet("Proposal")!;
    const rows: { r: number; a: unknown; b: unknown; g: unknown }[] = [];
    ws.eachRow((row, r) => rows.push({ r, a: row.getCell(1).value, b: row.getCell(2).value, g: row.getCell(7).value }));
    expect(rows.filter((x) => typeof x.a === "string" && x.a.startsWith("FUNCTION: ")).map((x) => x.a)).toEqual([
      "FUNCTION: Haldi — 12th February 2027",
      "FUNCTION: Muhurtham — 14th February 2027",
      "FUNCTION: Reception",
    ]);
    const subRows = rows.filter((x) => typeof x.b === "string" && / subtotal$/.test(x.b));
    expect(subRows).toHaveLength(3);
    const sub = rows.find((x) => x.b === "Sub Total")!;
    expect((sub.g as { formula: string }).formula).toBe(subRows.map((x) => `G${x.r}`).join("+"));
    expect((sub.g as { result: number }).result).toBe(computeTotals(p, brand.gstPct).subTotal);
  });

  it("round-trips through the Excel export with its functions", async () => {
    const p = wedding();
    const buf = await buildWorkbook(p, catalog, brand).xlsx.writeBuffer();
    const r = convertWorkbook(await readWorkbook("P.xlsx", buf as ArrayBuffer), { catalog, brand, takenRefs: [] });
    if (r.status !== "ready") throw new Error(JSON.stringify(r));
    const back = r.proposal;
    expect(back.functions!.map(({ label, date }) => ({ label, date }))).toEqual(p.functions!.map(({ label, date }) => ({ label, date })));
    const fnLabel = (x: Proposal, id?: string) => x.functions!.find((f) => f.id === id)?.label;
    const byName = (x: Proposal) => Object.fromEntries(x.lines.map((l) => [l.name, fnLabel(x, l.fn)]));
    // the additional option sits on its own sheet, so it comes back without a function, which means the first
    expect(byName(back)).toEqual({ ...byName(p), [el("fusion-band").name]: undefined });
    expect(computeTotals(back, brand.gstPct).grandTotal).toBe(computeTotals(p, brand.gstPct).grandTotal);
  });

  it("carry through the web page snapshot and the server's check", () => {
    const s = pageSnapshot(wedding(), catalog, "parinay", "2026-11-06");
    expect(s.proposal.functions).toHaveLength(3);
    expect(s.proposal.lines.map((l) => l.fn)).toEqual(["fh", "fm", "fm", "fr", "fr"]);
    const checked = validatePage(JSON.stringify({ ...s, proposal: { ...s.proposal, functions: [...s.proposal.functions!, { id: "<x>", label: "Bad", date: "soon" }] } }));
    if ("error" in checked) throw new Error(checked.error);
    const page = checked.page as { proposal: { functions: { id: string; date: string }[]; lines: { fn?: string }[] } };
    expect(page.proposal.functions.map((f) => f.id)).toEqual(["fh", "fm", "fr"]);
    expect(page.proposal.lines.map((l) => l.fn)).toEqual(["fh", "fm", "fm", "fr", "fr"]);
  });
});

