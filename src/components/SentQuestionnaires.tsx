import { useState } from "react";
import type { Proposal, SentQuestionnaire } from "../types";
import { uid } from "../state/proposals";
import { useQuestionnaires } from "../state/questionnaires";
import { cleanAnswers, completeness, sendQuestionnaire } from "../lib/questionnaires";
import { formatDate } from "../lib/format";
import QuestionnaireForm from "./QuestionnaireForm";

/**
 * A wedding's questionnaires (the event workspace's Questionnaires tab): send one from a template, see how much is
 * answered, and type in answers the family gave on a call. Answers the family gives in the client portal land here too.
 */
export default function SentQuestionnaires({ p, onUpdate }: { p: Proposal; onUpdate: (fn: (cur: Proposal) => Proposal) => void }) {
  const templates = useQuestionnaires();
  const [pick, setPick] = useState(templates.all[0]?.id ?? "");
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<SentQuestionnaire["answers"]>({});
  const sent = p.questionnaires ?? [];

  const send = () => {
    const t = templates.all.find((x) => x.id === pick);
    if (!t) return;
    const s = sendQuestionnaire(t, () => `q-${uid()}`);
    onUpdate((cur) => ({ ...cur, questionnaires: [...(cur.questionnaires ?? []), s] }));
    setOpen(s.id);
    setDraft({});
  };
  const save = (s: SentQuestionnaire) => {
    const answers = cleanAnswers(s.questions, draft);
    onUpdate((cur) => ({
      ...cur,
      questionnaires: (cur.questionnaires ?? []).map((x) => (x.id === s.id ? { ...x, answers, answeredAt: new Date().toISOString(), answeredBy: "team" as const } : x)),
    }));
    setOpen(null);
  };
  const remove = (s: SentQuestionnaire) => {
    if (confirm(`Remove “${s.title}” and its answers from this wedding?`)) onUpdate((cur) => ({ ...cur, questionnaires: (cur.questionnaires ?? []).filter((x) => x.id !== s.id) }));
  };

  return (
    <section className="ck" aria-label="Questionnaires">
      <div className="ck-head">
        <p className="hint">Send the family a questionnaire through their client portal, or fill in what they told you on a call.</p>
        <div className="ck-head-tools">
          <select aria-label="Questionnaire" value={pick} onChange={(e) => setPick(e.target.value)}>
            {templates.all.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <button type="button" className="btn-primary btn-sm" disabled={!pick} onClick={send}>Add to this wedding</button>
        </div>
      </div>
      {sent.length === 0 ? (
        <div className="empty-state"><p>No questionnaires for this wedding yet.</p></div>
      ) : (
        sent.map((s) => {
          const c = completeness(s);
          return (
            <div key={s.id} className="dash-card qs-card">
              <div className="dash-section-head">
                <div>
                  <h2>{s.title}</h2>
                  <p className="hint">
                    Added {formatDate(s.sentAt.slice(0, 10))} · {c.answered} of {c.total} answered
                    {c.missingRequired ? ` · ${c.missingRequired} required still open` : ""}
                    {s.answeredAt ? ` · last answered ${formatDate(s.answeredAt.slice(0, 10))} by ${s.answeredBy === "client" ? "the family" : "the team"}` : ""}
                  </p>
                </div>
                <div className="dash-section-tools">
                  {open === s.id ? (
                    <>
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(null)}>Cancel</button>
                      <button type="button" className="btn-primary btn-sm" onClick={() => save(s)}>Save answers</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="link-btn link-danger" onClick={() => remove(s)}>Remove</button>
                      <button type="button" className="btn-ghost btn-sm" onClick={() => { setOpen(s.id); setDraft(s.answers); }}>Fill in answers</button>
                    </>
                  )}
                </div>
              </div>
              <span className="ck-bar" aria-hidden="true"><span style={{ width: `${c.total ? Math.round((c.answered / c.total) * 100) : 0}%` }} /></span>
              {open === s.id ? (
                <QuestionnaireForm idPrefix={s.id} questions={s.questions} answers={draft} onChange={setDraft} />
              ) : (
                c.answered > 0 && (
                  <dl className="qs-answers">
                    {s.questions.filter((q) => s.answers[q.id] !== undefined).map((q) => {
                      const a = s.answers[q.id];
                      return (
                        <div key={q.id}>
                          <dt>{q.text}</dt>
                          <dd>{Array.isArray(a) ? a.join(", ") : q.type === "yesno" ? (a === "yes" ? "Yes" : "No") : q.type === "date" ? formatDate(a) : a}</dd>
                        </div>
                      );
                    })}
                  </dl>
                )
              )}
            </div>
          );
        })
      )}
    </section>
  );
}
