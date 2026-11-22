import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Brand, Catalog, ChecklistItem, Proposal } from "../types";
import { newProposal } from "../state/proposals";
import { validateChecklists } from "../config/validate";
import { bucketOf, DEFAULT_CHECKLIST, draftChecklist, dueOf, overdueAcross, progress, resetChecklist, setState, templatesFor } from "./checklist";
import { pageSnapshot } from "./proposalPage";

const catalog: Catalog = JSON.parse(readFileSync("public/config/catalog.json", "utf8"));
const brand: Brand = JSON.parse(readFileSync("public/config/brand.json", "utf8"));
const ME = "planner@studio.test";

function wedding(dates: string[] = ["2027-02-14", "2027-02-12"]): Proposal {
  const p = newProposal(brand);
  p.client = { ...p.client, name: "Ms. Ananya Menon", dates: [...dates].sort(), date: [...dates].sort()[0] ?? "" };
  return p;
}
let n = 0;
const ids = () => `c-${++n}`;

describe("wedding checklist", () => {
  it("drafts the built-in list, timed back from the first event date", () => {
    const p = wedding();
    const list = draftChecklist(p, DEFAULT_CHECKLIST, ids);
    expect(list).toHaveLength(DEFAULT_CHECKLIST.length);
    expect(list.every((i) => i.state === "todo")).toBe(true);
    const venue = list.find((i) => i.title.startsWith("Venue booked"))!;
    expect(dueOf(venue, p)).toBe("2026-08-16"); // 180 days before 12 Feb 2027
    const settle = list.find((i) => i.title.startsWith("Expenses and staff advances"))!;
    expect(dueOf(settle, p)).toBe("2027-02-15"); // 3 days after the first date
    expect(dueOf({ due: "2027-01-01", offsetDays: 90 }, p)).toBe("2027-01-01");
    expect(dueOf({ offsetDays: 90 }, wedding([]))).toBeUndefined();
  });

  it("picks template tasks by event type and ceremony style", () => {
    const t = [
      { id: "a", title: "All", offsetDays: 1, owner: "team" as const },
      { id: "b", title: "Hindu only", offsetDays: 1, owner: "team" as const, ceremonyStyles: ["hindu"] },
      { id: "c", title: "Any style", offsetDays: 1, owner: "team" as const, ceremonyStyles: ["*"] },
    ];
    expect(templatesFor({ eventType: "wedding", style: "hindu" }, t).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(templatesFor({ eventType: "wedding", style: "christian" }, t).map((x) => x.id)).toEqual(["a", "c"]);
    expect(templatesFor({ eventType: null, style: null }, t).map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("sorts tasks into overdue, this week, later, no date and done", () => {
    const p = wedding(["2027-02-12"]);
    const item = (extra: Partial<ChecklistItem>): ChecklistItem => ({ id: "x", title: "t", owner: "team", state: "todo", ...extra });
    const today = "2027-01-10";
    expect(bucketOf(item({ due: "2027-01-09" }), p, today)).toBe("overdue");
    expect(bucketOf(item({ due: "2027-01-10" }), p, today)).toBe("week");
    expect(bucketOf(item({ due: "2027-01-17" }), p, today)).toBe("week");
    expect(bucketOf(item({ due: "2027-01-18" }), p, today)).toBe("later");
    expect(bucketOf(item({ offsetDays: 30 }), p, today)).toBe("week"); // 13 Jan, 30 days before 12 Feb
    expect(bucketOf(item({ offsetDays: 40 }), p, today)).toBe("overdue"); // 3 Jan
    expect(bucketOf(item({}), p, today)).toBe("undated");
    expect(bucketOf(item({ due: "2027-01-01", state: "done" }), p, today)).toBe("done");
  });

  it("records who finished a task, and clears it when reopened", () => {
    const list: ChecklistItem[] = [{ id: "a", title: "t", owner: "team", state: "todo" }];
    const done = setState(list, "a", "done", ME, new Date("2027-01-02T10:00:00Z"));
    expect(done[0]).toMatchObject({ state: "done", done: { by: ME, at: "2027-01-02T10:00:00.000Z" } });
    expect(progress(done)).toEqual({ done: 1, total: 1, pct: 1 });
    const back = setState(done, "a", "doing", ME);
    expect(back[0].state).toBe("doing");
    expect(back[0].done).toBeUndefined();
    expect(progress(undefined)).toEqual({ done: 0, total: 0, pct: 0 });
  });

  it("lists overdue tasks across proposals, skipping lost ones and finished tasks", () => {
    const a = { ...wedding(["2027-02-12"]), checklist: [{ id: "1", title: "Late", owner: "team" as const, state: "todo" as const, due: "2027-01-01" }, { id: "2", title: "Done", owner: "team" as const, state: "done" as const, due: "2026-12-01" }] };
    const b = { ...wedding(["2027-03-01"]), status: "lost" as const, checklist: [{ id: "3", title: "Lost", owner: "team" as const, state: "todo" as const, due: "2026-12-01" }] };
    expect(overdueAcross([a, b], "2027-01-10").map((x) => x.item.title)).toEqual(["Late"]);
  });

  it("starts a copy's checklist again, and keeps it off the client's page", () => {
    const p = { ...wedding(), checklist: setState(draftChecklist(wedding(), DEFAULT_CHECKLIST, ids), "c-1", "done", ME) };
    p.checklist = setState(p.checklist, p.checklist[0].id, "done", ME);
    const reset = resetChecklist(p.checklist)!;
    expect(reset.every((i) => i.state === "todo" && !("done" in i))).toBe(true);
    const snap = JSON.stringify(pageSnapshot(p, catalog, "dark"));
    expect(snap).not.toContain("checklist");
    expect(snap).not.toContain("Venue booked");
  });

  it("validates checklists.json", () => {
    expect(validateChecklists({ items: DEFAULT_CHECKLIST })).toEqual([]);
    expect(validateChecklists({})[0]).toMatch(/"items"/);
    const errs = validateChecklists({ items: [{ id: "a", title: "x", offsetDays: 1.5, owner: "me" }, { id: "a", title: "", offsetDays: 3, owner: "team", eventTypes: "x" }] });
    expect(errs.join(" ")).toMatch(/offsetDays/);
    expect(errs.join(" ")).toMatch(/"owner"/);
    expect(errs.join(" ")).toMatch(/used twice/);
  });
});
