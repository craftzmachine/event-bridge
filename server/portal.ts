// Client portal shares: the family's own page for their wedding, behind the same password link as other shares.
// It holds the cleaned proposal page (checked by page.ts), the family's to-dos, the payment schedule and the
// questionnaires sent to them. The snapshot is built by src/lib/portal.ts; this file can't import from src/ (see
// CLAUDE.md), so it checks the shape it needs, drops anything it doesn't recognise, and repeats the answer cleaning
// from src/lib/questionnaires.ts. Keep the two in step.
import { validatePage } from "./page.js";

export const PORTAL_MAX_BYTES = 320 * 1024;
/** all of a portal's stored answers together */
export const ANSWERS_MAX_BYTES = 64 * 1024;
const ANSWER_MAX = 2000;
const MAX_TASKS = 100;
const MAX_MILESTONES = 12;
const MAX_QUESTIONNAIRES = 8;
const MAX_QUESTIONS = 60;
const MAX_OPTIONS = 20;
const TYPES = ["short", "long", "choice", "multi", "date", "number", "yesno"] as const;
const TASK_STATES = ["todo", "doing", "done"] as const;
const PAY_STATES = ["paid", "part", "due", "overdue", "upcoming"] as const;

type Obj = Record<string, unknown>;
export type Answers = Record<string, string | string[]>;
interface Question {
  id: string;
  text: string;
  type: (typeof TYPES)[number];
  options?: string[];
  required?: boolean;
  help?: string;
}

const isObj = (x: unknown): x is Obj => !!x && typeof x === "object" && !Array.isArray(x);
const str = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
const money = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.round(x * 100) / 100 : 0);
const date = (x: unknown) => (typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : "");
const isId = (x: unknown): x is string => typeof x === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(x);
const list = (x: unknown) => (Array.isArray(x) ? x : []);
// plain text: control characters other than line breaks dropped, trimmed, capped
const plain = (s: unknown, max = ANSWER_MAX) => String(s ?? "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim().slice(0, max);

function question(x: unknown): Question | null {
  if (!isObj(x) || !isId(x.id)) return null;
  const type = TYPES.find((t) => t === x.type);
  const text = str(x.text, 300).trim();
  if (!type || !text) return null;
  const options = type === "choice" || type === "multi" ? list(x.options).map((o) => str(o, 200).trim()).filter(Boolean).slice(0, MAX_OPTIONS) : undefined;
  if (options && options.length < 2) return null;
  return { id: x.id, text, type, ...(options ? { options } : {}), ...(x.required === true ? { required: true } : {}), ...(str(x.help, 200) ? { help: str(x.help, 200) } : {}) };
}

/** One answer, kept only if it fits the question (mirrors cleanAnswer in src/lib/questionnaires.ts). */
function cleanAnswer(q: Question, value: unknown): string | string[] | undefined {
  if (q.type === "multi") {
    const picked = list(value).map((v) => plain(v, 200)).filter((v) => q.options?.includes(v));
    return picked.length ? [...new Set(picked)] : undefined;
  }
  const v = plain(value);
  if (!v) return undefined;
  if (q.type === "choice") return q.options?.includes(v) ? v : undefined;
  if (q.type === "yesno") return v === "yes" || v === "no" ? v : undefined;
  if (q.type === "date") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
  if (q.type === "number") return /^-?\d+(\.\d+)?$/.test(v) ? v : undefined;
  return q.type === "short" ? v.slice(0, 300) : v;
}

export function cleanAnswers(questions: Question[], raw: unknown): Answers {
  const out: Answers = {};
  if (!isObj(raw)) return out;
  for (const q of questions) {
    const a = cleanAnswer(q, raw[q.id]);
    if (a !== undefined) out[q.id] = a;
  }
  return out;
}

/** The questions of one of the portal's questionnaires, as stored. */
export function portalQuestions(portal: Obj, questionnaireId: string): Question[] | null {
  const q = list(portal.questionnaires).find((x) => isObj(x) && x.id === questionnaireId);
  return isObj(q) ? (list(q.questions) as Question[]) : null;
}

/** The cleaned portal snapshot, or why it can't be shared. */
export function validatePortal(text: string): { portal: Obj } | { error: string } {
  if (Buffer.byteLength(text) > PORTAL_MAX_BYTES) return { error: "This portal is too large to share. Remove some questionnaires or tasks and try again." };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "The portal didn't arrive complete. Please try again." };
  }
  if (!isObj(raw) || raw.v !== 1 || !isObj(raw.page)) return { error: "The portal isn't in a format this site can show." };
  const page = validatePage(JSON.stringify(raw.page));
  if ("error" in page) return page;

  const tasks = list(raw.tasks)
    .filter(isObj)
    .slice(0, MAX_TASKS)
    .map((t) => ({ title: str(t.title, 200).trim(), due: date(t.due), state: TASK_STATES.find((s) => s === t.state) ?? "todo" }))
    .filter((t) => t.title);

  const pay = isObj(raw.payments) ? raw.payments : {};
  const payments = {
    total: money(pay.total),
    received: money(pay.received),
    milestones: list(pay.milestones)
      .filter(isObj)
      .slice(0, MAX_MILESTONES)
      .map((m) => ({ label: str(m.label, 80).trim() || "Payment", amount: money(m.amount), due: date(m.due), state: PAY_STATES.find((s) => s === m.state) ?? "upcoming" })),
  };

  const questionnaires = list(raw.questionnaires)
    .filter(isObj)
    .slice(0, MAX_QUESTIONNAIRES)
    .filter((q) => isId(q.id))
    .map((q) => {
      const questions = list(q.questions).slice(0, MAX_QUESTIONS).map(question).filter((x): x is Question => !!x);
      return { id: q.id as string, title: str(q.title, 120).trim() || "Questionnaire", intro: str(q.intro, 300), questions, answers: cleanAnswers(questions, q.answers) };
    })
    .filter((q) => q.questions.length);

  return { portal: { v: 1, page: page.page, tasks, payments, questionnaires } };
}
