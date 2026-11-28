import { describe, expect, it } from "vitest";
import { checkPlan } from "./safety";
import { newItem } from "./layout";
import type { LayoutItem } from "../types";

const at = (kind: LayoutItem["kind"], x: number, y: number, extra: Partial<LayoutItem> = {}): LayoutItem => ({ ...newItem(kind, { x, y }), ...extra });

describe("floor plan safety checks", () => {
  it("flags a narrow aisle and widens it", () => {
    const aisle = at("aisle", 10, 10, { w: 1, h: 8 });
    const issues = checkPlan({ w: 30, h: 20, items: [aisle] });
    const i = issues.find((x) => x.id.startsWith("aisle"))!;
    expect(i.level).toBe("warn");
    expect(i.fix!.apply([aisle])[0]).toMatchObject({ w: 1.2, h: 8 });
  });

  it("flags tables too close, chairs near the stage, a blocked entrance and a crowded room", () => {
    const a = at("round", 5, 10);
    const b = at("round", 8, 10); // 3 m apart: chairs 0.6 m apart, back to back about 0.1 m
    const far = at("round", 20, 10);
    const stage = at("stage", 5, 4); // 8 × 4: front edge at y 6, a's top chair at y 8.8
    const door = at("entrance", 20, 19.75);
    const desk = at("desk", 20, 18.5);
    const ids = checkPlan({ w: 30, h: 20, items: [a, b, far, stage, door, desk] }).map((i) => i.id);
    expect(ids).toContain(`gap:${a.id}:${b.id}`);
    expect(ids.some((i) => i.includes(far.id))).toBe(false);
    expect(ids).toContain(`door:${door.id}`);
    expect(checkPlan({ w: 30, h: 20, items: [a, { ...stage, y: 7 }] }).map((i) => i.id)).toContain(`stage:${stage.id}`);
    const many = Array.from({ length: 40 }, (_, i) => at("round", 2 + (i % 8) * 3, 2 + Math.floor(i / 8) * 3));
    expect(checkPlan({ w: 12, h: 10, items: many }, 500).map((i) => i.id)).toEqual(expect.arrayContaining(["density", "seats"]));
  });
});
