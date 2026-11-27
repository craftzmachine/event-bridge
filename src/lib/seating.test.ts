import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Brand, Proposal } from "../types";
import { newProposal } from "../state/proposals";
import { importGuests } from "./guestList";
import { newItem } from "./layout";
import { autoSeat, householdsFor, issues, normalise, seatAt, seatedKeys, tableOf, tablesOf as tablesOfLayout } from "./seating";

const brand = JSON.parse(readFileSync("public/config/brand.json", "utf8")) as Brand;

function wedding(): Proposal {
  const p = newProposal(brand, []);
  p.guestList = { guests: importGuests(p, "Menons,,bride,Family,4\nNairs,,bride,Family,3\nRahul,,groom,College,1\nAnu,,groom,College,1\nNo-show,,,,2") };
  const [m, n, r, a, x] = p.guestList.guests;
  m.reply = { "": { status: "yes", count: 4 } };
  n.reply = { "": { status: "yes", count: 3 } };
  r.reply = { "": { status: "yes", count: 1 } };
  a.reply = { "": { status: "maybe", count: 1 } };
  x.reply = { "": { status: "no", count: 0 } };
  return p;
}

describe("seating", () => {
  const t1 = { ...newItem("round", { x: 3, y: 3 }), seats: 6 };
  const t2 = { ...newItem("round", { x: 8, y: 3 }), seats: 6 };

  it("lists who to seat: confirmed people, optionally the undecided, never those who declined", () => {
    const p = wedding();
    expect(householdsFor(p, "", false).reduce((n, h) => n + h.people.length, 0)).toBe(8);
    expect(householdsFor(p, "", true).map((h) => h.guest.name)).toEqual(["Menons", "Nairs", "Rahul", "Anu"]);
  });

  it("seats a household together, moves people, and refuses a full table", () => {
    const p = wedding();
    const hs = householdsFor(p, "", false);
    const { plan } = normalise({}, [t1, t2]);
    const a = seatAt(plan, t1.id, hs[0].people.map((x) => x.key), 2)!;
    expect(a[t1.id].filter(Boolean)).toHaveLength(4);
    expect(seatAt(a, t1.id, hs[1].people.map((x) => x.key))).toBeNull();
    const b = seatAt(a, t2.id, [hs[0].people[0].key])!;
    expect(tableOf(b, hs[0].people[0].key)).toBe(t2.id);
    expect(seatedKeys(b).size).toBe(4);
  });

  it("auto-seats households whole, groups together, and reports what needs attention", () => {
    const p = wedding();
    const hs = householdsFor(p, "", false);
    const { plan, left } = autoSeat(normalise({}, [t1, t2]).plan, [t1, t2], hs);
    expect(left).toBe(0);
    const menons = hs[0].people.map((x) => tableOf(plan, x.key));
    expect(new Set(menons).size).toBe(1);
    // the Nairs (also Family) can't fit beside the Menons, so they get the other table whole
    expect(new Set(hs[1].people.map((x) => tableOf(plan, x.key))).size).toBe(1);
    // a table shrinks: the person in a lost seat is reported
    const shrunk = normalise(plan, [{ ...t1, seats: 2 }, t2]);
    expect(issues(p, "", shrunk.plan, shrunk.displaced).some((i) => i.kind === "displaced")).toBe(true);
    // someone changes their reply to no
    p.guestList!.guests[2].reply = { "": { status: "no", count: 0 } };
    expect(issues(p, "", plan, []).map((i) => i.kind)).toContain("not-coming");
  });
});

describe("seating PDF", () => {
  it("renders the floor plan, tables and A–Z list with pdfmake", async () => {
    const { createRequire } = await import("node:module");
    const { buildSeatingDoc, layoutSvg } = await import("./exportSeating");
    const { starterLayout } = await import("./layout");
    const require = createRequire(import.meta.url);
    const p = wedding();
    const l = starterLayout("rounds", 20);
    const plan = autoSeat(normalise({}, tablesOfLayout(l)).plan, tablesOfLayout(l), householdsFor(p, "", false)).plan;
    expect(layoutSvg(l, plan)).toContain("<svg");
    const vfs: Record<string, string> = require("pdfmake/build/vfs_fonts");
    const buf = (n: string) => Buffer.from(vfs[n], "base64");
    const PdfPrinter = require("pdfmake");
    const printer = new PdfPrinter({ Roboto: { normal: buf("Roboto-Regular.ttf"), bold: buf("Roboto-Medium.ttf"), italics: buf("Roboto-Italic.ttf"), bolditalics: buf("Roboto-MediumItalic.ttf") } });
    const doc = printer.createPdfKitDocument(buildSeatingDoc(p, "", l, plan, brand));
    const chunks: Buffer[] = [];
    const pdf = await new Promise<Buffer>((resolve) => {
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.end();
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    if (process.env.SEATING_SAMPLE) (await import("node:fs")).writeFileSync(process.env.SEATING_SAMPLE, pdf);
  });
});
