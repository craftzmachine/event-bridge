import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { Brand, Catalog } from "../types";
import { buildPdfDoc } from "./exportPdf";
import { exportFileName } from "./proposal";
import { lineFromElement, newProposal } from "../state/proposals";

const require = createRequire(import.meta.url);
const catalog: Catalog = JSON.parse(readFileSync("public/config/catalog.json", "utf8"));
const brand: Brand = JSON.parse(readFileSync("public/config/brand.json", "utf8"));
const el = (id: string) => catalog.elements.find((e) => e.id === id)!;

// the same bundled Roboto the browser uses, fed to pdfmake's Node printer
function robotoFonts() {
  const vfs: Record<string, string> = require("pdfmake/build/vfs_fonts");
  const buf = (n: string) => Buffer.from(vfs[n], "base64");
  return { Roboto: { normal: buf("Roboto-Regular.ttf"), bold: buf("Roboto-Medium.ttf"), italics: buf("Roboto-Italic.ttf"), bolditalics: buf("Roboto-MediumItalic.ttf") } };
}

function sample() {
  const p = newProposal(brand, []);
  p.client = { name: "Ms. Priya Nair", contact: "", date: "2027-02-14", venue: "Taj Green Cove Resort & Spa, Kovalam", location: "Kovalam" };
  p.eventType = "wedding";
  p.style = "hindu";
  const sound = lineFromElement(el("sound-basic"));
  sound.upgrades[0].mode = "include";
  const lighting = lineFromElement(el("lighting"));
  lighting.upgrades[0].mode = "offer";
  const chairs = { ...lineFromElement(el("chiavari")), notes: "Ivory tie-backs with jasmine" };
  p.lines = [lineFromElement(el("mandap")), chairs, lineFromElement(el("ceremonial")), sound, lighting, lineFromElement(el("nadaswaram")), lineFromElement(el("transport")), { ...lineFromElement(el("panchavadyam")), optional: true }];
  p.grandTotal = 260000;
  return p;
}

const flatten = (x: unknown): string => (typeof x === "string" ? x : Array.isArray(x) ? x.map(flatten).join(" ") : x && typeof x === "object" ? Object.values(x).map(flatten).join(" ") : "");

describe("pdf export", () => {
  it("contains the proposal's details, totals, options and terms", () => {
    const p = sample();
    const text = flatten(buildPdfDoc(p, catalog, brand).content);
    for (const s of ["Hindu Wedding", "Ms. Priya Nair", p.ref, "Traditional Kerala mandap", "Ivory tie-backs with jasmine", "+ Line-array sound for live band", "As per actuals", "Grand Total", "₹ 2,60,000.00", "Additional Options", "Upgrade: Moving-head lights & haze", "Panchavadyam to welcome the groom", brand.terms[0], brand.contact.name])
      expect(text).toContain(s);
    expect(exportFileName(p, catalog, "pdf")).toBe("Proposal_Ms_Priya_Nair_Hindu_Wedding_2027-02-14.pdf");
  });

  it("renders to a valid PDF with the bundled font", async () => {
    const PdfPrinter = require("pdfmake");
    const printer = new PdfPrinter(robotoFonts());
    const doc = printer.createPdfKitDocument(buildPdfDoc(sample(), catalog, brand, readFileSync("public/images/parinay-logo-gold.png").toString("base64")));
    const chunks: Buffer[] = [];
    const bytes = await new Promise<Buffer>((resolve) => {
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.end();
    });
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(20_000);
    if (process.env.PDF_SAMPLE) writeFileSync(process.env.PDF_SAMPLE, bytes);
  });
});
