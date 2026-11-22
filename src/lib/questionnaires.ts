// Questionnaires for the family: templates the team builds once, a copy sent to each wedding, and the answers,
// typed in by the team or given by the family in the client portal. Pure, so it's tested in Node.
// The answer cleaning is mirrored in server/portal.ts (the server can't import from src/); keep them in step.
import type { Proposal, Question, QuestionnaireTemplate, QuestionType, SentQuestionnaire } from "../types";

export const QUESTION_TYPES: { id: QuestionType; label: string }[] = [
  { id: "short", label: "Short answer" },
  { id: "long", label: "Paragraph" },
  { id: "choice", label: "One choice" },
  { id: "multi", label: "Several choices" },
  { id: "date", label: "Date" },
  { id: "number", label: "Number" },
  { id: "yesno", label: "Yes / no" },
];

export const ANSWER_MAX = 2000;
export const QUESTIONS_MAX = 60;

/** The built-in starting questionnaire, used when public/config/questionnaires.json is missing. */
export const DEFAULT_QUESTIONNAIRE: QuestionnaireTemplate = {
  id: "initial-planning",
  title: "Initial planning questionnaire",
  intro: "A few questions so we can plan the celebration you have in mind. Answer what you can; we'll talk through the rest.",
  questions: [
    { id: "style", text: "How would you describe the wedding you imagine?", type: "choice", options: ["Traditional", "Elegant and classic", "Modern and minimal", "Grand and festive", "Intimate"], required: true },
    { id: "muhurtham", text: "Muhurtham date, if fixed", type: "date" },
    { id: "muhurtham-time", text: "Muhurtham time, if fixed", type: "short", help: "For example 10:32 to 11:05" },
    { id: "guests", text: "How many guests do you expect?", type: "number", required: true },
    { id: "functions", text: "Which functions are you planning?", type: "multi", options: ["Engagement", "Haldi", "Mehendi", "Sangeet", "Muhurtham", "Reception"] },
    { id: "rituals", text: "Rituals or customs we must include", type: "long" },
    { id: "food", text: "Food preference", type: "choice", options: ["Vegetarian", "Non-vegetarian", "Both"], required: true },
    { id: "sadya", text: "Would you like a traditional sadya?", type: "yesno" },
    { id: "colours", text: "Colours you love, or want to avoid", type: "short" },
    { id: "music", text: "Music you'd like (nadaswaram, chenda, a band, a DJ…)", type: "short" },
    { id: "access", text: "Anyone who needs step-free access, seating or other care?", type: "long" },
    { id: "notes", text: "Anything else we should know?", type: "long" },
  ],
};

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

export const isTemplate = (x: unknown): x is QuestionnaireTemplate =>
  isObj(x) && typeof x.id === "string" && typeof x.title === "string" && Array.isArray(x.questions) && x.questions.every((q) => isObj(q) && typeof q.id === "string" && typeof q.text === "string");

/** questionnaires.json: { "questionnaires": [template] } */
export function validateQuestionnaires(x: unknown): string[] {
  const list = (x as { questionnaires?: unknown })?.questionnaires;
  if (!isObj(x) || !Array.isArray(list)) return [`questionnaires.json needs a "questionnaires" list.`];
  const errs: string[] = [];
  const ids = new Set<string>();
  (list as Partial<QuestionnaireTemplate>[]).forEach((t, i) => {
    const at = t?.id ? `Questionnaire "${t.id}"` : `Questionnaire #${i + 1}`;
    if (!t?.id) errs.push(`${at} has no "id".`);
    else if (ids.has(t.id)) errs.push(`Questionnaire id "${t.id}" is used twice.`);
    else ids.add(t.id);
    if (!t?.title) errs.push(`${at} has no "title".`);
    if (!Array.isArray(t?.questions) || !t.questions.length) return errs.push(`${at} needs a "questions" list.`);
    const qids = new Set<string>();
    t.questions.forEach((q, j) => {
      const qa = `${at} question ${j + 1}`;
      if (!q?.id || qids.has(q.id)) errs.push(`${qa} needs a unique "id".`);
      else qids.add(q.id);
      if (!q?.text) errs.push(`${qa} has no "text".`);
      if (!QUESTION_TYPES.some((x) => x.id === q?.type)) errs.push(`${qa} needs a "type": ${QUESTION_TYPES.map((x) => x.id).join(", ")}.`);
      if ((q?.type === "choice" || q?.type === "multi") && (!Array.isArray(q.options) || q.options.length < 2)) errs.push(`${qa} needs at least two "options".`);
    });
  });
  return errs;
}

// plain text: control characters other than line breaks dropped, trimmed, capped
const plain = (s: unknown, max = ANSWER_MAX) => String(s ?? "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim().slice(0, max);

/** One answer, kept only if it fits the question; undefined means unanswered. */
export function cleanAnswer(q: Question, value: unknown): string | string[] | undefined {
  if (q.type === "multi") {
    const list = (Array.isArray(value) ? value : []).map((v) => plain(v, 200)).filter((v) => q.options?.includes(v));
    return list.length ? [...new Set(list)] : undefined;
  }
  const v = plain(value);
  if (!v) return undefined;
  if (q.type === "choice") return q.options?.includes(v) ? v : undefined;
  if (q.type === "yesno") return v === "yes" || v === "no" ? v : undefined;
  if (q.type === "date") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
  if (q.type === "number") return /^-?\d+(\.\d+)?$/.test(v) ? v : undefined;
  return q.type === "short" ? v.slice(0, 300) : v;
}

export function cleanAnswers(questions: Question[], raw: unknown): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  if (!isObj(raw)) return out;
  for (const q of questions) {
    const a = cleanAnswer(q, raw[q.id]);
    if (a !== undefined) out[q.id] = a;
  }
  return out;
}

export function completeness(s: Pick<SentQuestionnaire, "questions" | "answers">): { answered: number; total: number; missingRequired: number } {
  const has = (q: Question) => s.answers[q.id] !== undefined;
  return {
    answered: s.questions.filter(has).length,
    total: s.questions.length,
    missingRequired: s.questions.filter((q) => q.required && !has(q)).length,
  };
}

/** A copy of the template for one wedding: its own ids, no answers yet. */
export function sendQuestionnaire(t: QuestionnaireTemplate, newId: () => string, now = new Date()): SentQuestionnaire {
  return {
    id: newId(),
    templateId: t.id,
    title: t.title,
    intro: t.intro,
    questions: t.questions.slice(0, QUESTIONS_MAX).map((q) => ({ ...q, options: q.options ? [...q.options] : undefined })),
    answers: {},
    sentAt: now.toISOString(),
  };
}

/** Sent questionnaires still missing a required answer (or any answer), across proposals that aren't lost. */
export function awaitingAnswers(list: Proposal[]): { proposal: Proposal; q: SentQuestionnaire }[] {
  return list
    .filter((p) => p.status !== "lost")
    .flatMap((p) => (p.questionnaires ?? []).map((q) => ({ proposal: p, q })))
    .filter(({ q }) => {
      const c = completeness(q);
      return c.missingRequired > 0 || c.answered === 0;
    });
}

/** "Yes", "Vegetarian", "Haldi, Muhurtham", "12th February 2027" are formatted by the caller; this joins lists. */
export const answerText = (a: string | string[] | undefined) => (a === undefined ? "" : Array.isArray(a) ? a.join(", ") : a === "yes" ? "Yes" : a === "no" ? "No" : a);
