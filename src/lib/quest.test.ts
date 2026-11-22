import { describe, expect, it } from "vitest";
import { LEVELS, newlyDone, QUESTS, questStatus, TOTAL_XP, TOUR, type QuestFacts } from "./quest";

const none: QuestFacts = {
  proposals: 0,
  builtProposal: false,
  accepted: 0,
  shared: false,
  checklists: 0,
  checklistDone: false,
  questionnairesSent: 0,
  portals: 0,
  leads: 0,
  vendors: 0,
  teamTasks: 0,
  expenses: 0,
  backedUp: false,
  visited: [],
  tourDone: false,
};
const all: QuestFacts = { ...none, proposals: 3, builtProposal: true, accepted: 1, shared: true, checklists: 1, checklistDone: true, questionnairesSent: 1, portals: 1, leads: 2, vendors: 4, teamTasks: 1, expenses: 5, backedUp: true, visited: ["venues"], tourDone: true };

describe("wedding quest", () => {
  it("starts a new planner at zero, suggesting the tour first", () => {
    const s = questStatus(none);
    expect(s.xp).toBe(0);
    expect(s.done.size).toBe(0);
    expect(s.level.title).toBe("Fresh Garland");
    expect(s.next?.title).toBe("Haldi Helper");
    expect(s.nextQuest?.id).toBe("tour");
  });

  it("ticks quests off from what's really been done, and levels up with XP", () => {
    const s = questStatus({ ...none, tourDone: true, proposals: 1, leads: 1 });
    expect([...s.done].sort()).toEqual(["enquiry", "proposal", "tour"]);
    expect(s.xp).toBe(100);
    expect(s.level.title).toBe("Haldi Helper");
    expect(s.nextQuest?.id).toBe("build");
  });

  it("makes every quest reachable, and the top level exactly the total XP", () => {
    const s = questStatus(all);
    expect(s.done.size).toBe(QUESTS.length);
    expect(s.xp).toBe(TOTAL_XP);
    expect(s.level.title).toBe("Muhurtham Legend");
    expect(s.next).toBeUndefined();
    expect(s.nextQuest).toBeUndefined();
    expect(LEVELS.at(-1)!.xp).toBe(TOTAL_XP);
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(QUESTS.length);
  });

  it("celebrates only quests finished since the last look", () => {
    expect(newlyDone(new Set(["tour", "proposal"]), ["tour"])).toEqual(["proposal"]);
    expect(newlyDone(new Set(["tour"]), ["tour", "proposal"])).toEqual([]);
  });

  it("tours real pages, ending on the quest button", () => {
    for (const t of TOUR) expect(t.hash).toMatch(/^#\/(dashboard|studio|crm|events)$/);
    expect(TOUR[0].target).toBeUndefined();
    expect(TOUR.at(-1)!.target).toBe("quest");
  });
});
