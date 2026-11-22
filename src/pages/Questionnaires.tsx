import { useRef, useState } from "react";
import type { Question, QuestionnaireTemplate, QuestionType } from "../types";
import { uid, type useProposals } from "../state/proposals";
import { downloadList, readListFile } from "../state/local";
import { QUESTIONNAIRES_FORMAT, useQuestionnaires } from "../state/questionnaires";
import { awaitingAnswers, completeness, isTemplate, QUESTION_TYPES, QUESTIONS_MAX, sendQuestionnaire } from "../lib/questionnaires";
import { eventsFor } from "../lib/events";
import { formatDate, todayISO } from "../lib/format";
import PageHeader from "../components/PageHeader";

type Store = ReturnType<typeof useProposals>;

const blankTemplate = (): QuestionnaireTemplate => ({ id: `qt-${uid()}`, title: "", questions: [{ id: `q-${uid()}`, text: "", type: "short" }] });

/**
 * #/questionnaires: the questionnaires the team sends to families. Build them once (questions of seven kinds,
 * required or not), send a copy to a wedding, and see which are still waiting for answers.
 */
export default function Questionnaires({ store }: { store: Store }) {
  const templates = useQuestionnaires();
  const [editing, setEditing] = useState<QuestionnaireTemplate | null>(null);
  const [sendTo, setSendTo] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const today = todayISO();
  const events = eventsFor(store.list, "upcoming", today);
  const waiting = awaitingAnswers(store.list);
  const sentCount = store.list.reduce((t, p) => t + (p.questionnaires?.length ?? 0), 0);

  function send(t: QuestionnaireTemplate) {
    const pid = sendTo[t.id];
    const p = store.list.find((x) => x.id === pid);
    if (!p) return;
    store.update(p.id, (cur) => ({ ...cur, questionnaires: [...(cur.questionnaires ?? []), sendQuestionnaire(t, () => `q-${uid()}`)] }));
    setMsg(`Added “${t.title}” to ${p.client.name || "the wedding"}. Share it through their client portal, or fill it in from the event's Questionnaires tab.`);
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    const items = await readListFile(file, QUESTIONNAIRES_FORMAT, isTemplate);
    setMsg(items ? `Imported ${templates.importMany(items.map((t) => ({ ...t, team: undefined })))} questionnaire${items.length === 1 ? "" : "s"}.` : "That file isn't a questionnaire list from Event Bridge.");
    if (fileRef.current) fileRef.current.value = "";
  }

  if (editing)
    return (
      <Editor
        template={editing}
        onSave={(t) => {
          templates.save({ ...t, team: undefined, title: t.title.trim(), updatedAt: new Date().toISOString() });
          setEditing(null);
        }}
        onDelete={
          templates.list.some((x) => x.id === editing.id)
            ? () => {
                if (confirm(`Delete “${editing.title}”? Copies already sent to weddings stay.`)) {
                  templates.remove(editing.id);
                  setEditing(null);
                }
              }
            : undefined
        }
        onCancel={() => setEditing(null)}
      />
    );

  return (
    <div className="ev-page">
      <PageHeader
        crumbs={[{ label: "Dashboard", href: "#/dashboard" }, { label: "Questionnaires" }]}
        title="Questionnaires"
        subtitle={`${sentCount} sent to weddings · ${waiting.length} waiting for answers`}
        actions={
          <>
            <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>Import</button>
            <button type="button" className="btn-ghost" disabled={!templates.list.length} onClick={() => downloadList(`Questionnaires_${today}.json`, QUESTIONNAIRES_FORMAT, templates.list)}>Export</button>
            <button type="button" className="btn-primary" onClick={() => setEditing(blankTemplate())}>New questionnaire</button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
          </>
        }
      />
      <main className="ev-main">
        {msg && <p className="toast" role="status">{msg}</p>}
        <ul className="vn-grid qt-grid">
          {templates.all.map((t) => (
            <li key={t.id} className="vn-card">
              <div className="vn-card-head"><span className="vn-cat">{t.team ? "Team questionnaire" : "Yours"}</span><span className="vn-muted">{t.questions.length} questions</span></div>
              <strong>{t.title}</strong>
              {t.intro && <span>{t.intro}</span>}
              <div className="qt-send">
                <select aria-label={`Send ${t.title} to`} value={sendTo[t.id] ?? ""} onChange={(e) => setSendTo({ ...sendTo, [t.id]: e.target.value })}>
                  <option value="">Send to a wedding…</option>
                  {events.map((p) => <option key={p.id} value={p.id}>{p.client.name || "Untitled client"}</option>)}
                </select>
                <button type="button" className="btn-ghost btn-sm" disabled={!sendTo[t.id]} onClick={() => send(t)}>Send</button>
              </div>
              <div className="vn-actions">
                <button type="button" className="link-btn" onClick={() => setEditing(t.team ? { ...t, id: `qt-${uid()}`, title: `${t.title} (copy)`, team: undefined } : t)}>{t.team ? "Copy to edit" : "Edit"}</button>
              </div>
            </li>
          ))}
        </ul>

        <section className="dash-card">
          <h2>Waiting for answers</h2>
          {waiting.length === 0 ? (
            <p className="dash-empty">Nothing waiting. Questionnaires sent to weddings show here until they're answered.</p>
          ) : (
            <ul className="dash-pay-list">
              {waiting.map(({ proposal, q }) => {
                const c = completeness(q);
                return (
                  <li key={q.id}>
                    <a className="link-btn" href={`#/events/${proposal.id}/questionnaires`}>{proposal.client.name || "Untitled client"}</a>
                    <span>{q.title} · sent {formatDate(q.sentAt.slice(0, 10))}</span>
                    <strong>{c.answered}/{c.total}</strong>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function Editor({ template, onSave, onDelete, onCancel }: { template: QuestionnaireTemplate; onSave: (t: QuestionnaireTemplate) => void; onDelete?: () => void; onCancel: () => void }) {
  const [t, setT] = useState(template);
  const setQ = (i: number, patch: Partial<Question>) => setT((cur) => ({ ...cur, questions: cur.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) }));
  const move = (i: number, d: -1 | 1) =>
    setT((cur) => {
      const qs = [...cur.questions];
      const j = i + d;
      if (j < 0 || j >= qs.length) return cur;
      [qs[i], qs[j]] = [qs[j], qs[i]];
      return { ...cur, questions: qs };
    });
  const ok = t.title.trim() && t.questions.length && t.questions.every((q) => q.text.trim() && (q.type !== "choice" && q.type !== "multi" ? true : (q.options ?? []).filter((o) => o.trim()).length >= 2));

  return (
    <div className="ev-page">
      <PageHeader
        crumbs={[{ label: "Dashboard", href: "#/dashboard" }, { label: "Questionnaires", href: "#/questionnaires" }, { label: t.title || "New questionnaire" }]}
        title={template.title ? "Edit questionnaire" : "New questionnaire"}
        actions={
          <>
            {onDelete && <button type="button" className="link-btn link-danger" onClick={onDelete}>Delete</button>}
            <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
            <button type="button" className="btn-primary" disabled={!ok} onClick={() => onSave({ ...t, questions: t.questions.map((q) => ({ ...q, text: q.text.trim(), options: q.options?.map((o) => o.trim()).filter(Boolean) })) })}>Save</button>
          </>
        }
      />
      <main className="ev-main">
        <div className="exp-grid">
          <label className="field field-wide">
            <span>Title</span>
            <input autoFocus value={t.title} maxLength={120} placeholder="e.g. Reception details" onChange={(e) => setT({ ...t, title: e.target.value })} />
          </label>
          <label className="field field-wide">
            <span>A line for the family <small>(optional)</small></span>
            <input value={t.intro ?? ""} maxLength={300} onChange={(e) => setT({ ...t, intro: e.target.value || undefined })} />
          </label>
        </div>
        <ol className="qe-list">
          {t.questions.map((q, i) => (
            <li key={q.id} className="dash-card qe-item">
              <div className="exp-grid">
                <label className="field field-wide">
                  <span>Question {i + 1}</span>
                  <input value={q.text} maxLength={300} onChange={(e) => setQ(i, { text: e.target.value })} />
                </label>
                <label className="field">
                  <span>Answer type</span>
                  <select value={q.type} onChange={(e) => setQ(i, { type: e.target.value as QuestionType, options: e.target.value === "choice" || e.target.value === "multi" ? q.options ?? ["", ""] : undefined })}>
                    {QUESTION_TYPES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Hint <small>(optional)</small></span>
                  <input value={q.help ?? ""} maxLength={200} onChange={(e) => setQ(i, { help: e.target.value || undefined })} />
                </label>
                {(q.type === "choice" || q.type === "multi") && (
                  <label className="field field-wide">
                    <span>Choices <small>(one per line)</small></span>
                    <textarea rows={3} value={(q.options ?? []).join("\n")} onChange={(e) => setQ(i, { options: e.target.value.split("\n") })} />
                  </label>
                )}
              </div>
              <div className="qe-tools">
                <label className="check"><input type="checkbox" checked={!!q.required} onChange={(e) => setQ(i, { required: e.target.checked || undefined })} /><span>Required</span></label>
                <button type="button" className="btn-ghost btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move question ${i + 1} up`}>↑</button>
                <button type="button" className="btn-ghost btn-sm" disabled={i === t.questions.length - 1} onClick={() => move(i, 1)} aria-label={`Move question ${i + 1} down`}>↓</button>
                <button type="button" className="link-btn link-danger" disabled={t.questions.length === 1} onClick={() => setT({ ...t, questions: t.questions.filter((_, j) => j !== i) })}>Remove</button>
              </div>
            </li>
          ))}
        </ol>
        <button type="button" className="btn-ghost" disabled={t.questions.length >= QUESTIONS_MAX} onClick={() => setT({ ...t, questions: [...t.questions, { id: `q-${uid()}`, text: "", type: "short" }] })}>Add a question</button>
      </main>
    </div>
  );
}
