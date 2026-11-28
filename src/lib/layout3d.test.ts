import { describe, expect, it } from "vitest";
import { buildScene, HEIGHTS } from "./layout3d";
import { newItem, starterLayout } from "./layout";

describe("3D scene", () => {
  it("builds a table with its chairs facing it, and floor-standing parts", () => {
    const t = { ...newItem("round", { x: 5, y: 5 }), seats: 8, label: "Table 4" };
    const s = buildScene({ w: 20, h: 15, items: [t] });
    expect(s.chairs).toHaveLength(8);
    // every part rests on or above the floor
    expect(s.parts.every((p) => p.y - p.h / 2 >= -1e-9)).toBe(true);
    expect(s.parts.some((p) => p.paint === "linen" && Math.abs(p.y + p.h / 2 - HEIGHTS.table) < 0.01)).toBe(true);
    // a chair's back (local −z) points away from the table centre
    for (const c of s.chairs) {
      // three.js turns local (0, 0, −1) by rotY into (−sin rotY, 0, −cos rotY)
      const bx = -Math.sin(c.rotY);
      const bz = -Math.cos(c.rotY);
      expect(bx * (c.x - 5) + bz * (c.z - 5)).toBeGreaterThan(0);
    }
    expect(s.labels).toEqual([expect.objectContaining({ text: "4", badge: true, x: 5, z: 5 })]);
  });

  it("maps a rotated item and finds the entrance and stage for the cameras", () => {
    const l = starterLayout("rounds", 120);
    const s = buildScene(l);
    const stage = l.items.find((i) => i.kind === "stage")!;
    const door = l.items.find((i) => i.kind === "entrance")!;
    expect(s.focus).toEqual({ x: stage.x, z: stage.y });
    expect(s.entrance).toEqual({ x: door.x, z: door.y });
    expect(s.chairs.length).toBe(l.items.reduce((n, i) => n + (i.seats ?? 0), 0));
    const wall = { ...newItem("wall", { x: 10, y: 10 }), rot: 90 };
    const w = buildScene({ w: 20, h: 20, items: [wall] }).parts[0];
    expect(w.rotY).toBeCloseTo(-Math.PI / 2);
    expect([w.x, w.z]).toEqual([10, 10]);
  });
});
