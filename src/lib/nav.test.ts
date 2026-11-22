import { describe, expect, it } from "vitest";
import { APPS, navCurrent } from "./nav";

describe("app navigation", () => {
  it("knows which app a URL belongs to", () => {
    expect(navCurrent("#/dashboard")).toBe("dashboard");
    expect(navCurrent("#/expenses/company")).toBe("expenses");
    expect(navCurrent("#/expenses/review/h-1")).toBe("expenses");
    expect(navCurrent("#/events/abc")).toBe("events");
    expect(navCurrent("#/Venues")).toBe("venues");
    expect(navCurrent("#/")).toBeNull();
    expect(navCurrent("#/login")).toBeNull();
    expect(navCurrent("#/view/tok")).toBeNull();
    expect(navCurrent("")).toBeNull();
  });

  it("lists each app once, with its own address and a description for its Dashboard tile", () => {
    expect(new Set(APPS.map((x) => x.id)).size).toBe(APPS.length);
    expect(new Set(APPS.map((x) => x.href)).size).toBe(APPS.length);
    for (const a of APPS) {
      expect(a.href).toBe(`#/${a.id}`);
      expect(a.description.length).toBeGreaterThan(10);
    }
  });
});
