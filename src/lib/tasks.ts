// Task management: the team's own tasks (not tied to a checklist) together with every wedding's checklist tasks,
// as one list that can be filtered by who and which event, grouped by when they're due. Pure, so it's tested.
import type { ChecklistItem, Proposal } from "../types";
import { dueOf } from "./checklist";
import { proposalStatus } from "./status";

export type TaskState = ChecklistItem["state"];

export interface TeamTask {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  due?: string;
  /** the sign-in email of who's doing it; none means anyone */
  assignee?: string;
  /** the proposal (wedding) it's for, if any */
  eventId?: string;
  state: TaskState;
  priority: "normal" | "high";
  notes?: string;
  done?: { at: string; by: string };
  createdAt: string;
  createdBy: string;
}

export const isTeamTask = (x: unknown): x is TeamTask => {
  const t = x as TeamTask;
  return !!t && typeof t === "object" && typeof t.id === "string" && typeof t.title === "string" && ["todo", "doing", "done"].includes(t.state);
};

/** One row of the task list: a team task, or a task from a wedding's checklist. */
export interface TaskRow {
  key: string;
  source: "team" | "checklist";
  id: string;
  /** the wedding it belongs to */
  proposalId?: string;
  title: string;
  due?: string;
  /** checklist tasks may be the family's; team tasks are always the team's */
  owner: "team" | "client";
  assignee?: string;
  state: TaskState;
  priority: "normal" | "high";
  notes?: string;
}

/** Team tasks and the checklists of every proposal that isn't lost. */
export function allTasks(team: TeamTask[], proposals: Proposal[]): TaskRow[] {
  const rows: TaskRow[] = team.map((t) => ({
    key: `t:${t.id}`,
    source: "team",
    id: t.id,
    proposalId: t.eventId,
    title: t.title,
    due: t.due,
    owner: "team",
    assignee: t.assignee,
    state: t.state,
    priority: t.priority,
    notes: t.notes,
  }));
  for (const p of proposals) {
    if (proposalStatus(p) === "lost") continue;
    for (const i of p.checklist ?? [])
      rows.push({ key: `c:${p.id}:${i.id}`, source: "checklist", id: i.id, proposalId: p.id, title: i.title, due: dueOf(i, p), owner: i.owner, state: i.state, priority: "normal", notes: i.notes });
  }
  return rows;
}

export type Who = "mine" | "team" | "family";

/**
 * Mine: team tasks assigned to me, or to nobody; Team: everything the team does; Family: checklist tasks the family
 * owes. Optionally only one wedding's.
 */
export function filterTasks(rows: TaskRow[], who: Who, account: string, eventId?: string): TaskRow[] {
  const me = account.trim().toLowerCase();
  return rows
    .filter((r) => !eventId || r.proposalId === eventId)
    .filter((r) =>
      who === "family" ? r.owner === "client" : who === "team" ? r.owner === "team" : r.owner === "team" && (r.source === "checklist" || !r.assignee || r.assignee.toLowerCase() === me),
    );
}

export type DueBucket = "overdue" | "week" | "later" | "undated" | "done";

const plusDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function bucketOfRow(r: Pick<TaskRow, "state" | "due">, today: string): DueBucket {
  if (r.state === "done") return "done";
  if (!r.due) return "undated";
  if (r.due < today) return "overdue";
  return r.due <= plusDays(today, 7) ? "week" : "later";
}

/** Due date first, high priority first within a day, undated last. */
export const sortRows = (rows: TaskRow[]) =>
  [...rows].sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || Number(b.priority === "high") - Number(a.priority === "high") || a.title.localeCompare(b.title));

/** Moving a team task; done records who and when, and leaving done clears it. */
export function setTeamState(t: TeamTask, state: TaskState, by: string, now = new Date()): TeamTask {
  const { done: _done, ...rest } = t;
  return state === "done" ? { ...rest, state, done: { at: now.toISOString(), by } } : { ...rest, state };
}

/** Open team tasks past their date: the Dashboard's "Tasks overdue". */
export const overdueRows = (rows: TaskRow[], today: string) => rows.filter((r) => r.owner === "team" && bucketOfRow(r, today) === "overdue");
