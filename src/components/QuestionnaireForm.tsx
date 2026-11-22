import type { Question } from "../types";

type Answers = Record<string, string | string[]>;

/**
 * The questions of a questionnaire as a form: used by the team (typing answers from a call) and by the family in
 * the client portal. Unanswered questions are simply left out of `answers`.
 */
export default function QuestionnaireForm({ questions, answers, onChange, disabled = false, idPrefix }: { questions: Question[]; answers: Answers; onChange: (a: Answers) => void; disabled?: boolean; idPrefix: string }) {
  const set = (id: string, value: string | string[] | undefined) => {
    const next = { ...answers };
    if (value === undefined || value === "" || (Array.isArray(value) && !value.length)) delete next[id];
    else next[id] = value;
    onChange(next);
  };
  return (
    <ol className="qf">
      {questions.map((q) => {
        const id = `${idPrefix}-${q.id}`;
        const a = answers[q.id];
        const label = (
          <span className="qf-q">
            {q.text}
            {q.required && <span className="qf-req" aria-label="required"> *</span>}
            {q.help && <small>{q.help}</small>}
          </span>
        );
        return (
          <li key={q.id} className="qf-item">
            {q.type === "choice" || q.type === "multi" || q.type === "yesno" ? (
              <fieldset disabled={disabled}>
                <legend>{label}</legend>
                <div className="qf-options">
                  {(q.type === "yesno" ? ["yes", "no"] : q.options ?? []).map((o) => {
                    const on = Array.isArray(a) ? a.includes(o) : a === o;
                    return (
                      <label key={o} className={`qf-option${on ? " is-on" : ""}`}>
                        <input
                          type={q.type === "multi" ? "checkbox" : "radio"}
                          name={id}
                          checked={on}
                          onChange={(e) => {
                            if (q.type !== "multi") return set(q.id, o);
                            const cur = Array.isArray(a) ? a : [];
                            set(q.id, e.target.checked ? [...cur, o] : cur.filter((x) => x !== o));
                          }}
                        />
                        <span>{q.type === "yesno" ? (o === "yes" ? "Yes" : "No") : o}</span>
                      </label>
                    );
                  })}
                  {q.type !== "multi" && a !== undefined && !disabled && (
                    <button type="button" className="link-btn" onClick={() => set(q.id, undefined)}>Clear</button>
                  )}
                </div>
              </fieldset>
            ) : (
              <label className="field" htmlFor={id}>
                {label}
                {q.type === "long" ? (
                  <textarea id={id} rows={3} maxLength={2000} disabled={disabled} value={(a as string) ?? ""} onChange={(e) => set(q.id, e.target.value)} />
                ) : (
                  <input
                    id={id}
                    type={q.type === "date" ? "date" : q.type === "number" ? "number" : "text"}
                    inputMode={q.type === "number" ? "numeric" : undefined}
                    maxLength={q.type === "short" ? 300 : undefined}
                    disabled={disabled}
                    value={(a as string) ?? ""}
                    onChange={(e) => set(q.id, e.target.value)}
                  />
                )}
              </label>
            )}
          </li>
        );
      })}
    </ol>
  );
}
