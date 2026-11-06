import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Brand, Proposal } from "../types";
import { newProposal } from "../state/proposals";
import { matchesSearch, pipelineSummary, proposalStatus, statusPatch } from "./status";

const brand: Brand = JSON.parse(readFileSync("public/config/brand.json", "utf8"));

/** A proposal with one ₹1,00,000 line, a round Grand Total and the given status fields. */
function quote(extra: Partial<Proposal>, total = 100000): Proposal {
  const p = newProposal(brand);
  return {
    ...p,
    lines: [{ uid: "a", elementId: null, name: "Stage", category: "decor", unit: "lump sum", qty: 1, rate: total, notes: "", optional: false, upgrades: [] }],
    grandTotal: total,
    ...extra,
  };
}

// local time, mid-month, so month boundaries don't depend on the machine's time zone
const nov = (day: number) => new Date(2026, 10, day, 12).toISOString();
const NOW = new Date(2026, 10, 20, 12);

describe("proposal status", () => {
  it("reads drafts saved before statuses existed as drafts", () => {
    const old = { ...newProposal(brand) } as Partial<Proposal>;
    delete old.status;
    expect(proposalStatus(old as Proposal)).toBe("draft");
    expect(proposalStatus({ status: "maybe" } as unknown as Proposal)).toBe("draft");
    expect(newProposal(brand).status).toBe("draft");
  });

  it("records when it was first sent and keeps that date through accepted or lost", () => {
    const sent = statusPatch({}, "sent", new Date(nov(3)));
    expect(sent).toEqual({ status: "sent", statusAt: nov(3), sentAt: nov(3) });
    const won = statusPatch(sent, "accepted", new Date(nov(9)));
    expect(won).toEqual({ status: "accepted", statusAt: nov(9), sentAt: nov(3) });
    // back to draft keeps the history but no longer counts as sent
    expect(statusPatch(won, "draft", new Date(nov(10))).sentAt).toBe(nov(3));
    // marked accepted straight away: it was sent at that moment too
    expect(statusPatch({}, "accepted", new Date(nov(5))).sentAt).toBe(nov(5));
  });

  it("sums this month's sent and accepted Grand Totals and the win rate", () => {
    const list = [
      quote({ status: "sent", sentAt: nov(2), statusAt: nov(2) }, 200000),
      quote({ status: "accepted", sentAt: nov(1), statusAt: nov(15) }, 300000),
      quote({ status: "accepted", sentAt: "2026-10-10T06:00:00.000Z", statusAt: "2026-10-20T06:00:00.000Z" }, 500000),
      quote({ status: "lost", sentAt: nov(4), statusAt: nov(12) }, 100000),
      quote({ status: "draft" }, 900000),
      quote({ status: "draft", sentAt: nov(3) }, 700000), // sent, then moved back to draft
    ];
    const s = pipelineSummary(list, brand.gstPct, NOW);
    expect(s.sent).toEqual({ count: 3, value: 600000 });
    expect(s.accepted).toEqual({ count: 1, value: 300000 });
    expect(s.winRate).toBeCloseTo(2 / 3);
  });

  it("has no win rate until something is accepted or lost, and ignores other months", () => {
    const s = pipelineSummary([quote({ status: "sent", sentAt: "2026-12-01T06:00:00.000Z", statusAt: "2026-12-01T06:00:00.000Z" })], brand.gstPct, NOW);
    expect(s).toEqual({ sent: { count: 0, value: 0 }, accepted: { count: 0, value: 0 }, winRate: null });
  });

  it("searches the client, reference and venue, ignoring case and accents", () => {
    const p = quote({ ref: "20262011-KQZ", client: { name: "Anjali Ménon", contact: "", date: "", venue: "Taj Green Cove", location: "Kovalam" } });
    expect(matchesSearch(p, "")).toBe(true);
    expect(matchesSearch(p, "menon")).toBe(true);
    expect(matchesSearch(p, "kqz")).toBe(true);
    expect(matchesSearch(p, "green cove")).toBe(true);
    expect(matchesSearch(p, "leela")).toBe(false);
  });
});
