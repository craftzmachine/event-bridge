import { describe, expect, it } from "vitest";
import { fits, pickScale, ptPerMetre } from "./scalePlan";
import { starterLayout } from "./layout";

describe("printing a floor plan to scale", () => {
  it("picks the largest standard scale that fits the paper", () => {
    // 1:100 is 10 mm per metre, 28.35 pt
    expect(ptPerMetre(100)).toBeCloseTo(28.35, 1);
    expect(pickScale({ w: 24, h: 18 }, "A3", "landscape")).toBe(100);
    expect(pickScale({ w: 24, h: 18 }, "A4", "landscape")).toBe(200);
    expect(pickScale({ w: 8, h: 6 }, "A4", "landscape")).toBe(100);
    expect(pickScale({ w: 6, h: 4 }, "A4", "landscape")).toBe(50);
    expect(pickScale({ w: 200, h: 200 }, "A4", "portrait")).toBeNull();
    expect(fits({ w: 24, h: 18 }, "A4", "landscape", 100)).toBe(false);
  });

  it("renders the PDF with pdfmake, seat numbers and all", async () => {
    const { readFileSync } = await import("node:fs");
    const { createRequire } = await import("node:module");
    const { buildScalePlanDoc } = await import("./exportScalePlan");
    const brand = JSON.parse(readFileSync("public/config/brand.json", "utf8"));
    const require = createRequire(import.meta.url);
    const vfs: Record<string, string> = require("pdfmake/build/vfs_fonts");
    const buf = (n: string) => Buffer.from(vfs[n], "base64");
    const PdfPrinter = require("pdfmake");
    const printer = new PdfPrinter({ Roboto: { normal: buf("Roboto-Regular.ttf"), bold: buf("Roboto-Medium.ttf"), italics: buf("Roboto-Italic.ttf"), bolditalics: buf("Roboto-MediumItalic.ttf") } });
    const layout = starterLayout("ceremony", 120);
    const r = buildScalePlanDoc({ title: "Mock-up", venue: "Taj Green Cove", layout, paper: "A3", seatNumbers: true, dated: "2026-11-28" }, brand);
    expect(r.scale).toBe(pickScale(layout, "A3", r.orientation));
    const doc = printer.createPdfKitDocument(r.doc);
    const chunks: Buffer[] = [];
    const pdf = await new Promise<Buffer>((resolve) => {
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.end();
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    if (process.env.PDF_SAMPLE) (await import("node:fs")).writeFileSync(process.env.PDF_SAMPLE, pdf);
  });
});
