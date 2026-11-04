import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Brand, Catalog, Proposal } from "../types";
import { formatDates } from "./format";
import { eventDates, eventDatesLine } from "./proposal";
import { buildPdfDoc } from "./exportPdf";
import { buildWorkbook } from "./exportXlsx";
import { newProposal } from "../state/proposals";

const catalog: Catalog = JSON.parse(readFileSync("public/config/catalog.json", "utf8"));
const brand: Brand = JSON.parse(readFileSync("public/config/brand.json", "utf8"));
const flatten = (x: unknown): string => (typeof x === "string" ? x : Array.isArray(x) ? x.map(flatten).join(" ") : x && typeof x === "object" ? Object.values(x).map(flatten).join(" ") : "");

describe("event dates", () => {
  it("writes several dates on one line, sharing the month where it can", () => {
    expect(formatDates([])).toBe("Date to be confirmed");
    expect(formatDates(["2027-02-14"])).toBe("14th February 2027");
    expect(formatDates(["2027-02-13", "2027-02-14"])).toBe("13th & 14th February 2027");
    expect(formatDates(["2027-02-12", "2027-02-13", "2027-02-14"])).toBe("12th, 13th & 14th February 2027");
    expect(formatDates(["2027-02-28", "2027-03-01"])).toBe("28th February 2027 · 1st March 2027");
  });

  it("reads drafts saved before multi-date support, and sorts and de-duplicates", () => {
    const old = { client: { date: "2027-02-14" } } as Proposal;
    expect(eventDates(old)).toEqual(["2027-02-14"]);
    const p = { client: { date: "2027-02-13", dates: ["2027-02-14", "2027-02-13", "2027-02-14"] } } as Proposal;
    expect(eventDates(p)).toEqual(["2027-02-13", "2027-02-14"]);
    expect(eventDatesLine(p)).toEqual({ label: "Event dates", text: "13th & 14th February 2027" });
    expect(eventDatesLine(old).label).toBe("Event date");
  });

  it("shows every date in the PDF and the Excel workbook", async () => {
    const p = newProposal(brand, []);
    p.client = { ...p.client, name: "Ms. Priya Nair", date: "2027-02-13", dates: ["2027-02-13", "2027-02-14", "2027-02-15"] };
    p.eventType = "wedding";
    p.style = "hindu";
    const pdfText = flatten(buildPdfDoc(p, catalog, brand).content);
    expect(pdfText).toMatch(/event dates/i); // the PDF sets its labels in capitals
    expect(pdfText).toContain("13th, 14th & 15th February 2027");
    const ws = buildWorkbook(p, catalog, brand).getWorksheet("Proposal")!;
    const cells: string[] = [];
    ws.eachRow((r) => r.eachCell((c) => cells.push(String(c.value))));
    expect(cells).toContain("EVENT DATES"); // the workbook capitalises its labels too
    expect(cells).toContain("13th, 14th & 15th February 2027");
  });
});
