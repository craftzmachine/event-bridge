import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Brand, Proposal, ProposalStatus } from "../types";
import { newProposal } from "../state/proposals";
import { countdown, daysUntil, eventsFor, isPast } from "./events";

const brand: Brand = JSON.parse(readFileSync("public/config/brand.json", "utf8"));

function p(name: string, dates: string[], status?: ProposalStatus): Proposal {
  const x = newProposal(brand);
  x.client = { ...x.client, name, dates, date: dates[0] ?? "" };
  return status ? { ...x, status } : x;
}

describe("events", () => {
  const today = "2027-02-10";

  it("counts down to the first event date", () => {
    expect(countdown(p("a", ["2027-02-10"]), today)).toBe("Today");
    expect(countdown(p("a", ["2027-02-11"]), today)).toBe("Tomorrow");
    expect(countdown(p("a", ["2027-03-01"]), today)).toBe("In 19 days");
    expect(countdown(p("a", ["2027-02-08", "2027-02-12"]), today)).toBe("On now");
    expect(countdown(p("a", ["2027-02-09"]), today)).toBe("Yesterday");
    expect(countdown(p("a", ["2027-01-31"]), today)).toBe("10 days ago");
    expect(countdown(p("a", []), today)).toBe("Date to be confirmed");
    expect(daysUntil(p("a", ["2027-03-01"]), today)).toBe(19);
    expect(daysUntil(p("a", []), today)).toBeNull();
    expect(isPast(p("a", ["2027-02-08", "2027-02-12"]), today)).toBe(false);
  });

  it("lists accepted and dated proposals: upcoming soonest first, past most recent first, lost only under All", () => {
    const list = [
      p("Later", ["2027-05-01"]),
      p("Soon", ["2027-02-20"], "sent"),
      p("Undated but accepted", [], "accepted"),
      p("Undated draft", []),
      p("Last month", ["2027-01-05"], "accepted"),
      p("Long ago", ["2026-11-05"], "accepted"),
      p("Lost", ["2027-03-01"], "lost"),
    ];
    const names = (tab: "upcoming" | "past" | "all") => eventsFor(list, tab, today).map((x) => x.client.name);
    expect(names("upcoming")).toEqual(["Soon", "Later", "Undated but accepted"]);
    expect(names("past")).toEqual(["Last month", "Long ago"]);
    expect(names("all")).toEqual(["Long ago", "Last month", "Soon", "Lost", "Later", "Undated but accepted"]);
  });
});
