import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Brand, Catalog, Proposal } from "../types";
import { lineFromElement, newProposal } from "../state/proposals";
import { DEFAULT_QUESTIONNAIRE, sendQuestionnaire } from "./questionnaires";
import { mergePortalAnswers, portalBytes, portalSnapshot, PORTAL_MAX_BYTES } from "./portal";

const catalog: Catalog = JSON.parse(readFileSync("public/config/catalog.json", "utf8"));
const brand: Brand = JSON.parse(readFileSync("public/config/brand.json", "utf8"));

function wedding(): Proposal {
  const p = newProposal(brand);
  p.client = { ...p.client, name: "Ms. Priya Nair", dates: ["2027-02-14"], date: "2027-02-14", budget: 999999, guests: 400 };
  p.lines = ["mandap", "lighting"].map((id) => ({ ...lineFromElement(catalog.elements.find((e) => e.id === id)!), cost: 4321 }));
  p.status = "accepted";
  p.statusAt = "2026-11-01T10:00:00.000Z";
  p.checklist = [
    { id: "a", title: "Final guest count", owner: "client", state: "todo", offsetDays: 14 },
    { id: "b", title: "Book the photographer", owner: "team", state: "done" },
  ];
  p.questionnaires = [sendQuestionnaire(DEFAULT_QUESTIONNAIRE, () => "q1", new Date("2026-11-05T10:00:00Z"))];
  return p;
}

describe("client portal snapshot", () => {
  it("shows the family their proposal, their own to-dos, the payment plan and their questionnaires, and nothing internal", () => {
    const s = portalSnapshot(wedding(), catalog, brand, "white", "2026-11-22");
    expect(s.v).toBe(1);
    expect(s.page.theme).toBe("white");
    expect(s.tasks).toEqual([{ title: "Final guest count", due: "2027-01-31", state: "todo" }]);
    expect(s.payments.milestones.length).toBeGreaterThan(1);
    expect(s.payments.total).toBeGreaterThan(0);
    expect(s.questionnaires.map((q) => q.id)).toEqual(["q1"]);
    const text = JSON.stringify(s);
    expect(text).not.toMatch(/"cost"|4321|Book the photographer|999999|"budget"/);
    expect(portalBytes(s)).toBeLessThan(PORTAL_MAX_BYTES);
  });

  it("brings newer answers from the portal into the proposal, cleaned, and leaves older ones alone", () => {
    const p = wedding();
    const at = Date.parse("2026-11-20T09:00:00Z");
    const merged = mergePortalAnswers(p, { q1: { answers: { style: "Traditional", guests: "abc", food: "Both" }, at } })!;
    expect(merged.questionnaires![0]).toMatchObject({ answers: { style: "Traditional", food: "Both" }, answeredAt: "2026-11-20T09:00:00.000Z", answeredBy: "client" });
    // the same or an older answer changes nothing
    expect(mergePortalAnswers(merged, { q1: { answers: { style: "Intimate" }, at } })).toBeNull();
    expect(mergePortalAnswers(merged, { q1: { answers: { style: "Intimate" }, at: at - 1000 } })).toBeNull();
    // the team typed answers in later than the family: the team's stay
    const team = { ...merged, questionnaires: [{ ...merged.questionnaires![0], answeredAt: "2026-11-21T09:00:00.000Z", answeredBy: "team" as const }] };
    expect(mergePortalAnswers(team, { q1: { answers: { style: "Intimate" }, at } })).toBeNull();
    expect(mergePortalAnswers(p, { other: { answers: {}, at } })).toBeNull();
    expect(mergePortalAnswers(p, undefined)).toBeNull();
  });
});
