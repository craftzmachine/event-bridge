import { describe, expect, it } from "vitest";
import { NAV_ITEMS, navCurrent } from "./nav";

describe("app navigation", () => {
  it("knows which section a URL belongs to", () => {
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

  it("puts four sections in the phone tab bar and the rest under More", () => {
    expect(NAV_ITEMS.filter((x) => x.tab).map((x) => x.id)).toEqual(["dashboard", "events", "studio", "expenses"]);
    expect(NAV_ITEMS.filter((x) => !x.tab).map((x) => x.id)).toEqual(["venues", "visualize"]);
    expect(new Set(NAV_ITEMS.map((x) => x.href)).size).toBe(NAV_ITEMS.length);
  });
});
