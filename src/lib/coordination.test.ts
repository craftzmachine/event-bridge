import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { Brand, Catalog, Proposal } from "../types";
import { lineFromElement, newProposal } from "../state/proposals";
import { DEFAULT_CUES, guessKind, HANDOVER, READINESS, SECTIONS, setSheet, sheetFor, sheetFunctions } from "./coordination";
import { buildCoordinationDoc, coordinationFileName } from "./exportCoordination";
import { pageSnapshot } from "./proposalPage";
import { portalSnapshot } from "./portal";

const require = createRequire(import.meta.url);
const catalog: Catalog = JSON.parse(readFileSync("public/config/catalog.json", "utf8"));
const brand: Brand = JSON.parse(readFileSync("public/config/brand.json", "utf8"));
const flatten = (x: unknown): string => (typeof x === "string" ? x : Array.isArray(x) ? x.map(flatten).join(" ") : x && typeof x === "object" ? Object.values(x).map(flatten).join(" ") : "");

function wedding(withFunctions = false): Proposal {
  const p = newProposal(brand);
  p.client = { name: "Ms. Priya Nair", contact: "", date: "2027-02-14", dates: ["2027-02-13", "2027-02-14"], venue: "Taj Green Cove", location: "Kovalam", guests: 350 };
  p.eventType = "wedding";
  p.style = "hindu";
  p.lines = catalog.elements.slice(0, 4).map(lineFromElement);
  p.lines[0].cost = 12345;
  if (withFunctions)
    p.functions = [
      { id: "f1", label: "Sangeet", date: "2027-02-13" },
      { id: "f2", label: "Muhurtham", date: "2027-02-14" },
      { id: "f3", label: "Reception", date: "" },
    ];
  return p;
}

describe("coordination sheet", () => {
  it("guesses the duties block from the function's name", () => {
    expect(guessKind("Sangeet night", "hindu")).toBe("sangeet");
    expect(guessKind("Reception", "christian")).toBe("reception");
    expect(guessKind("Muhurtham", "hindu")).toBe("hindu");
    expect(guessKind("Hindu Wedding", "hindu")).toBe("hindu");
    expect(guessKind("Wedding", "christian")).toBe("other");
    expect(guessKind("Haldi", "hindu")).toBe("other");
  });

  it("fills in what the proposal knows, and nothing else, for a proposal without functions", () => {
    const p = wedding();
    const [fn] = sheetFunctions(p, "Hindu Wedding");
    expect(fn.id).toBe("");
    const s = sheetFor(p, fn);
    expect(s.kind).toBe("hindu");
    expect(s.details.client).toBe("Ms. Priya Nair");
    expect(s.details.functionDate).toBe("Hindu Wedding — 13th & 14th February 2027");
    expect(s.details.spaces).toBe("Taj Green Cove, Kovalam");
    expect(s.details.guests).toBe("350");
    expect(s.details.timings).toBe("");
    expect(s.details.lead).toEqual({ name: "", phone: "" });
    expect(s.timeline.map((c) => c.action)).toEqual(DEFAULT_CUES.map((c) => c.action));
    expect(s.timeline.every((c) => c.time === "" && c.actual === "")).toBe(true);
    expect(s.readiness).toEqual(READINESS.map(() => false));
    expect(s.handover).toEqual(HANDOVER.map(() => false));
  });

  it("keeps one sheet per function", () => {
    let p = wedding(true);
    const fns = sheetFunctions(p);
    expect(fns.map((f) => f.label)).toEqual(["Sangeet", "Muhurtham", "Reception"]);
    expect(sheetFor(p, fns[0]).kind).toBe("sangeet");
    expect(sheetFor(p, fns[1]).details.functionDate).toBe("Muhurtham — 14th February 2027");
    expect(sheetFor(p, fns[2]).details.functionDate).toBe("Reception");
    const s = sheetFor(p, fns[1]);
    p = setSheet(p, { ...s, team: { ...s.team, c1: { name: "Anu", phone: "98470 00000" } } });
    p = setSheet(p, { ...sheetFor(p, fns[1]), details: { ...sheetFor(p, fns[1]).details, timings: "9:30 / 10:45 / 13:30" } });
    expect(p.coordination).toHaveLength(1);
    expect(sheetFor(p, fns[1]).team.c1.name).toBe("Anu");
    expect(sheetFor(p, fns[1]).details.timings).toBe("9:30 / 10:45 / 13:30");
    expect(sheetFor(p, fns[0]).team.c1.name).toBe("");
  });

  it("reads an incomplete saved sheet without breaking", () => {
    const p = wedding();
    const [fn] = sheetFunctions(p, "Hindu Wedding");
    p.coordination = [{ fnId: "", kind: "reception", readiness: [true] } as never];
    const s = sheetFor(p, fn);
    expect(s.kind).toBe("reception");
    expect(s.readiness).toEqual([true, ...READINESS.slice(1).map(() => false)]);
    expect(s.hostesses).toHaveLength(6);
    expect(s.details.client).toBe("Ms. Priya Nair");
  });

  it("never reaches a client output", () => {
    const p = wedding();
    const [fn] = sheetFunctions(p, "Hindu Wedding");
    const q = setSheet(p, { ...sheetFor(p, fn), review: { wentWell: "SECRET-DEBRIEF", gaps: "", corrective: "", signOff: "" } });
    expect(JSON.stringify(pageSnapshot(q, catalog, "dark"))).not.toContain("SECRET-DEBRIEF");
    expect(JSON.stringify(portalSnapshot(q, catalog, brand, "dark"))).not.toContain("SECRET-DEBRIEF");
  });

  it("prints all nine sections, the chosen duties and what was entered, with no prices", async () => {
    let p = wedding(true);
    const fns = sheetFunctions(p);
    const s = sheetFor(p, fns[1]);
    p = setSheet(p, { ...s, team: { ...s.team, c2: { name: "Rahul", phone: "98950 11111" } }, readiness: s.readiness.map((_, i) => i < 3) });
    const doc = buildCoordinationDoc(p, [sheetFor(p, fns[1])], catalog, brand);
    const text = flatten(doc.content);
    expect(text).toContain("ON-SITE EVENT COORDINATION & RESPONSIBILITY SHEET");
    SECTIONS.forEach((t, i) => expect(text).toContain(`${i + 1}. ${t}`));
    expect(text).toContain("Ms. Priya Nair");
    expect(text).toContain("Muhurtham — 14th February 2027");
    expect(text).toContain("Rahul · 98950 11111");
    expect(text).toContain("Confirm muhurtham and ritual order");
    expect(text).not.toContain("performer holding area");
    expect(text).not.toContain("12345");
    expect(text).not.toContain("₹");
    expect(coordinationFileName(p, catalog, [sheetFor(p, fns[1])])).toBe("Coordination_Ms_Priya_Nair_Muhurtham_2027-02-14.pdf");
    expect(coordinationFileName(p, catalog, fns.map((f) => sheetFor(p, f)))).toBe("Coordination_Ms_Priya_Nair_All_functions_2027-02-14.pdf");

    // every function, one after another, rendered with pdfmake's Node printer
    const all = buildCoordinationDoc(p, fns.map((f) => sheetFor(p, f)), catalog, brand, readFileSync("public/images/parinay-logo-gold.png").toString("base64"));
    const vfs: Record<string, string> = require("pdfmake/build/vfs_fonts");
    const buf = (n: string) => Buffer.from(vfs[n], "base64");
    const PdfPrinter = require("pdfmake");
    const printer = new PdfPrinter({ Roboto: { normal: buf("Roboto-Regular.ttf"), bold: buf("Roboto-Medium.ttf"), italics: buf("Roboto-Italic.ttf"), bolditalics: buf("Roboto-MediumItalic.ttf") } });
    const pdf = printer.createPdfKitDocument(all);
    const chunks: Buffer[] = [];
    const bytes = await new Promise<Buffer>((resolve) => {
      pdf.on("data", (c: Buffer) => chunks.push(c));
      pdf.on("end", () => resolve(Buffer.concat(chunks)));
      pdf.end();
    });
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    if (process.env.PDF_SAMPLE) writeFileSync(process.env.PDF_SAMPLE, bytes);
  });
});
