import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Brand, Catalog, Proposal } from "../types";
import { buildWorkbook } from "./exportXlsx";
import { computeTotals } from "./totals";
import { lineFromElement, newProposal, isProposal } from "../state/proposals";
import { convertWorkbook, parseDateText, parseNumber, SKIP, type Answers, type ConvertResult, type WorkbookGrid } from "./excelImport";
import { readWorkbook, ReadError } from "./readWorkbook";

const catalog: Catalog = JSON.parse(readFileSync("public/config/catalog.json", "utf8"));
const brand: Brand = JSON.parse(readFileSync("public/config/brand.json", "utf8"));
const el = (id: string) => catalog.elements.find((e) => e.id === id)!;
const ctx = { catalog, brand, takenRefs: [] as string[] };

const ids = (r: ConvertResult) => (r.status === "questions" ? r.questions.map((q) => q.id) : []);
function ready(r: ConvertResult): Proposal {
  if (r.status !== "ready") throw new Error(`expected ready, got ${r.status}: ${JSON.stringify(r.status === "questions" ? r.questions : r)}`);
  return r.proposal;
}

describe("reading values", () => {
  it("reads rupee amounts as people type them", () => {
    expect(parseNumber("₹ 65,000.00")).toBe(65000);
    expect(parseNumber("1,20,000/-")).toBe(120000);
    expect(parseNumber("Rs. 500")).toBe(500);
    expect(parseNumber("about 500")).toBeNull();
  });

  it("reads the date forms the app writes and people type", () => {
    expect(parseDateText("12th & 14th February 2027").dates).toEqual(["2027-02-12", "2027-02-14"]);
    expect(parseDateText("12th, 14th & 15th February 2027").dates).toEqual(["2027-02-12", "2027-02-14", "2027-02-15"]);
    expect(parseDateText("28th February 2027 · 1st March 2027").dates).toEqual(["2027-02-28", "2027-03-01"]);
    expect(parseDateText("Feb 12, 2027").dates).toEqual(["2027-02-12"]);
    expect(parseDateText("2027-02-12").dates).toEqual(["2027-02-12"]);
    expect(parseDateText("25/12/2027").dates).toEqual(["2027-12-25"]);
  });

  it("flags dates it can't be sure of instead of guessing", () => {
    expect(parseDateText("03/04/2027").ambiguous).toEqual([{ text: "03/04/2027", dayFirst: "2027-04-03", monthFirst: "2027-03-04" }]);
    expect(parseDateText("February 2027").unclear).toBe(true);
    expect(parseDateText("sometime in spring").unclear).toBe(true);
    expect(parseDateText("31st February 2027").unclear).toBe(true);
  });
});

describe("the app's own Excel export", () => {
  it("converts back into the same proposal without questions", async () => {
    const p = newProposal(brand);
    p.client = { name: "Ms. Ananya Menon", contact: "+91 98470 12345", date: "2027-02-12", dates: ["2027-02-12", "2027-02-14"], venue: "Taj Green Cove Resort & Spa, Kovalam", location: "" };
    p.eventType = "wedding";
    p.style = "hindu";
    const sound = lineFromElement(el("sound-basic"));
    sound.upgrades[0].mode = "include";
    sound.notes = "Two cordless mics";
    const lighting = lineFromElement(el("lighting"));
    lighting.upgrades[0].mode = "offer";
    const chairs = { ...lineFromElement(el("chiavari")), qty: 150 };
    const band = { ...lineFromElement(el("fusion-band")), optional: true };
    p.lines = [chairs, lineFromElement(el("ceremonial")), sound, lighting, band];
    p.notes = "Guests arrive by 6 pm; the stage must be ready by 5 pm.";

    const buf = await buildWorkbook(p, catalog, brand).xlsx.writeBuffer();
    const book = await readWorkbook("Proposal.xlsx", buf as ArrayBuffer);
    const result = convertWorkbook(book, ctx);
    const back = ready(result);

    expect(isProposal(back)).toBe(true);
    expect(back.client).toEqual(p.client);
    expect(back.ref).toBe(p.ref);
    expect([back.eventType, back.style]).toEqual(["wedding", "hindu"]);
    expect(back.coordinationPct).toBe(p.coordinationPct);
    expect(back.grandTotal).toBeNull();
    expect(back.terms).toEqual(p.terms);
    expect(back.notes).toBe(p.notes);
    const simple = (x: Proposal) =>
      x.lines
        .map((l) => ({ ...l, uid: "", upgrades: l.upgrades.map((u) => ({ name: u.name, price: u.price, mode: u.mode })) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    expect(simple(back)).toEqual(simple(p));
    const totals = (x: Proposal) => ({ ...computeTotals(x, brand.gstPct), asPerActuals: computeTotals(x, brand.gstPct).asPerActuals.map((l) => l.name) });
    expect(totals(back)).toEqual(totals(p));
    if (result.status === "ready") expect(result.report.sources.find((s) => s.label === "Client")?.source).toMatch(/^Proposal!C\d+$/);
  });

  it("asks before keeping a quoted Grand Total that differs from the items", async () => {
    const p = newProposal(brand);
    p.client = { ...p.client, name: "Mr. Rahul", date: "2027-06-21", dates: ["2027-06-21"] };
    p.eventType = "reception";
    p.style = "christian";
    p.lines = [lineFromElement(el("welcome-board"))];
    p.grandTotal = 6000;
    const book = await readWorkbook("p.xlsx", (await buildWorkbook(p, catalog, brand).xlsx.writeBuffer()) as ArrayBuffer);
    expect(ids(convertWorkbook(book, ctx))).toEqual(["grandTotal"]);
    expect(ready(convertWorkbook(book, ctx, { grandTotal: "file" })).grandTotal).toBe(6000);
    expect(ready(convertWorkbook(book, ctx, { grandTotal: "calc" })).grandTotal).toBeNull();
  });

  it("gives a new reference when the file's one is already used on this device", async () => {
    const p = newProposal(brand);
    p.client = { ...p.client, name: "Mr. Rahul" };
    p.eventType = "wedding";
    p.style = "muslim";
    p.lines = [lineFromElement(el("welcome-board"))];
    const book = await readWorkbook("p.xlsx", (await buildWorkbook(p, catalog, brand).xlsx.writeBuffer()) as ArrayBuffer);
    const r = convertWorkbook(book, { ...ctx, takenRefs: [p.ref] });
    expect(ready(r).ref).not.toBe(p.ref);
  });
});

describe("a hand-made estimate sheet", () => {
  const book: WorkbookGrid = {
    fileName: "Estimate.xlsx",
    sheets: [
      {
        name: "Sheet1",
        rows: [
          ["Estimate"],
          ["Client:", "Mr. Rahul Nair"],
          ["Event", "Christian Reception"],
          ["Event Date", "03/04/2027"],
          ["Venue", "Hotel Hycinth"],
          [],
          ["S.No", "Description", "Qty", "Rate (Rs)", "Amount"],
          [1, "Welcome board with flower arrangements at the lobby", 2, "₹ 5,000", "10,000"],
          [2, "Balloon arch", null, null, 25000],
          [3, "Fireworks", 1, "As per actuals", null],
          [null, null, 2, 500, 1000],
          [4, "Live counters", 3, 4000, 15000],
          [null, "Total", null, null, 51000],
        ],
      },
    ],
  };

  it("asks only about what's missing or unclear", () => {
    const r = convertWorkbook(book, ctx);
    expect(ids(r).sort()).toEqual(
      ["dateOrder:0", "category:", "amountOnly", "rowName:Sheet1!11", "amount:Sheet1!12", "coordination", "terms"].sort(),
    );
  });

  it("builds the proposal from the answers, keeping the file's values", () => {
    const answers: Answers = {
      "dateOrder:0": "2027-04-03",
      "category:": "experiences",
      amountOnly: "lump",
      "rowName:Sheet1!11": SKIP,
      "amount:Sheet1!12": "rate",
      coordination: "5",
      terms: "none",
    };
    const r = convertWorkbook(book, ctx, answers);
    const p = ready(r);
    expect(p.client).toEqual({ name: "Mr. Rahul Nair", contact: "", date: "2027-04-03", dates: ["2027-04-03"], venue: "Hotel Hycinth", location: "" });
    expect([p.eventType, p.style]).toEqual(["reception", "christian"]);
    expect(p.coordinationPct).toBe(5);
    expect(p.terms).toEqual([]);
    const byName = Object.fromEntries(p.lines.map((l) => [l.name, l]));
    expect(byName["Welcome board with flower arrangements at the lobby"]).toMatchObject({ elementId: "welcome-board", category: "decor", qty: 2, rate: 5000 });
    expect(byName["Balloon arch"]).toMatchObject({ elementId: null, category: "experiences", qty: 1, rate: 25000 });
    expect(byName["Fireworks"]).toMatchObject({ rate: null, qty: 1 });
    expect(byName["Live counters"]).toMatchObject({ qty: 3, rate: 4000 });
    expect(p.lines).toHaveLength(4);
    if (r.status === "ready") {
      expect(r.report.skipped).toHaveLength(1);
      expect(r.report.notInFile).toEqual(["Contact number"]);
      expect(r.report.notes.join(" ")).toMatch(/file's total \(₹\s51,000\.00, Sheet1, row 13\) differs from the items' Sub Total here \(₹\s47,000\.00\)/);
    }
  });

  it("turns a named row into an item and asks what it still needs", () => {
    const base: Answers = { "dateOrder:0": "2027-04-03", "category:": "experiences", amountOnly: "each", "amount:Sheet1!12": "amount", coordination: "0", terms: "standard" };
    const r = convertWorkbook(book, ctx, { ...base, "rowName:Sheet1!11": "Chocolate fountain" });
    expect(ids(r)).toEqual(expect.arrayContaining(["qty:Sheet1!9"]));
    const p = ready(convertWorkbook(book, ctx, { ...base, "rowName:Sheet1!11": "Chocolate fountain", "qty:Sheet1!9": "5" }));
    expect(p.lines.find((l) => l.name === "Chocolate fountain")).toMatchObject({ qty: 2, rate: 500 });
    expect(p.lines.find((l) => l.name === "Balloon arch")).toMatchObject({ qty: 5, rate: 5000 });
    expect(p.lines.find((l) => l.name === "Live counters")).toMatchObject({ qty: 3, rate: 5000 });
    expect(p.terms).toEqual(brand.terms);
  });

  it("asks for the client's name when the file has none", () => {
    const noName: WorkbookGrid = { ...book, sheets: [{ ...book.sheets[0], rows: book.sheets[0].rows.filter((r) => r[0] !== "Client:") }] };
    expect(ids(convertWorkbook(noName, ctx))).toContain("client");
  });

  it("explains files it can't convert", () => {
    const r = convertWorkbook({ fileName: "x.xlsx", sheets: [{ name: "Sheet1", rows: [["Hello"], ["World"]] }] }, ctx);
    expect(r).toMatchObject({ status: "error", message: expect.stringMatching(/No items table was found/) });
    expect(convertWorkbook({ fileName: "x.xlsx", sheets: [{ name: "Sheet1", rows: [] }] }, ctx)).toMatchObject({ status: "error" });
  });
});

describe("reading the uploaded file", () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0, 0, 0, 0, 0]).buffer;
  it("explains legacy, protected, wrong and empty files", async () => {
    const ole = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
    await expect(readWorkbook("old.xls", ole)).rejects.toThrow(/older \.xls format/);
    await expect(readWorkbook("locked.xlsx", ole)).rejects.toThrow(/password-protected/);
    await expect(readWorkbook("data.csv", bytes(1))).rejects.toThrow(/isn't an Excel file/);
    await expect(readWorkbook("empty.xlsx", new ArrayBuffer(0))).rejects.toThrow(/is empty/);
    await expect(readWorkbook("fake.xlsx", bytes(0x3c, 0x68, 0x74))).rejects.toThrow(ReadError);
    await expect(readWorkbook("broken.xlsx", bytes(0x50, 0x4b, 0x03, 0x04))).rejects.toThrow(/couldn't be read/);
  });
});
