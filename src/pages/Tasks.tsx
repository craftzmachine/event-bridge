import { useEffect, useRef, useState } from "react";
import EmptyState from "../components/EmptyState";
import { createPortal } from "react-dom";
import type { Proposal } from "../types";
import { uid, type useProposals } from "../state/proposals";
import { downloadList, readListFile, useStoredList } from "../state/local";
import { TASKS_FORMAT, TASKS_KEY } from "../state/tasks";
import { allTasks, bucketOfRow, filterTasks, isTeamTask, setTeamState, sortRows, type DueBucket, type TaskRow, type TaskState, type TeamTask, type Who } from "../lib/tasks";
import { setState as setChecklistState } from "../lib/checklist";
import { calendarMonth, shiftMonth } from "../lib/calendar";
import { monthLabel } from "../lib/books";
import { eventsFor } from "../lib/events";
import { formatDate, todayISO } from "../lib/format";
import PageHeader from "../components/PageHeader";

type Store = ReturnType<typeof useProposals>;
type View = "list" | "board" | "calendar";

const GROUPS: { id: DueBucket; label: string }[] = [
  { id: "overdue", label: "Overdue" },
  { id: "week", label: "This week" },
  { id: "later", label: "Later" },
  { id: "undated", label: "No date" },
  { id: "done", label: "Done" },
];
const COLUMNS: { state: TaskState; label: string }[] = [
  { state: "todo", label: "To do" },
  { state: "doing", label: "Doing" },
  { state: "done", label: "Done" },
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const blank = (by: string): TeamTask => ({ id: `t-${uid()}`, title: "", state: "todo", priority: "normal", createdAt: new Date().toISOString(), createdBy: by });

/**
 * #/tasks: the team's own tasks and every wedding's checklist tasks in one place, as a list grouped by when
 * they're due, a to do / doing / done board, or a calendar. Ticking a checklist task here ticks it in the
 * wedding's workspace too.
 */
export default function Tasks({ store, account }: { store: Store; account: string }) {
  const team = useStoredList(TASKS_KEY, isTeamTask);
  const [who, setWho] = useState<Who>("mine");
  const [eventId, setEventId] = useState("");
  const [view, setView] = useState<View>("list");
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [editing, setEditing] = useState<TeamTask | null>(null);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const today = todayISO();

  const rows = sortRows(filterTasks(allTasks(team.list, store.list), who, account, eventId || undefined));
  const events = eventsFor(store.list, "all", today);
  const clientOf = (id?: string) => (id ? store.list.find((p) => p.id === id)?.client.name || "Untitled client" : "");

  function move(r: TaskRow, state: TaskState) {
    if (r.source === "team") team.update(r.id, (t) => setTeamState(t, state, account));
    else if (r.proposalId) store.update(r.proposalId, (p: Proposal) => ({ ...p, checklist: setChecklistState(p.checklist ?? [], r.id, state, account) }));
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    const items = await readListFile(file, TASKS_FORMAT, isTeamTask);
    setMsg(items ? `Imported ${team.importMany(items)} task${items.length === 1 ? "" : "s"}.` : "That file isn't a task list from Event Bridge.");
    if (fileRef.current) fileRef.current.value = "";
  }

  const meta = (r: TaskRow) =>
    [r.due ? formatDate(r.due) : "No date", r.proposalId ? clientOf(r.proposalId) : "", r.owner === "client" ? "Family" : r.assignee ?? (r.source === "team" ? "Anyone" : "Team"), r.source === "checklist" ? "Checklist" : "", r.priority === "high" ? "High priority" : ""]
      .filter(Boolean)
      .join(" · ");

  const open = (r: TaskRow) => {
    if (r.source === "team") setEditing(team.list.find((t) => t.id === r.id) ?? null);
    else location.hash = `/events/${r.proposalId}/checklist`;
  };

  const row = (r: TaskRow) => (
    <li key={r.key} className={`ck-item is-${bucketOfRow(r, today)}${r.priority === "high" ? " is-high" : ""}`}>
      <label className="ck-tick">
        <input type="checkbox" checked={r.state === "done"} onChange={(e) => move(r, e.target.checked ? "done" : "todo")} />
        <span className="ck-title">{r.title}</span>
      </label>
      <span className="ck-meta">{meta(r)}{r.state === "doing" ? " · in progress" : ""}</span>
      <span className="ck-tools">
        <button type="button" className="link-btn" onClick={() => open(r)}>{r.source === "team" ? "Edit" : "Open"}</button>
      </span>
    </li>
  );

  const weeks = calendarMonth(month, rows.filter((r) => r.due && r.state !== "done").map((r) => ({ ...r, date: r.due! })), today);

  return (
    <div className="ev-page">
      <PageHeader
        crumbs={[{ label: "Dashboard", href: "#/dashboard" }, { label: "Tasks" }]}
        title="Tasks"
        subtitle="The team's own tasks and every wedding's checklist, in one place."
        actions={
          <>
            <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>Import</button>
            <button type="button" className="btn-ghost" disabled={!team.list.length} onClick={() => downloadList(`Tasks_${today}.json`, TASKS_FORMAT, team.list)}>Export</button>
            <button type="button" className="btn-primary" onClick={() => setEditing(blank(account))}>Add a task</button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
          </>
        }
      />
      <main className="ev-main">
        {msg && <p className="toast" role="status">{msg}</p>}
        <div className="ev-filters">
          <div className="seg" role="group" aria-label="Whose tasks">
            {(["mine", "team", "family"] as const).map((w) => (
              <button key={w} type="button" className={who === w ? "is-on" : ""} aria-pressed={who === w} onClick={() => setWho(w)}>
                {w === "mine" ? "Mine" : w === "team" ? "Whole team" : "Family's"}
              </button>
            ))}
          </div>
          <select aria-label="Event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">All events</option>
            {events.map((p) => <option key={p.id} value={p.id}>{p.client.name || "Untitled client"}</option>)}
          </select>
          <div className="seg" role="group" aria-label="Show as">
            {(["list", "board", "calendar"] as const).map((v) => (
              <button key={v} type="button" className={view === v ? "is-on" : ""} aria-pressed={view === v} onClick={() => setView(v)}>
                {v === "list" ? "List" : v === "board" ? "Board" : "Calendar"}
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon="check" title={who === "family" ? "No family tasks" : "Nothing to do here"}>
            {who === "family" ? "They come from each wedding's checklist." : "Add a task, or start a wedding's checklist from its event page."}
          </EmptyState>
        ) : view === "list" ? (
          GROUPS.map((g) => {
            const group = rows.filter((r) => bucketOfRow(r, today) === g.id);
            return group.length ? (
              <div key={g.id} className={`ck-group is-${g.id}`}>
                <h3>{g.label} <small>{group.length}</small></h3>
                <ul className="ck-list">{group.map(row)}</ul>
              </div>
            ) : null;
          })
        ) : view === "board" ? (
          <div className="ck-board">
            {COLUMNS.map((c, ci) => {
              const col = rows.filter((r) => r.state === c.state);
              return (
                <div key={c.state} className="ck-col" aria-label={c.label}>
                  <h3>{c.label} <small>{col.length}</small></h3>
                  {col.map((r) => (
                    <div key={r.key} className={`ck-card is-${bucketOfRow(r, today)}`}>
                      <strong>{r.title}</strong>
                      <span>{meta(r)}</span>
                      <div className="ck-card-tools">
                        {ci > 0 && <button type="button" className="btn-ghost btn-sm" onClick={() => move(r, COLUMNS[ci - 1].state)}>← {COLUMNS[ci - 1].label}</button>}
                        {ci < COLUMNS.length - 1 && <button type="button" className="btn-ghost btn-sm" onClick={() => move(r, COLUMNS[ci + 1].state)}>{COLUMNS[ci + 1].label} →</button>}
                        <button type="button" className="link-btn" onClick={() => open(r)}>{r.source === "team" ? "Edit" : "Open"}</button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <section className="dash-card">
            <div className="dash-section-head">
              <h2>{monthLabel(month)}</h2>
              <span className="dash-cal-nav">
                <button type="button" className="btn-ghost btn-sm" aria-label="Previous month" onClick={() => setMonth((m) => shiftMonth(m, -1))}>‹</button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setMonth(today.slice(0, 7))}>Today</button>
                <button type="button" className="btn-ghost btn-sm" aria-label="Next month" onClick={() => setMonth((m) => shiftMonth(m, 1))}>›</button>
              </span>
            </div>
            <div className="dash-cal">
              <div className="dash-cal-row dash-cal-head" aria-hidden="true">{WEEKDAYS.map((w) => <span key={w}>{w}</span>)}</div>
              {weeks.map((w) => (
                <div key={w[0].date} className="dash-cal-row">
                  {w.map((d) => (
                    <div key={d.date} className={`dash-cal-day${d.inMonth ? "" : " is-out"}${d.isToday ? " is-today" : ""}${d.events.length ? " has-events" : ""}`} aria-label={`${formatDate(d.date)}: ${d.events.length} task${d.events.length === 1 ? "" : "s"}`}>
                      <span className="dash-cal-no">{Number(d.date.slice(8))}</span>
                      {d.events.slice(0, 3).map((r) => <button type="button" key={r.key} className="dash-cal-ev task-cal-ev" onClick={() => open(r)}>{r.title}</button>)}
                      {d.events.length > 3 && <span className="dash-cal-more">+{d.events.length - 3} more</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
      {editing && (
        <TaskDialog
          task={editing}
          isNew={!team.list.some((t) => t.id === editing.id)}
          events={events}
          people={[...new Set([account, ...team.list.map((t) => t.assignee ?? ""), ...team.list.map((t) => t.createdBy)].filter(Boolean))]}
          onSave={(t) => {
            team.save({ ...t, title: t.title.trim(), notes: t.notes?.trim() || undefined });
            setEditing(null);
          }}
          onDelete={(t) => {
            if (confirm(`Delete “${t.title}”?`)) {
              team.remove(t.id);
              setEditing(null);
            }
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function TaskDialog({ task, isNew, events, people, onSave, onDelete, onClose }: { task: TeamTask; isNew: boolean; events: Proposal[]; people: string[]; onSave: (t: TeamTask) => void; onDelete: (t: TeamTask) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [t, setT] = useState(task);
  // no close() on cleanup: it fires onClose, and React's dev double-run would dismiss the dialog
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const set = (patch: Partial<TeamTask>) => setT((cur) => ({ ...cur, ...patch }));
  return createPortal(
    <dialog ref={ref} className="venue-dialog xi exp-dialog" onClose={onClose} aria-labelledby="task-title">
      <header className="xi-head">
        <h2 id="task-title">{isNew ? "Add a task" : "Edit task"}</h2>
        <button className="vd-close" onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className="xi-body">
        <div className="exp-grid">
          <label className="field field-wide">
            <span>Task</span>
            <input autoFocus value={t.title} maxLength={160} placeholder="e.g. Collect the jasmine order from Chalai" onChange={(e) => set({ title: e.target.value })} />
          </label>
          <label className="field">
            <span>Due</span>
            <input type="date" value={t.due ?? ""} onChange={(e) => set({ due: e.target.value || undefined })} />
          </label>
          <label className="field">
            <span>Who <small>(sign-in email)</small></span>
            <input value={t.assignee ?? ""} list="task-people" type="email" autoCapitalize="none" placeholder="Anyone" onChange={(e) => set({ assignee: e.target.value.trim().toLowerCase() || undefined })} />
            <datalist id="task-people">{people.map((p) => <option key={p} value={p} />)}</datalist>
          </label>
          <label className="field">
            <span>Event <small>(optional)</small></span>
            <select value={t.eventId ?? ""} onChange={(e) => set({ eventId: e.target.value || undefined })}>
              <option value="">Not for one event</option>
              {events.map((p) => <option key={p.id} value={p.id}>{p.client.name || "Untitled client"}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Priority</span>
            <select value={t.priority} onChange={(e) => set({ priority: e.target.value as TeamTask["priority"] })}>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className="field field-wide">
            <span>Notes</span>
            <textarea rows={2} value={t.notes ?? ""} maxLength={1000} onChange={(e) => set({ notes: e.target.value })} />
          </label>
        </div>
        <div className="xi-actions">
          {!isNew && <button type="button" className="link-btn link-danger exp-remove" onClick={() => onDelete(task)}>Delete</button>}
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={!t.title.trim()} onClick={() => onSave(t)}>Save</button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
