// A month grid for the Dashboard's calendar: weeks starting on Monday, with the days around the month filled in.
// Pure, so it's tested in Node.

export interface CalendarDay<T> {
  /** YYYY-MM-DD */
  date: string;
  /** false for the days before and after the month that complete its first and last weeks */
  inMonth: boolean;
  isToday: boolean;
  events: T[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "2026-11" moved by n months: shiftMonth("2026-12", 1) → "2027-01" */
export function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** The first and last date the grid shows (Monday before the 1st to Sunday after the month's end). */
export function gridRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const start = new Date(y, m - 1, 1 - ((first.getDay() + 6) % 7));
  const last = new Date(y, m, 0);
  const end = new Date(y, m - 1, last.getDate() + (6 - ((last.getDay() + 6) % 7)));
  return { from: iso(start), to: iso(end) };
}

/** The month as weeks of seven days, each with the events on that date. */
export function calendarMonth<T extends { date: string }>(ym: string, events: T[], today: string): CalendarDay<T>[][] {
  const { from, to } = gridRange(ym);
  const weeks: CalendarDay<T>[][] = [];
  const [y, m, d] = from.split("-").map(Number);
  for (let i = 0; ; i++) {
    const day = iso(new Date(y, m - 1, d + i));
    if (day > to) break;
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push({ date: day, inMonth: day.startsWith(ym), isToday: day === today, events: events.filter((e) => e.date === day) });
  }
  return weeks;
}
