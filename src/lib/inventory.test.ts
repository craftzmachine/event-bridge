import { describe, expect, it } from "vitest";
import { fitSeats, inventory, planCounts, setSeatsFor } from "./inventory";
import { newItem, starterLayout } from "./layout";

const plan = () => {
  const items = [
    { ...newItem("round", { x: 3, y: 3 }), seats: 10 },
    { ...newItem("round", { x: 7, y: 3 }), seats: 10 },
    { ...newItem("round", { x: 11, y: 3 }), w: 1.5, h: 1.5, seats: 8 },
    { ...newItem("rect", { x: 3, y: 8 }), seats: 8 },
    { ...newItem("row", { x: 10, y: 8 }), seats: 10 },
    { ...newItem("mandap", { x: 10, y: 14 }), w: 6, h: 6 },
    { ...newItem("aisle", { x: 4, y: 14 }), w: 1.5, h: 10 },
    newItem("label", { x: 1, y: 1 }),
  ];
  return { w: 30, h: 20, items };
};

describe("counts and inventory", () => {
  it("counts tables by size and seats, chairs and zones", () => {
    const c = planCounts(plan());
    expect(c).toMatchObject({ tables: 4, chairRows: 1, chairs: 46 });
    expect(c.rows.find((r) => r.kind === "round" && r.size === "Ø 1.8 m")).toMatchObject({ count: 2, seats: 10 });
    expect(c.zones.map((z) => `${z.label} ${z.size}`)).toEqual(["Aisle / runner 1.5 × 10 m", "Mandap 6 × 6 m"]);
  });

  it("lists chairs, tables, linens to the floor, centrepieces and décor for the vendor", () => {
    const inv = inventory(plan());
    const find = (item: string, sizeStart = "") => inv.find((r) => r.item === item && r.size.startsWith(sizeStart));
    expect(find("Chairs")?.qty).toBe(46);
    expect(find("Round tablecloth", "Ø 3.4")?.qty).toBe(2);
    expect(find("Round tablecloth", "Ø 3.1")?.qty).toBe(1);
    expect(find("Long tablecloth")?.size).toBe("4 × 2.5 m");
    expect(find("Centrepiece")?.qty).toBe(3);
    expect(find("Mandap")).toMatchObject({ size: "6 × 6 m", qty: 1 });
    expect(find("Aisle / runner")?.note).toBe("runner carpet");
    expect(inventory(undefined)).toEqual([]);
  });

  it("sets chairs on many tables and spreads a headcount within each table's maximum", () => {
    const l = plan();
    const ids = l.items.filter((i) => i.kind === "round").map((i) => i.id);
    expect(setSeatsFor(l.items, ids, 8).filter((i) => i.kind === "round").map((i) => i.seats)).toEqual([8, 8, 8]);
    const fit = fitSeats(l.items, ids, 25);
    expect(fit.items.filter((i) => i.kind === "round").map((i) => i.seats)).toEqual([9, 8, 8]);
    expect(fit.short).toBe(0);
    expect(fitSeats(l.items, ids, 100).short).toBe(100 - 24 * 3);
    // a starter for 200 keeps its totals when fitted to the same number
    const s = starterLayout("rounds", 200);
    const all = s.items.map((i) => i.id);
    expect(planCounts({ ...s, items: fitSeats(s.items, all, 200).items }).chairs).toBe(200);
  });
});

describe("inventory exports", () => {
  it("builds the vendor PDF with pdfmake and the Excel sheet", async () => {
    const { readFileSync } = await import("node:fs");
    const { createRequire } = await import("node:module");
    const { buildInventoryDoc, buildInventoryWorkbook } = await import("./exportInventory");
    const brand = JSON.parse(readFileSync("public/config/brand.json", "utf8"));
    const require = createRequire(import.meta.url);
    const vfs: Record<string, string> = require("pdfmake/build/vfs_fonts");
    const buf = (n: string) => Buffer.from(vfs[n], "base64");
    const PdfPrinter = require("pdfmake");
    const printer = new PdfPrinter({ Roboto: { normal: buf("Roboto-Regular.ttf"), bold: buf("Roboto-Medium.ttf"), italics: buf("Roboto-Italic.ttf"), bolditalics: buf("Roboto-MediumItalic.ttf") } });
    const doc = printer.createPdfKitDocument(buildInventoryDoc("Mock-up", "Taj Green Cove", plan(), brand));
    const chunks: Buffer[] = [];
    const pdf = await new Promise<Buffer>((resolve) => {
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.end();
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const ws = buildInventoryWorkbook("Mock-up", "Taj Green Cove", plan()).getWorksheet("Inventory")!;
    const chairs = ws.getRows(1, ws.rowCount)!.find((r) => r.getCell(1).value === "Chairs");
    expect(chairs?.getCell(3).value).toBe(46);
  });
});
