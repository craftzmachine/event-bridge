import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Brand, Catalog } from "../types";
import { validatePackages } from "../config/validate";
import { lineFromElement, newProposal } from "./proposals";
import { packageFromProposal, proposalFromPackage } from "./packages";

const catalog: Catalog = JSON.parse(readFileSync("public/config/catalog.json", "utf8"));
const brand: Brand = JSON.parse(readFileSync("public/config/brand.json", "utf8"));

function proposal() {
  const p = newProposal(brand);
  p.client = { name: "Ms. Asha Pillai", contact: "+91 90000 00000", date: "2027-02-14", dates: ["2027-02-14"], venue: "The Leela", location: "Kovalam", guests: 400, budget: 900000 };
  p.eventType = "wedding";
  p.style = "christian";
  p.functions = [{ id: "fa", label: "Reception", date: "2027-02-14" }];
  p.lines = catalog.elements.slice(0, 3).map((e) => ({ ...lineFromElement(e), fn: "fa", cost: 1000 }));
  p.status = "accepted";
  p.payments = { received: [{ id: "x", date: "2026-11-01", amount: 1, method: "upi", receiptNo: "R-1" }] };
  return p;
}

describe("packages", () => {
  it("keep the occasion and elements but nothing about the client or the money", () => {
    const pk = packageFromProposal(proposal(), "  Christian classic  ");
    expect(pk.name).toBe("Christian classic");
    expect(pk).toMatchObject({ eventType: "wedding", style: "christian" });
    expect(pk.functions).toEqual([{ id: "fa", label: "Reception", date: "" }]);
    const text = JSON.stringify(pk);
    expect(text).not.toMatch(/Asha|Leela|900000|"cost"|receiptNo|accepted|2027-02-14/);
  });

  it("start a fresh proposal with new ids, a new reference and the functions re-linked", () => {
    const src = proposal();
    const pk = packageFromProposal(src, "Classic");
    const p = proposalFromPackage(pk, brand, [src.ref]);
    expect(p.id).not.toBe(src.id);
    expect(p.ref).not.toBe(src.ref);
    expect(p.client.name).toBe("");
    expect(p.status).toBe("draft");
    expect(p.lines.map((l) => l.name)).toEqual(src.lines.map((l) => l.name));
    expect(new Set(p.lines.map((l) => l.uid)).size).toBe(3);
    expect(p.lines.some((l) => src.lines.some((s) => s.uid === l.uid))).toBe(false);
    expect(p.functions).toHaveLength(1);
    expect(p.lines.every((l) => l.fn === p.functions![0].id)).toBe(true);
    expect(p.lines.every((l) => l.cost === undefined)).toBe(true);
  });

  it("validates packages.json", () => {
    expect(validatePackages(JSON.parse(readFileSync("public/config/packages.json", "utf8")), catalog)).toEqual([]);
    expect(validatePackages({}, catalog)).toHaveLength(1);
    const pk = packageFromProposal(proposal(), "Classic", "classic");
    expect(validatePackages({ packages: [pk] }, catalog)).toEqual([]);
    expect(validatePackages({ packages: [pk, pk] }, catalog)[0]).toMatch(/used twice/);
    expect(validatePackages({ packages: [{ ...pk, lines: [{ ...pk.lines[0], category: "nope" }] }] }, catalog)[0]).toMatch(/unknown category/);
  });
});
