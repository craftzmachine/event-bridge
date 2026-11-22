import { useState, type ReactNode } from "react";
import { api } from "../lib/api";
import type { PortalAnswers, PortalData } from "../lib/portal";
import { completeness } from "../lib/questionnaires";
import { formatDate, formatINR, todayISO } from "../lib/format";
import QuestionnaireForm from "./QuestionnaireForm";

type Tab = "proposal" | "todos" | "payments" | "questions";
const PAY_LABEL = { paid: "Paid", part: "Part paid", due: "Due soon", overdue: "Overdue", upcoming: "Upcoming" } as const;

/**
 * What a family sees in their client portal: their proposal (with Approve / Ask for changes), their to-dos from the
 * checklist, the payment schedule, and the questionnaires to answer. Answers are saved on the server
 * (POST /api/view/answers) and reach the planner's Event Bridge.
 */
export default function ClientPortal({ id, portal, answers: initial, proposal, onFail }: { id: string; portal: PortalData; answers: PortalAnswers; proposal: ReactNode; onFail: (e: unknown) => void }) {
  const [tab, setTab] = useState<Tab>("proposal");
  const [answers, setAnswers] = useState<PortalAnswers>(initial ?? {});
  const today = todayISO();
  const open = portal.tasks.filter((t) => t.state !== "done").length;
  const toAnswer = portal.questionnaires.filter((q) => !answers[q.id]).length;
  const tabs: { id: Tab; label: string; note?: string }[] = [
    { id: "proposal", label: "Our proposal" },
    { id: "todos", label: "Our to-dos", note: open ? String(open) : undefined },
    { id: "payments", label: "Payments" },
    { id: "questions", label: "Questionnaires", note: toAnswer ? String(toAnswer) : undefined },
  ];

  return (
    <div className="cp">
      <nav className="cp-tabs" aria-label="Your wedding">
        {tabs.map((t) => (
          <button key={t.id} type="button" aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
            {t.label}
            {t.note && <small> · {t.note}</small>}
          </button>
        ))}
      </nav>

      {tab === "proposal" && proposal}

      {tab === "todos" && (
        <section className="cp-panel" aria-label="Our to-dos">
          <h2>What we need from you</h2>
          {portal.tasks.length === 0 ? (
            <p className="cp-empty">Nothing at the moment. Your planner will add anything they need from you here.</p>
          ) : (
            <ul className="cp-list">
              {[...portal.tasks].sort((a, b) => (a.due || "9").localeCompare(b.due || "9")).map((t, i) => (
                <li key={i} className={`is-${t.state}${t.state !== "done" && t.due && t.due < today ? " is-late" : ""}`}>
                  <span className="cp-dot" aria-hidden="true" />
                  <span>
                    <strong>{t.title}</strong>
                    <small>{t.state === "done" ? "Done" : t.due ? `By ${formatDate(t.due)}` : "No date yet"}{t.state === "doing" ? " · in progress" : ""}</small>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "payments" && (
        <section className="cp-panel" aria-label="Payments">
          <h2>Payment schedule</h2>
          <p className="cp-sum">{formatINR(portal.payments.received)} received of {formatINR(portal.payments.total)}, including GST</p>
          <ul className="cp-list">
            {portal.payments.milestones.map((m, i) => (
              <li key={i} className={`is-${m.state}`}>
                <span className="cp-dot" aria-hidden="true" />
                <span>
                  <strong>{m.label}</strong>
                  <small>{m.due ? `Due ${formatDate(m.due)}` : "Date to be confirmed"} · {PAY_LABEL[m.state]}</small>
                </span>
                <span className="cp-amt">{formatINR(m.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "questions" && (
        <section className="cp-panel" aria-label="Questionnaires">
          {portal.questionnaires.length === 0 ? (
            <p className="cp-empty">No questions for you at the moment.</p>
          ) : (
            portal.questionnaires.map((q) => (
              <Answering
                key={q.id}
                portalId={id}
                q={q}
                saved={answers[q.id]}
                onSaved={(a) => setAnswers((cur) => ({ ...cur, [q.id]: a }))}
                onFail={onFail}
              />
            ))
          )}
        </section>
      )}
    </div>
  );
}

function Answering({ portalId, q, saved, onSaved, onFail }: { portalId: string; q: PortalData["questionnaires"][number]; saved?: PortalAnswers[string]; onSaved: (a: PortalAnswers[string]) => void; onFail: (e: unknown) => void }) {
  const [draft, setDraft] = useState<Record<string, string | string[]>>(saved?.answers ?? q.answers ?? {});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const c = completeness({ questions: q.questions, answers: draft });

  async function save() {
    if (c.missingRequired) return setMsg(`Please answer the ${c.missingRequired} question${c.missingRequired === 1 ? "" : "s"} marked *.`);
    setBusy(true);
    setMsg("");
    try {
      const r = await api<{ answers: Record<string, string | string[]>; at: number }>(`view/answers?id=${portalId}`, { json: { questionnaire: q.id, answers: draft } });
      onSaved(r);
      setDraft(r.answers);
      setMsg("Thank you, your answers are saved. You can change them any time.");
    } catch (e) {
      onFail(e);
      setMsg("Your answers couldn't be saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cp-q">
      <h2>{q.title}</h2>
      {q.intro && <p className="cp-intro">{q.intro}</p>}
      {saved && <p className="cp-saved">Last saved {new Date(saved.at).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}</p>}
      <QuestionnaireForm idPrefix={q.id} questions={q.questions} answers={draft} onChange={setDraft} disabled={busy} />
      <div className="cp-q-actions">
        <span className="cp-progress">{c.answered} of {c.total} answered</span>
        <button type="button" className="btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : saved ? "Save changes" : "Send answers"}</button>
      </div>
      {msg && <p className="cp-msg" role="status">{msg}</p>}
    </div>
  );
}
