import { describe, expect, it } from "vitest";
import { boxSelect, drawOrder, itemsAt, newItem, reorder } from "./layout";

describe("floor plan selection and order", () => {
  const table = { ...newItem("round", { x: 5, y: 5 }), id: "t" };
  const dance = { ...newItem("dance", { x: 5, y: 5 }), id: "d" };
  const label = { ...newItem("label", { x: 5, y: 5 }), id: "l" };
  const pillar = { ...newItem("pillar", { x: 12, y: 5 }), id: "p" };
  const items = [label, table, dance, pillar];

  it("draws floor coverings under furniture, whatever order they were added in", () => {
    expect(drawOrder(items).map((i) => i.id)).toEqual(["d", "t", "p", "l"]);
    // a chair (outside the table top) still hits the table; the dance floor is underneath
    expect(itemsAt(items, { x: 5, y: 5 - 1.2 }).map((i) => i.id)).toEqual(["t", "d"]);
    expect(itemsAt(items.map((i) => (i.id === "t" ? { ...i, hidden: true } : i)), { x: 5, y: 3.8 }).map((i) => i.id)).toEqual(["d"]);
  });

  it("box-selects wholly inside left to right, anything touched right to left", () => {
    const box = { x0: 3, y0: 3, x1: 7, y1: 7 };
    expect(boxSelect(items, box, "inside").sort()).toEqual(["l", "t"]);
    expect(boxSelect(items, box, "touch").sort()).toEqual(["d", "l", "t"]);
  });

  it("reorders within a tier", () => {
    const a = { ...newItem("round", { x: 1, y: 1 }), id: "a" };
    const b = { ...newItem("rect", { x: 1, y: 1 }), id: "b" };
    const list = [a, dance, b];
    expect(reorder(list, ["a"], "forward").map((i) => i.id)).toEqual(["b", "d", "a"]);
    expect(reorder(list, ["b"], "back").map((i) => i.id)).toEqual(["b", "a", "d"]);
    expect(reorder(list, ["a"], "backward")).toEqual(list);
  });
});
