import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Brand, Proposal } from "../types";
import { newProposal } from "../state/proposals";
import { allTasks, bucketOfRow, filterTasks, isTeamTask, overdueRows, setTeamState, sortRows, type TeamTask } from "./tasks";

const brand: Brand = JSON.parse(readFileSync("public/config/brand.json", "utf8"));
const ME = "planner@studio.test";

const task = (extra: Partial<TeamTask>): TeamTask => ({ id: "t1", title: "Order jasmine", state: "todo", priority: "normal", createdAt: "", createdBy: ME, ...extra });
const wedding = (id: string, extra: Partial<Proposal> = {}): Proposal => {
  const p = newProposal(brand);
  return { ...p, id, client: { ...p.client, name: id, dates: ["2027-02-12"], date: "2027-02-12" }, ...extra };
};

describe("tasks", () => {
  const p = wedding("A", {
    checklist: [
      { id: "c1", title: "Décor theme agreed", owner: "team", state: "todo", offsetDays: 90 },
      { id: "c2", title: "Final guest count", owner: "client", state: "doing", offsetDays: 14 },
    ],
  });
  const lost = wedding("L", { status: "lost", checklist: [{ id: "x", title: "Lost one", owner: "team", state: "todo", due: "2026-01-01" }] });
  const team = [task({ id: "t1", due: "2026-11-20", assignee: ME }), task({ id: "t2", title: "Ravi's", assignee: "ravi@studio.test" }), task({ id: "t3", title: "Anyone's", priority: "high", due: "2026-11-20" })];
  const rows = allTasks(team, [p, lost]);

  it("merges team tasks with checklists, dating checklist tasks from the event, and skips lost proposals", () => {
    expect(rows.map((r) => r.key)).toEqual(["t:t1", "t:t2", "t:t3", "c:A:c1", "c:A:c2"]);
    expect(rows.find((r) => r.id === "c1")).toMatchObject({ source: "checklist", proposalId: "A", due: "2026-11-14", owner: "team" });
  });

  it("filters to mine, the whole team's or the family's, and by event", () => {
    expect(filterTasks(rows, "mine", ME).map((r) => r.id)).toEqual(["t1", "t3", "c1"]);
    expect(filterTasks(rows, "team", ME).map((r) => r.id)).toEqual(["t1", "t2", "t3", "c1"]);
    expect(filterTasks(rows, "family", ME).map((r) => r.id)).toEqual(["c2"]);
    expect(filterTasks(rows, "team", ME, "A").map((r) => r.id)).toEqual(["c1"]);
  });

  it("sorts by due date with high priority first, and groups by when they're due", () => {
    expect(sortRows(rows).map((r) => r.id)).toEqual(["c1", "t3", "t1", "c2", "t2"]);
    const today = "2026-11-22";
    expect(bucketOfRow({ state: "todo", due: "2026-11-21" }, today)).toBe("overdue");
    expect(bucketOfRow({ state: "todo", due: "2026-11-29" }, today)).toBe("week");
    expect(bucketOfRow({ state: "todo", due: "2026-11-30" }, today)).toBe("later");
    expect(bucketOfRow({ state: "todo" }, today)).toBe("undated");
    expect(bucketOfRow({ state: "done", due: "2026-01-01" }, today)).toBe("done");
    expect(overdueRows(rows, today).map((r) => r.id)).toEqual(["t1", "t3", "c1"]);
  });

  it("records who finished a team task, and clears it when reopened", () => {
    const done = setTeamState(task({}), "done", ME, new Date("2026-11-22T10:00:00Z"));
    expect(done.done).toEqual({ at: "2026-11-22T10:00:00.000Z", by: ME });
    expect(setTeamState(done, "doing", ME).done).toBeUndefined();
    expect(isTeamTask(done)).toBe(true);
    expect(isTeamTask({ ...done, state: "maybe" })).toBe(false);
  });
});
