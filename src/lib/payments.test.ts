import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { Brand, Catalog, Payment, Proposal } from "../types";
import { lineFromElement, newProposal } from "../state/proposals";
import { computeTotals } from "./totals";
import { amountInWords, dueItems, nextReceiptNo, planFor, schedule } from "./payments";
import { buildReceiptDoc } from "./exportReceipt";

const require = createRequire(import.meta.url);
const catalog: Catalog = JSON.parse(readFileSync("public/config/catalog.json", "utf8"));
const brand: Brand = JSON.parse(readFileSync("public/config/brand.json", "utf8"));
const flatten = (x: unknown): string => (typeof x === "string" ? x : Array.isArray(x) ? x.map(flatten).join(" ") : x && typeof x === "object" ? Object.values(x).map(flatten).join(" ") : "");

function booked(): Proposal {
  const p = newProposal(brand);
  p.client = { name: "Ms. Priya Nair", contact: "", date: "2027-02-14", dates: ["2027-02-14"], venue: "Taj Green Cove", location: "Kovalam" };
  p.eventType = "wedding";
  p.style = "hindu";
  p.lines = catalog.elements.slice(0, 4).map(lineFromElement);
  p.status = "accepted";
  p.statusAt = new Date(2026, 10, 2, 12).toISOString();
  return p;
}
const pay = (amount: number, n: number, date = "2026-11-03"): Payment => ({ id: `p${n}`, date, amount, method: "upi", receiptNo: `R-x-${n}` });

describe("payment plan", () => {
  it("starts from the standard plan: 70% on booking, the balance 7 days before the event", () => {
    const p = booked();
    expect(planFor(p, brand).map(({ pct, due }) => ({ pct, due }))).toEqual([
      { pct: 70, due: "2026-11-02" },
      { pct: 30, due: "2027-02-07" },
    ]);
    const s = schedule(p, brand, "2026-11-02");
    const total = computeTotals(p, brand.gstPct).totalWithGst;
    expect(s.total).toBe(total);
    expect(s.milestones[0].amount).toBe(Math.round(total * 0.7));
    // the last milestone takes the remainder, so they add up exactly
    expect(s.milestones[0].amount + s.milestones[1].amount).toBeCloseTo(total, 2);
  });

  it("applies payments in order, and marks what's due, overdue and paid", () => {
    const p = booked();
    const s0 = schedule(p, brand, "2026-11-10");
    expect(s0.milestones.map((m) => m.state)).toEqual(["overdue", "upcoming"]);
    p.payments = { received: [pay(1000, 1)] };
    expect(schedule(p, brand, "2026-11-10").milestones[0]).toMatchObject({ paid: 1000, state: "overdue" });
    p.payments.received.push(pay(s0.milestones[0].amount - 1000, 2));
    const s = schedule(p, brand, "2027-02-01");
    expect(s.milestones.map((m) => m.state)).toEqual(["paid", "due"]);
    expect(dueItems(p, brand, "2027-02-01")).toHaveLength(1);
    expect(nextReceiptNo(p)).toBe(`R-${p.ref}-3`);
    p.payments.received.push(pay(s0.milestones[1].amount + 500, 3));
    expect(schedule(p, brand).balance).toBe(-500);
  });

  it("follows a plan set in brand.json, and flags one that doesn't add up", () => {
    const b = { ...brand, paymentPlan: [{ label: "Booking", pct: 50, when: "booking" as const }, { label: "Balance", pct: 50, when: "before-event" as const }], balanceDueDays: 3 };
    expect(planFor(booked(), b).map((m) => m.due)).toEqual(["2026-11-02", "2027-02-11"]);
    const p = booked();
    p.payments = { plan: [{ id: "a", label: "All", pct: 90, due: "" }], received: [] };
    expect(schedule(p, brand).planOff).toBe(true);
  });

  it("writes amounts in words the Indian way", () => {
    expect(amountInWords(250000)).toBe("Rupees Two Lakh Fifty Thousand Only");
    expect(amountInWords(12345678.5)).toBe("Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Fifty Paise Only");
    expect(amountInWords(0)).toBe("Rupees Zero Only");
  });

  it("makes a receipt with the amount, the method and the balance after it", async () => {
    const p = booked();
    const first = pay(10000, 1);
    p.payments = { received: [first, pay(5000, 2)] };
    const doc = buildReceiptDoc(p, first, catalog, brand);
    const text = flatten(doc.content);
    expect(text).toContain("PAYMENT RECEIPT");
    expect(text).toContain("Ms. Priya Nair");
    expect(text).toContain("₹ 10,000.00");
    expect(text).toContain("Rupees Ten Thousand Only");
    expect(text).toContain("UPI");
    // the balance as it stood after this payment, not after the later one
    const total = computeTotals(p, brand.gstPct).totalWithGst;
    expect(text).toContain(new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 }).format(total - 10000));
    // renders with pdfmake's Node printer
    const vfs: Record<string, string> = require("pdfmake/build/vfs_fonts");
    const buf = (n: string) => Buffer.from(vfs[n], "base64");
    const PdfPrinter = require("pdfmake");
    const printer = new PdfPrinter({ Roboto: { normal: buf("Roboto-Regular.ttf"), bold: buf("Roboto-Medium.ttf"), italics: buf("Roboto-Italic.ttf"), bolditalics: buf("Roboto-MediumItalic.ttf") } });
    const pdf = printer.createPdfKitDocument(doc);
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve) => {
      pdf.on("data", (c: Buffer) => chunks.push(c));
      pdf.on("end", () => resolve());
      pdf.end();
    });
    expect(Buffer.concat(chunks).subarray(0, 5).toString()).toBe("%PDF-");
  });
});
