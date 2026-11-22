import { useState } from "react";
import type { ChecklistItem, Proposal } from "../types";
import { useConfig } from "../config/context";
import { uid } from "../state/proposals";
import { BUCKET_LABEL, bucketOf, DEFAULT_CHECKLIST, draftChecklist, dueOf, progress, setState, type Bucket } from "../lib/checklist";
import { eventDates } from "../lib/proposal";
import { formatDate, todayISO } from "../lib/format";

const VIEW_KEY = "event-bridge.checklist-view.v1";
const readView = (): "list" | "board" => {
  try {
    return localStorage.getItem(VIEW_KEY) === "board" ? "board" : "list";
  } catch {
    return "list";
  }
};
const ORDER: Bucket[] = ["overdue", "week", "later", "undated", "done"];
const COLUMNS: { state: ChecklistItem["state"]; label: string }[] = [
  { state: "todo", label: "To do" },
  { state: "doing", label: "Doing" },
  { state: "done", label: "Done" },
];
const OWNER = { team: "Team", client: "Family" } as const;

type Draft = { id?: string; title: string; timing: "offset" | "date"; offsetDays: number; due: string; owner: ChecklistItem["owner"]; notes: string };
const blank: Draft = { title: "", timing: "offset", offsetDays: 30, due: "", owner: "team", notes: "" };

/** "90 days before", "3 days after", "on the day" */
const offsetText = (n: number) => (n === 0 ? "on the day" : n > 0 ? `${n} day${n === 1 ? "" : "s"} before` : `${-n} day${n === -1 ? "" : "s"} after`);

/**
 * A wedding's checklist: tasks timed back from the first event date, shown as a list grouped by when they're due
 * or as a board (to do, doing, done). Every change builds on the latest saved proposal.
 */
export default function Checklist({ p, account, onUpdate }: { p: Proposal; account: string; onUpdate: (fn: (cur: Proposal) => Proposal) => void }) {
  const { checklists } = useConfig();
  const [view, setView] = useState(readView);
  const [draft, setDraft] = useState<Draft | null>(null);
  const items = p.checklist ?? [];
  const today = todayISO();
  const prog = progress(items);
  const hasDate = eventDates(p).length > 0;

  const changeView = (v: "list" | "board") => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* storage blocked: lasts for this visit */
    }
  };
  const setItems = (fn: (list: ChecklistItem[]) => ChecklistItem[]) => onUpdate((cur) => ({ ...cur, checklist: fn(cur.checklist ?? []) }));
  const move = (id: string, state: ChecklistItem["state"]) => setItems((list) => setState(list, id, state, account));
  const remove = (it: ChecklistItem) => {
    if (confirm(`Delete “${it.title}”?`)) setItems((list) => list.filter((x) => x.id !== it.id));
  };
  const edit = (it: ChecklistItem) =>
    setDraft({ id: it.id, title: it.title, timing: it.due ? "date" : "offset", offsetDays: it.offsetDays ?? 30, due: it.due ?? "", owner: it.owner, notes: it.notes ?? "" });
  const saveDraft = () => {
    if (!draft || !draft.title.trim() || (draft.timing === "date" && !draft.due)) return;
    const fields = {
      title: draft.title.trim(),
      due: draft.timing === "date" ? draft.due : undefined,
      offsetDays: draft.timing === "offset" ? draft.offsetDays : undefined,
      owner: draft.owner,
      notes: draft.notes.trim() || undefined,
    };
    setItems((list) => (draft.id ? list.map((x) => (x.id === draft.id ? { ...x, ...fields } : x)) : [...list, { id: `c-${uid()}`, state: "todo", ...fields }]));
    setDraft(null);
  };

  const dueText = (it: ChecklistItem) => {
    const due = dueOf(it, p);
    if (it.due) return formatDate(it.due);
    if (typeof it.offsetDays !== "number") return "No date";
    return due ? `${formatDate(due)} · ${offsetText(it.offsetDays)}` : `${offsetText(it.offsetDays)} the event`;
  };

  const row = (it: ChecklistItem) => (
    <li key={it.id} className={`ck-item is-${bucketOf(it, p, today)}`}>
      <label className="ck-tick">
        <input type="checkbox" checked={it.state === "done"} onChange={(e) => move(it.id, e.target.checked ? "done" : "todo")} />
        <span className="ck-title">{it.title}</span>
      </label>
      <span className="ck-meta">
        {dueText(it)} · {OWNER[it.owner]}
        {it.state === "doing" && " · in progress"}
        {it.done && ` · done by ${it.done.by}`}
        {it.notes && <small> · {it.notes}</small>}
      </span>
      <span className="ck-tools">
        <button type="button" className="link-btn" onClick={() => edit(it)}>Edit</button>
        <button type="button" className="link-btn link-danger" onClick={() => remove(it)}>Delete</button>
      </span>
    </li>
  );

  return (
    <section className="ck" aria-label="Checklist">
      <div className="ck-head">
        <div className="ck-progress">
          <strong>{prog.done} of {prog.total} done</strong>
          <span className="ck-bar" aria-hidden="true"><span style={{ width: `${Math.round(prog.pct * 100)}%` }} /></span>
        </div>
        <div className="ck-head-tools">
          <div className="seg" role="group" aria-label="Show as">
            <button type="button" className={view === "list" ? "is-on" : ""} aria-pressed={view === "list"} onClick={() => changeView("list")}>List</button>
            <button type="button" className={view === "board" ? "is-on" : ""} aria-pressed={view === "board"} onClick={() => changeView("board")}>Board</button>
          </div>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setDraft({ ...blank })}>Add a task</button>
        </div>
      </div>
      {!hasDate && items.length > 0 && <p className="hint">Add the event date in Proposal Studio, and tasks timed before the event get their dates.</p>}

      {draft && (
        <div className="ck-form">
          <label className="field field-wide">
            <span>Task</span>
            <input autoFocus value={draft.title} maxLength={140} placeholder="e.g. Confirm the nadaswaram timing" onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <label className="field">
            <span>When</span>
            <select value={draft.timing} onChange={(e) => setDraft({ ...draft, timing: e.target.value as Draft["timing"] })}>
              <option value="offset">Days before the event</option>
              <option value="date">On a date</option>
            </select>
          </label>
          {draft.timing === "offset" ? (
            <label className="field">
              <span>Days before <small>(negative for after)</small></span>
              <input type="number" step={1} value={draft.offsetDays} onChange={(e) => setDraft({ ...draft, offsetDays: Math.round(Number(e.target.value) || 0) })} />
            </label>
          ) : (
            <label className="field">
              <span>Date</span>
              <input type="date" value={draft.due} onChange={(e) => setDraft({ ...draft, due: e.target.value })} />
            </label>
          )}
          <label className="field">
            <span>Who</span>
            <select value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value as ChecklistItem["owner"] })}>
              <option value="team">Team</option>
              <option value="client">Family</option>
            </select>
          </label>
          <label className="field field-wide">
            <span>Note <small>(optional)</small></span>
            <input value={draft.notes} maxLength={200} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </label>
          <div className="xi-actions field-wide">
            <button type="button" className="btn-ghost" onClick={() => setDraft(null)}>Cancel</button>
            <button type="button" className="btn-primary" onClick={saveDraft} disabled={!draft.title.trim() || (draft.timing === "date" && !draft.due)}>{draft.id ? "Save" : "Add"}</button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty-state">
          <p>No tasks yet. Start from the team's wedding checklist, timed back from the event date, then adjust it.</p>
          <button type="button" className="btn-primary" onClick={() => onUpdate((cur) => ({ ...cur, checklist: draftChecklist(cur, checklists ?? DEFAULT_CHECKLIST, () => `c-${uid()}`) }))}>
            Start the checklist
          </button>
        </div>
      ) : view === "list" ? (
        ORDER.map((b) => {
          const group = items.filter((it) => bucketOf(it, p, today) === b).sort((x, y) => (dueOf(x, p) ?? "9").localeCompare(dueOf(y, p) ?? "9"));
          return group.length ? (
            <div key={b} className={`ck-group is-${b}`}>
              <h3>{BUCKET_LABEL[b]} <small>{group.length}</small></h3>
              <ul className="ck-list">{group.map(row)}</ul>
            </div>
          ) : null;
        })
      ) : (
        <div className="ck-board">
          {COLUMNS.map((c, ci) => {
            const col = items.filter((it) => it.state === c.state).sort((x, y) => (dueOf(x, p) ?? "9").localeCompare(dueOf(y, p) ?? "9"));
            return (
              <div key={c.state} className="ck-col" aria-label={c.label}>
                <h3>{c.label} <small>{col.length}</small></h3>
                {col.map((it) => (
                  <div key={it.id} className={`ck-card is-${bucketOf(it, p, today)}`}>
                    <strong>{it.title}</strong>
                    <span>{dueText(it)} · {OWNER[it.owner]}</span>
                    <div className="ck-card-tools">
                      {ci > 0 && <button type="button" className="btn-ghost btn-sm" onClick={() => move(it.id, COLUMNS[ci - 1].state)} aria-label={`Move “${it.title}” to ${COLUMNS[ci - 1].label}`}>← {COLUMNS[ci - 1].label}</button>}
                      {ci < COLUMNS.length - 1 && <button type="button" className="btn-ghost btn-sm" onClick={() => move(it.id, COLUMNS[ci + 1].state)} aria-label={`Move “${it.title}” to ${COLUMNS[ci + 1].label}`}>{COLUMNS[ci + 1].label} →</button>}
                      <button type="button" className="link-btn" onClick={() => edit(it)}>Edit</button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
