import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { Brand, Catalog } from "../types";
import { buildWorkbook } from "./exportXlsx";
import { exportFileName } from "./proposal";
import { newProposal, lineFromElement } from "../state/proposals";
import { validateBrand, validateCatalog } from "../config/validate";

const catalog: Catalog = JSON.parse(readFileSync("public/config/catalog.json", "utf8"));
const brand: Brand = JSON.parse(readFileSync("public/config/brand.json", "utf8"));
const el = (id: string) => catalog.elements.find((e) => e.id === id)!;

describe("shipped config", () => {
  it("validates", () => {
    expect(validateCatalog(catalog)).toEqual([]);
    expect(validateBrand(brand)).toEqual([]);
  });
  it("reports readable errors", () => {
    const bad = structuredClone(catalog);
    bad.elements[0].category = "decor2";
    bad.elements[1].ceremonyStyles = ["sikh"];
    expect(validateCatalog(bad)).toEqual([
      `Element "welcome-board" has unknown category "decor2".`,
      `Element "entrance-arch" has unknown ceremonyStyles entry "sikh".`,
    ]);
  });
});

describe("excel export", () => {
  it("writes items, formulas, options and terms", async () => {
    const p = newProposal(brand);
    p.client = { name: "Ms. Monah", contact: "", date: "2027-06-21", venue: "KTDC Samudra", location: "Kovalam" };
    p.eventType = "wedding";
    p.style = "hindu";
    const sound = lineFromElement(el("sound-basic"));
    sound.upgrades[0].mode = "include";
    const lighting = lineFromElement(el("lighting"));
    lighting.upgrades[0].mode = "offer";
    const band = { ...lineFromElement(el("fusion-band")), optional: true };
    p.lines = [lineFromElement(el("chiavari")), lineFromElement(el("ceremonial")), sound, lighting, lineFromElement(el("transport")), band];
    p.grandTotal = 140000;

    const wb = buildWorkbook(p, catalog, brand);
    const buf = await wb.xlsx.writeBuffer();
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buf as ArrayBuffer);

    expect(back.worksheets.map((w) => w.name)).toEqual(["Proposal", "Additional Options", "Terms"]);
    const ws = back.getWorksheet("Proposal")!;
    const rows: Record<string, ExcelJS.Row> = {};
    ws.eachRow((r) => {
      const label = String(r.getCell(2).value ?? "");
      if (label) rows[label] = r;
    });
    expect(rows["Golden Chiavari chairs with tie-back"].getCell(7).value).toMatchObject({ formula: expect.stringMatching(/^D\d+\*F\d+$/), result: 24000 });
    expect(rows["All ceremonial arrangements for the wedding"].getCell(7).value).toBe("As per actuals");
    expect(rows["   + Line-array sound for live band"].getCell(6).value).toBe(35000);
    // subtotal = 24000 + 16000 + 35000 + 9000 + 18000
    const sub = rows["Sub Total"].getCell(7).value as ExcelJS.CellFormulaValue;
    expect(sub.formula).toMatch(/^SUM\(G\d+:G\d+\)$/);
    expect(sub.result).toBe(102000);
    expect((rows["Grand Total"].getCell(7).value as ExcelJS.CellFormulaValue).result).toBe(140000);
    expect(rows["Rounded Off"].getCell(7).value).toBe(140000 - 102000 * 1.03);
    expect(rows["Sub Total"].getCell(7).numFmt).toContain("₹");

    const os = back.getWorksheet("Additional Options")!;
    const opts: string[] = [];
    os.eachRow((r, n) => n >= 5 && r.getCell(2).value && opts.push(String(r.getCell(2).value)));
    expect(opts).toContain("Instrumental fusion band");
    expect(opts).toContain("Upgrade: Moving-head lights & haze");
    const total = os.getRow(os.rowCount).getCell(7).value as ExcelJS.CellFormulaValue;
    expect(total.result).toBe(48000);

    const ts = back.getWorksheet("Terms")!;
    expect(ts.getCell("B3").value).toBe(brand.terms[0]);

    expect(exportFileName(p, catalog)).toBe("Proposal_Ms_Monah_Hindu_Wedding_2027-06-21.xlsx");
  });
});
