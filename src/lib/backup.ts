// When to remind the team that proposals live only in this browser. Pure, so it's tested in Node.

export const BACKUP_EVERY_DAYS = 7;
export const SNOOZE_DAYS = 3;
const DAY = 86_400_000;

export interface BackupState {
  /** last "Back up all", ms since epoch */
  at?: number;
  /** "Remind me later" hides the note until then, ms since epoch */
  snoozedUntil?: number;
}

/** Due when there's something to lose, no full backup in the last 7 days (or ever), and no snooze running. */
export function backupDue(state: BackupState, count: number, now: number): boolean {
  if (count === 0) return false;
  if (state.snoozedUntil && state.snoozedUntil > now) return false;
  return !state.at || now - state.at >= BACKUP_EVERY_DAYS * DAY;
}

/** "Not backed up yet", "Last backed up yesterday", "Last backed up 12 days ago". */
export function backupAge(state: BackupState, now: number): string {
  if (!state.at) return "Not backed up yet";
  const days = Math.floor((now - state.at) / DAY);
  return days <= 0 ? "Last backed up today" : days === 1 ? "Last backed up yesterday" : `Last backed up ${days} days ago`;
}

export const snoozed = (state: BackupState, now: number): BackupState => ({ ...state, snoozedUntil: now + SNOOZE_DAYS * DAY });
export const backedUp = (now: number): BackupState => ({ at: now });
