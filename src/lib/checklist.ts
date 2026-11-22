// A wedding's checklist: tasks timed back from the first event date ("90 days before: décor theme agreed"), who
// owes each one (the team or the family), and where each stands. Pure; the list lives on the proposal.
import type { ChecklistItem, ChecklistTemplate, Proposal } from "../types";
import { eventDates } from "./proposal";

/**
 * The built-in starting list for a Kerala wedding, used when public/config/checklists.json is missing. The tasks
 * and timings are placeholders for the team to adjust there.
 */
export const DEFAULT_CHECKLIST: ChecklistTemplate[] = [
  { id: "venue", title: "Venue booked and its advance paid", offsetDays: 180, owner: "team" },
  { id: "muhurtham", title: "Muhurtham date and time confirmed with the family", offsetDays: 150, owner: "client" },
  { id: "photo", title: "Photography and videography booked", offsetDays: 120, owner: "team" },
  { id: "guests-estimate", title: "Guest count estimate from the family", offsetDays: 120, owner: "client" },
  { id: "decor", title: "Décor theme and mood board agreed", offsetDays: 90, owner: "team" },
  { id: "menu", title: "Catering menu shortlisted", offsetDays: 90, owner: "team" },
  { id: "makeup", title: "Bridal makeup artist booked", offsetDays: 75, owner: "team" },
  { id: "invites", title: "Invitations printed and sent", offsetDays: 60, owner: "client" },
  { id: "music", title: "Nadaswaram and music booked", offsetDays: 45, owner: "team" },
  { id: "tasting", title: "Menu tasting with the family", offsetDays: 30, owner: "client" },
  { id: "stay", title: "Guest transport and stays arranged", offsetDays: 30, owner: "team" },
  { id: "guests-final", title: "Final guest count from the family", offsetDays: 14, owner: "client" },
  { id: "runsheet", title: "Event-day plan shared with the crew", offsetDays: 10, owner: "team" },
  { id: "payment", title: "Final payment collected", offsetDays: 7, owner: "team" },
  { id: "confirm", title: "Every vendor called to confirm", offsetDays: 2, owner: "team" },
  { id: "setup", title: "Décor setup and venue walkthrough", offsetDays: 1, owner: "team" },
  { id: "handover", title: "Venue handed back, teardown done", offsetDays: -1, owner: "team" },
  { id: "settle", title: "Expenses and staff advances settled", offsetDays: -3, owner: "team" },
];

const fits = (tags: string[] | undefined, value: string | null) => !tags?.length || tags.includes("*") || (!!value && tags.includes(value));

/** The template tasks for this proposal's event type and ceremony style. */
export function templatesFor(p: Pick<Proposal, "eventType" | "style">, templates: ChecklistTemplate[]): ChecklistTemplate[] {
  return templates.filter((t) => fits(t.eventTypes, p.eventType) && fits(t.ceremonyStyles, p.style));
}

/** A fresh checklist from the templates, every task to do. */
export function draftChecklist(p: Pick<Proposal, "eventType" | "style">, templates: ChecklistTemplate[], newId: () => string): ChecklistItem[] {
  return templatesFor(p, templates).map((t) => ({ id: newId(), title: t.title, offsetDays: t.offsetDays, owner: t.owner, state: "todo" }));
}

const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** When a task is due: its own date, or its offset before the first event date; undefined while that isn't set. */
export function dueOf(item: Pick<ChecklistItem, "due" | "offsetDays">, p: Pick<Proposal, "client">): string | undefined {
  if (item.due) return item.due;
  const first = eventDates(p as Proposal)[0];
  return first && typeof item.offsetDays === "number" ? shift(first, -item.offsetDays) : undefined;
}

export type Bucket = "overdue" | "week" | "later" | "undated" | "done";

export const BUCKET_LABEL: Record<Bucket, string> = {
  overdue: "Overdue",
  week: "This week",
  later: "Later",
  undated: "No date yet",
  done: "Done",
};

/** Where a task falls today: done, overdue, due within 7 days, later, or not datable yet. */
export function bucketOf(item: ChecklistItem, p: Pick<Proposal, "client">, today: string): Bucket {
  if (item.state === "done") return "done";
  const due = dueOf(item, p);
  if (!due) return "undated";
  if (due < today) return "overdue";
  return due <= shift(today, 7) ? "week" : "later";
}

export function progress(items: ChecklistItem[] | undefined): { done: number; total: number; pct: number } {
  const list = items ?? [];
  const done = list.filter((i) => i.state === "done").length;
  return { done, total: list.length, pct: list.length ? done / list.length : 0 };
}

/** Moving a task between to do, doing and done; done records who and when, and leaving done clears it. */
export function setState(items: ChecklistItem[], id: string, state: ChecklistItem["state"], by: string, now = new Date()): ChecklistItem[] {
  return items.map((i) => {
    if (i.id !== id) return i;
    const { done: _done, ...rest } = i;
    return state === "done" ? { ...rest, state, done: { at: now.toISOString(), by } } : { ...rest, state };
  });
}

/** Every open task past its due date, across proposals that aren't lost, oldest first. */
export function overdueAcross(list: Proposal[], today: string): { proposal: Proposal; item: ChecklistItem; due: string }[] {
  return list
    .filter((p) => p.status !== "lost")
    .flatMap((p) => (p.checklist ?? []).filter((i) => bucketOf(i, p, today) === "overdue").map((item) => ({ proposal: p, item, due: dueOf(item, p)! })))
    .sort((a, b) => a.due.localeCompare(b.due));
}

/** A copied proposal starts its checklist again. */
export const resetChecklist = (items: ChecklistItem[] | undefined) => items?.map(({ done: _done, ...i }) => ({ ...i, state: "todo" as const }));
