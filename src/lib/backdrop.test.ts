import { describe, expect, it } from "vitest";
import { calibrate, placeBackdrop, roomForBackdrop } from "./backdrop";

describe("venue drawing under a plan", () => {
  it("fits the room, then scales from one known length about the first point", () => {
    const b = placeBackdrop("img", { w: 2000, h: 1000 }, { w: 30, h: 20 });
    expect(b).toMatchObject({ x: 0, y: 0, w: 30, h: 15 });
    // a wall measured as 5 m on the drawing is really 10 m: twice the size, the first point stays put
    const s = calibrate(b, { x: 2, y: 1 }, { x: 7, y: 1 }, 10);
    expect(s).toMatchObject({ x: -2, y: -1, w: 60, h: 30 });
    expect(calibrate(b, { x: 2, y: 1 }, { x: 2, y: 1 }, 10)).toBe(b);
    const room = roomForBackdrop({ w: 30, h: 20, items: [{ id: "a", kind: "round", x: 5, y: 5, w: 1.8, h: 1.8, rot: 0 }], backdrop: s });
    expect(room).toMatchObject({ w: 60, h: 30, backdrop: { x: 0, y: 0 } });
    expect(room.items[0]).toMatchObject({ x: 7, y: 6 });
  });
});
