import { describe, expect, it } from "vitest";
import { backedUp, backupAge, backupDue, snoozed } from "./backup";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 20, 6);

describe("backup reminder", () => {
  it("stays quiet with no proposals, and after a recent backup", () => {
    expect(backupDue({}, 0, NOW)).toBe(false);
    expect(backupDue(backedUp(NOW - 6 * DAY), 3, NOW)).toBe(false);
  });
  it("is due when never backed up, or 7 days after the last backup", () => {
    expect(backupDue({}, 1, NOW)).toBe(true);
    expect(backupDue(backedUp(NOW - 7 * DAY), 1, NOW)).toBe(true);
  });
  it("can be put off for 3 days", () => {
    const later = snoozed(backedUp(NOW - 30 * DAY), NOW);
    expect(backupDue(later, 2, NOW + 2 * DAY)).toBe(false);
    expect(backupDue(later, 2, NOW + 3 * DAY)).toBe(true);
    // backing up clears the snooze
    expect(backedUp(NOW).snoozedUntil).toBeUndefined();
  });
  it("says how long ago the last backup was", () => {
    expect(backupAge({}, NOW)).toBe("Not backed up yet");
    expect(backupAge(backedUp(NOW - 3600_000), NOW)).toBe("Last backed up today");
    expect(backupAge(backedUp(NOW - DAY), NOW)).toBe("Last backed up yesterday");
    expect(backupAge(backedUp(NOW - 12 * DAY - 5), NOW)).toBe("Last backed up 12 days ago");
  });
});
