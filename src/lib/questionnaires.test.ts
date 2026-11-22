import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Brand, Question } from "../types";
import { newProposal } from "../state/proposals";
import { pageSnapshot } from "./proposalPage";
import { awaitingAnswers, cleanAnswer, cleanAnswers, completeness, DEFAULT_QUESTIONNAIRE, isTemplate, sendQuestionnaire, validateQuestionnaires } from "./questionnaires";

const brand: Brand = JSON.parse(readFileSync("public/config/brand.json", "utf8"));
const catalog = JSON.parse(readFileSync("public/config/catalog.json", "utf8"));
const q = (type: Question["type"], extra: Partial<Question> = {}): Question => ({ id: "x", text: "?", type, ...extra });

describe("questionnaires", () => {
  it("keeps only answers that fit each question", () => {
    expect(cleanAnswer(q("short"), "  Jasmine \u0007 ")).toBe("Jasmine");
    expect(cleanAnswer(q("short"), "a".repeat(500))).toHaveLength(300);
    expect(cleanAnswer(q("long"), "line one\nline two")).toBe("line one\nline two");
    expect(cleanAnswer(q("long"), "b".repeat(5000))).toHaveLength(2000);
    expect(cleanAnswer(q("choice", { options: ["Veg", "Both"] }), "Veg")).toBe("Veg");
    expect(cleanAnswer(q("choice", { options: ["Veg", "Both"] }), "Fish")).toBeUndefined();
    expect(cleanAnswer(q("multi", { options: ["Haldi", "Sangeet"] }), ["Haldi", "Haldi", "Disco"])).toEqual(["Haldi"]);
    expect(cleanAnswer(q("multi", { options: ["Haldi"] }), "Haldi")).toBeUndefined();
    expect(cleanAnswer(q("yesno"), "yes")).toBe("yes");
    expect(cleanAnswer(q("yesno"), "maybe")).toBeUndefined();
    expect(cleanAnswer(q("date"), "2027-02-14")).toBe("2027-02-14");
    expect(cleanAnswer(q("date"), "14/02/2027")).toBeUndefined();
    expect(cleanAnswer(q("number"), "600")).toBe("600");
    expect(cleanAnswer(q("number"), "six hundred")).toBeUndefined();
    expect(cleanAnswer(q("short"), "   ")).toBeUndefined();
    expect(cleanAnswers([q("short", { id: "a" }), q("number", { id: "b" })], { a: "hi", b: "x", c: "not a question" })).toEqual({ a: "hi" });
    expect(cleanAnswers([q("short")], "nope")).toEqual({});
  });

  it("sends a copy to a wedding and counts what's answered", () => {
    let n = 0;
    const s = sendQuestionnaire(DEFAULT_QUESTIONNAIRE, () => `q${++n}`, new Date("2026-11-22T10:00:00Z"));
    expect(s).toMatchObject({ id: "q1", templateId: "initial-planning", answers: {}, sentAt: "2026-11-22T10:00:00.000Z" });
    expect(s.questions).not.toBe(DEFAULT_QUESTIONNAIRE.questions);
    const required = DEFAULT_QUESTIONNAIRE.questions.filter((x) => x.required).length;
    expect(completeness(s)).toEqual({ answered: 0, total: DEFAULT_QUESTIONNAIRE.questions.length, missingRequired: required });
    const answered = { ...s, answers: { style: "Traditional", guests: "600", food: "Both" } };
    expect(completeness(answered)).toMatchObject({ answered: 3, missingRequired: 0 });

    const p = { ...newProposal(brand), questionnaires: [s] };
    const done = { ...newProposal(brand), questionnaires: [answered] };
    expect(awaitingAnswers([p, done]).map((x) => x.q.id)).toEqual(["q1"]);
    expect(awaitingAnswers([{ ...p, status: "lost" as const }])).toEqual([]);
    // the family's answers never reach the shared proposal page
    expect(JSON.stringify(pageSnapshot({ ...done, client: { ...done.client, name: "A" } }, catalog, "dark"))).not.toContain("Traditional");
  });

  it("validates questionnaires.json, and the shipped file matches the built-in questionnaire", () => {
    const shipped = JSON.parse(readFileSync("public/config/questionnaires.json", "utf8"));
    expect(validateQuestionnaires(shipped)).toEqual([]);
    expect(shipped.questionnaires[0]).toEqual(DEFAULT_QUESTIONNAIRE);
    expect(isTemplate(DEFAULT_QUESTIONNAIRE)).toBe(true);
    expect(validateQuestionnaires({})[0]).toMatch(/"questionnaires"/);
    const errs = validateQuestionnaires({ questionnaires: [{ id: "a", title: "A", questions: [{ id: "1", text: "x", type: "choice", options: ["only"] }, { id: "1", text: "", type: "colour" }] }] }).join(" ");
    expect(errs).toMatch(/two "options"/);
    expect(errs).toMatch(/unique "id"/);
    expect(errs).toMatch(/"type"/);
  });
});
