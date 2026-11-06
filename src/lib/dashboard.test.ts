import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Brand, Catalog, Proposal, VenueDirectory } from "../types";
import { lineFromElement, newProposal } from "../state/proposals";
import type { Share } from "./shares";
import { followUps } from "./followups";
import { marginThisMonth, monthCompare, paymentsOverview, pipeline, selling, upcoming } from "./dashboard";
import { computeTotals } from "./totals";

const catalog: Catalog = JSON.parse(readFileSync("public/config/catalog.json", "utf8"));
const brand: Brand = JSON.parse(readFileSync("public/config/brand.json", "utf8"));
const venues: VenueDirectory = JSON.parse(readFileSync("public/config/venues.json", "utf8"));
const DAY = 86_400_000;
// local noon, so dates don't depend on the time zone
const NOW = new Date(2026, 10, 20, 12);
const iso = (d: Date) => d.toISOString();

function prop(name: string, extra: Partial<Proposal> = {}): Proposal {
  const p = newProposal(brand);
  p.client = { ...p.client, name, contact: "+91 98470 00000", date: "2027-03-10", dates: ["2027-03-10"], venue: "Taj Green Cove" };
  p.eventType = "wedding";
  p.style = "hindu";
  p.lines = catalog.elements.slice(0, 2).map(lineFromElement);
  return { ...p, ...extra };
}
const share = (proposalId: string, extra: Partial<Share>): Share =>
  ({ id: `s-${proposalId}`, token: "t", client: "C", title: "T", kind: "page", fileName: "Web page", size: 1, createdAt: NOW.getTime() - 5 * DAY, expiresAt: NOW.getTime() + 20 * DAY, createdBy: "s", views: 0, expired: false, proposalId, ...extra }) as Share;

describe("follow-ups", () => {
  it("finds who to get back to, most pressing first", () => {
    const sent = { status: "sent" as const, sentAt: iso(new Date(2026, 10, 10)), statusAt: iso(new Date(2026, 10, 10)) };
    const list = [
      prop("Unopened", { id: "a", ...sent }),
      prop("Quiet", { id: "b", ...sent }),
      prop("Changes", { id: "c", ...sent }),
      prop("Ending", { id: "d", ...sent }),
      prop("Soon", { id: "e", ...sent, client: { ...prop("x").client, name: "Soon", dates: ["2026-11-28"], date: "2026-11-28" } }),
      prop("Draft", { id: "f" }),
      prop("Lost", { id: "g", status: "lost" }),
    ];
    const shares = [
      share("a", {}),
      share("b", { views: 2, lastViewedAt: NOW.getTime() - 4 * DAY }),
      share("c", { views: 1, lastViewedAt: NOW.getTime() - DAY, decision: { kind: "changes", comment: "Fewer lights", at: NOW.getTime() - DAY } }),
      share("d", { views: 1, lastViewedAt: NOW.getTime() - DAY, expiresAt: NOW.getTime() + 2 * DAY }),
      share("g", {}),
    ];
    const f = followUps(list, shares, brand, NOW.getTime());
    expect(f.map((x) => `${x.client}:${x.kind}`)).toEqual(["Changes:changes", "Soon:eventSoon", "Ending:expiring", "Quiet:noAnswer", "Unopened:unopened"]);
    expect(f[0].detail).toContain("Fewer lights");
  });

  it("flags overdue payments on accepted proposals", () => {
    const p = prop("Booked", { status: "accepted", statusAt: iso(new Date(2026, 10, 1, 12)) });
    const f = followUps([p], [], brand, NOW.getTime());
    expect(f.map((x) => x.kind)).toEqual(["overdue"]);
    expect(f[0].detail).toMatch(/Advance/);
  });
});

describe("dashboard figures", () => {
  const value = (p: Proposal) => computeTotals(p, brand.gstPct).grandTotal;

  it("compares this month with last, and adds up the pipeline", () => {
    const list = [
      prop("A", { status: "sent", sentAt: iso(new Date(2026, 10, 5)), statusAt: iso(new Date(2026, 10, 5)) }),
      prop("B", { status: "accepted", sentAt: iso(new Date(2026, 9, 5)), statusAt: iso(new Date(2026, 10, 2)) }),
      prop("C", { status: "lost", sentAt: iso(new Date(2026, 9, 7)), statusAt: iso(new Date(2026, 9, 20)) }),
      prop("D"),
    ];
    const m = monthCompare(list, brand.gstPct, NOW);
    expect(m.now.sent.count).toBe(1);
    expect(m.last.sent.count).toBe(2);
    expect(m.lastMonth.getMonth()).toBe(9);
    const pipe = pipeline(list, brand.gstPct);
    expect(pipe.map((x) => x.count)).toEqual([1, 1, 1, 1]);
    expect(pipe.reduce((t, x) => t + x.value, 0)).toBe(list.reduce((t, p) => t + value(p), 0));
    expect(selling(list, catalog, brand.gstPct)).toEqual([{ label: "Hindu Wedding", won: 1, decided: 2, value: value(list[1]) }]);
  });

  it("lists functions in the next 90 days with a capacity warning", () => {
    const v = venues.venues.find((x) => x.spaces.some((s) => s.capacity))!;
    const cap = Math.max(...v.spaces.map((s) => s.capacity ?? 0));
    const p = prop("Fns", {
      functions: [
        { id: "f1", label: "Haldi", date: "2026-12-01" },
        { id: "f2", label: "Reception", date: "2027-06-01" },
        { id: "f3", label: "Muhurtham", date: "" },
      ],
    });
    p.client = { ...p.client, venue: v.name, guests: cap + 50 };
    const ev = upcoming([p, prop("Lost", { status: "lost", client: { ...p.client, dates: ["2026-12-02"] } })], catalog, venues.venues, NOW);
    expect(ev.map((e) => `${e.date} ${e.label}`)).toEqual(["2026-12-01 Haldi"]);
    expect(ev[0].capacity).toContain(v.name);
  });

  it("totals payments received this month and what's still to come", () => {
    const p = prop("Paid", { status: "accepted", statusAt: iso(new Date(2026, 10, 1, 12)), payments: { received: [{ id: "x", date: "2026-11-05", amount: 1000, method: "upi", receiptNo: "R-1" }, { id: "y", date: "2026-10-05", amount: 500, method: "cash", receiptNo: "R-2" }] } });
    const pay = paymentsOverview([p], brand, NOW);
    expect(pay.receivedThisMonth).toBe(1000);
    expect(pay.overdue).toHaveLength(1);
    expect(pay.outstanding).toBeCloseTo(computeTotals(p, brand.gstPct).totalWithGst - 1500, 2);
  });

  it("works out the month's margin only from accepted proposals with costs", () => {
    const p = prop("Costed", { status: "accepted", statusAt: iso(new Date(2026, 10, 3)) });
    expect(marginThisMonth([p], brand.gstPct, NOW)).toBeNull();
    p.lines = p.lines.map((l) => ({ ...l, cost: (l.rate ?? 0) / 2 }));
    const m = marginThisMonth([p, prop("Draft")], brand.gstPct, NOW)!;
    expect(m.count).toBe(1);
    expect(m.pct).toBeGreaterThan(0.5);
  });
});
