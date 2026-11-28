import { describe, expect, it } from "vitest";
import { TUTORIAL, backStep, finished, onTutorialEvent, skipStep, startTutorial } from "./planTutorial";

describe("floor-plan tutorial", () => {
  it("moves on only when the current step's action happens", () => {
    let s = startTutorial();
    s = onTutorialEvent(s, "move");
    expect(s.step).toBe(0);
    s = onTutorialEvent(s, "add:rect");
    expect(s.step).toBe(0);
    s = onTutorialEvent(s, "add:round");
    expect(s).toMatchObject({ step: 1, done: ["add"] });
  });

  it("can be walked through, skipped and stepped back", () => {
    const events = ["add:round", "move", "resize", "seats", "add:aisle", "preset", "multi", "bulkSeats", "inventory", "undo", "3d"] as const;
    expect(events).toHaveLength(TUTORIAL.length);
    let s = startTutorial();
    for (const e of events) s = onTutorialEvent(s, e);
    expect(finished(s)).toBe(true);
    expect(s.done).toHaveLength(TUTORIAL.length);
    const t = backStep(skipStep(skipStep(startTutorial())));
    expect(t.step).toBe(1);
    expect(t.done).toEqual([]);
  });
});
