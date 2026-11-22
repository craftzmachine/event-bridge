import { describe, expect, it } from "vitest";
import { calendarMonth, gridRange, shiftMonth } from "./calendar";

describe("calendar", () => {
  it("lays a month out in Monday-first weeks, filling the edges", () => {
    // February 2027 starts on a Monday and ends on a Sunday: exactly four weeks
    expect(gridRange("2027-02")).toEqual({ from: "2027-02-01", to: "2027-02-28" });
    expect(calendarMonth("2027-02", [], "2027-02-10")).toHaveLength(4);
    // December 2026 starts on a Tuesday and ends on a Thursday
    expect(gridRange("2026-12")).toEqual({ from: "2026-11-30", to: "2027-01-03" });
    const dec = calendarMonth("2026-12", [{ date: "2026-12-14", label: "Muhurtham" }, { date: "2026-12-14", label: "Reception" }, { date: "2027-01-03", label: "Edge" }], "2026-12-01");
    expect(dec).toHaveLength(5);
    expect(dec.every((w) => w.length === 7)).toBe(true);
    expect(dec[0][0]).toMatchObject({ date: "2026-11-30", inMonth: false });
    expect(dec[0][1]).toMatchObject({ date: "2026-12-01", inMonth: true, isToday: true });
    expect(dec.flat().find((x) => x.date === "2026-12-14")!.events.map((e) => e.label)).toEqual(["Muhurtham", "Reception"]);
    expect(dec[4][6]).toMatchObject({ date: "2027-01-03", inMonth: false, events: [{ label: "Edge" }] });
  });

  it("moves between months across years", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(shiftMonth("2026-11", 14)).toBe("2028-01");
  });
});
