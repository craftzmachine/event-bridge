import { describe, expect, it } from "vitest";
import { bounds, clampToRoom, clashes, layoutCapacity, newItem, overlaps, seatPositions, starterLayout } from "./layout";

describe("venue layout", () => {
  it("places seats round a table, along a long table and in a row", () => {
    const round = seatPositions({ kind: "round", w: 1.8, h: 1.8, seats: 10 });
    expect(round).toHaveLength(10);
    expect(round.every((s) => Math.abs(Math.hypot(s.x, s.y) - 1.2) < 0.02)).toBe(true);
    const rect = seatPositions({ kind: "rect", w: 2.4, h: 0.9, seats: 7 });
    expect(rect.filter((s) => s.y < 0)).toHaveLength(4);
    expect(rect.filter((s) => s.y > 0)).toHaveLength(3);
    expect(seatPositions({ kind: "row", w: 5, h: 0.6, seats: 10 }).map((s) => s.y)).toEqual(Array(10).fill(0));
  });

  it("knows a rotated item's extent, keeps it in the room and finds overlaps", () => {
    const wall = { ...newItem("wall", { x: 5, y: 5 }), w: 6, h: 0.2, rot: 90 };
    const b = bounds(wall);
    expect(b.y1 - b.y0).toBeCloseTo(6);
    expect(clampToRoom({ ...wall, y: 1 }, { w: 30, h: 20 }).y).toBeCloseTo(3);
    const a = newItem("round", { x: 5, y: 5 });
    expect(overlaps(a, newItem("round", { x: 6, y: 5 }))).toBe(true);
    expect(overlaps(a, newItem("round", { x: 7, y: 5 }))).toBe(false);
    // a 45° square's corner reaches further than its box edge would suggest
    expect(overlaps({ ...newItem("dj", { x: 0, y: 0 }), w: 2, h: 2, rot: 45 }, { ...newItem("dj", { x: 1.6, y: 0 }), w: 1, h: 1 })).toBe(true);
  });

  it("sizes starter plans for the guests without overlaps", () => {
    for (const kind of ["rounds", "banquet", "ceremony"] as const) {
      const l = starterLayout(kind, 230);
      expect(layoutCapacity(l), kind).toBeGreaterThanOrEqual(230);
      expect(clashes(l.items).size, kind).toBe(0);
      for (const it of l.items) {
        const b = bounds(it);
        expect(b.x0 >= -0.01 && b.y0 >= -0.01 && b.x1 <= l.w + 0.01 && b.y1 <= l.h + 0.01, `${kind} ${it.label}`).toBe(true);
      }
    }
  });
});

describe("canvas editing helpers", () => {
  it("lines a moving table up with a neighbour's edge or centre, within the tolerance", async () => {
    const { snapGuides } = await import("./layout");
    const other = { x0: 5, y0: 5, x1: 7, y1: 7 };
    const r = snapGuides({ x0: 5.1, y0: 9, x1: 7.1, y1: 11 }, [other]);
    expect(r.dx).toBeCloseTo(-0.1);
    expect(r.dy).toBe(0);
    expect(r.guides).toEqual([expect.objectContaining({ dir: "v", at: 5 })]);
    expect(snapGuides({ x0: 5.5, y0: 9, x1: 7.5, y1: 11 }, [other]).guides).toEqual([]);
    // the room's centre line counts too
    expect(snapGuides({ x0: 14, y0: 0, x1: 15.95, y1: 1 }, [], 0.15, { w: 32, h: 20 }).dx).toBeCloseTo(0.05);
  });

  it("keeps round tables round and fits the seats to a resized table", async () => {
    const { resizeItem, seatsFor } = await import("./layout");
    const round = newItem("round", { x: 5, y: 5 });
    const small = resizeItem(round, 1.2, 1.5);
    expect(small.w).toBe(small.h);
    expect(small.seats).toBe(seatsFor("round", 1.5, 1.5));
    expect(seatsFor("round", 1.8, 1.8)).toBe(10);
    expect(seatsFor("rect", 2.4, 0.9)).toBe(8);
    expect(seatsFor("row", 5, 0.6)).toBe(10);
    expect(resizeItem(newItem("stage", { x: 5, y: 5 }), 0.1, 0.1)).toMatchObject({ w: 0.4, h: 0.4 });
    expect(seatsFor("rect", 20, 1)).toBe(24);
  });
});
