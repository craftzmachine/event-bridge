// The handover of an event's expenses to another team member: what the pack contains, checking it on arrival, the
// reviewer's decisions, and the reply that brings them back to the recorder. Pure, so it's tested in Node; the ZIP
// itself is built and read in handoverPack.ts.
import type { TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import type { Brand } from "../types";
import { canReview, cleanRef, contributors, flagsOf, maskUpi, summarise, type Expense, type ReviewState } from "./expenses";
import { formatDate, formatINR } from "./format";

export const PACK_FORMAT = "event-bridge.expenses";
export const REPLY_FORMAT = "event-bridge.handover-reply";

export interface PackEvent {
  id: string;
  ref: string;
  client: string;
  title: string;
  dates: string[];
  venue: string;
  functions: { id: string; label: string }[];
}

/** expenses.json inside the pack */
export interface PackData {
  format: typeof PACK_FORMAT;
  v: 1;
  id: string;
  event: PackEvent;
  from: string;
  createdAt: string;
  note: string;
  categories: { id: string; label: string }[];
  expenses: Expense[];
  /** fileId → path inside the ZIP and the image's SHA-256 */
  files: Record<string, { path: string; sha256: string }>;
}

/** The recorder's record of a pack they sent. */
export interface SentHandover {
  id: string;
  eventId: string;
  from: string;
  createdAt: string;
  expenseIds: string[];
  total: number;
  state: "sent" | "reconciled" | "returned";
  reviewer?: string;
  signedAt?: string;
}

/** The reviewer's copy of a pack, with their decisions. */
export interface ReceivedHandover {
  id: string;
  pack: PackData;
  receivedAt: string;
  reviewer: string;
  reviews: Record<string, { state: ReviewState; note?: string }>;
  state: "reviewing" | "reconciled" | "returned";
  signedAt?: string;
}

export interface Reply {
  format: typeof REPLY_FORMAT;
  v: 1;
  handoverId: string;
  eventId: string;
  eventRef: string;
  reviewer: string;
  signedAt: string;
  state: "reconciled" | "returned";
  reviews: Record<string, { state: ReviewState; note?: string }>;
}

export function packData(o: { id: string; event: PackEvent; from: string; note: string; categories: { id: string; label: string }[]; expenses: Expense[]; now?: Date }): PackData {
  const files: PackData["files"] = {};
  for (const e of o.expenses)
    if (e.proof) files[e.proof.fileId] = { path: `proof/${proofName(e)}`, sha256: e.proof.sha256 };
  return { format: PACK_FORMAT, v: 1, id: o.id, event: o.event, from: o.from, createdAt: (o.now ?? new Date()).toISOString(), note: o.note, categories: o.categories, expenses: o.expenses, files };
}

/** "2027-02-14_Flower-market_2450_ab12cd.webp": sortable by date, readable without the app */
export function proofName(e: Expense): string {
  const vendor = e.vendor.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "expense";
  const ext = e.proof?.type.includes("png") ? "png" : e.proof?.type.includes("jpeg") || e.proof?.type.includes("jpg") ? "jpg" : "webp";
  return `${e.paidOn}_${vendor}_${Math.round(e.amount)}_${e.id.slice(-6)}.${ext}`;
}

export type PackProblem = { fatal: boolean; text: string };

/**
 * Checks a pack on arrival: the right file, every image present and unchanged (its SHA-256 matches), and the
 * reviewer isn't someone who recorded or edited these expenses.
 */
export function verifyPack(data: unknown, imageHashes: Record<string, string | undefined>, reviewer: string): { pack?: PackData; problems: PackProblem[] } {
  const p = data as PackData;
  if (!p || p.format !== PACK_FORMAT || p.v !== 1 || !Array.isArray(p.expenses) || !p.event?.id)
    return { problems: [{ fatal: true, text: "This isn't an Event Bridge expenses handover file." }] };
  const problems: PackProblem[] = [];
  if (!canReview(p.expenses, reviewer))
    problems.push({ fatal: true, text: "You recorded or edited some of these expenses, so another team member has to review them." });
  for (const e of p.expenses) {
    if (!e.proof) continue;
    const want = p.files[e.proof.fileId]?.sha256;
    const got = imageHashes[e.proof.fileId];
    if (!got) problems.push({ fatal: false, text: `The proof for ${e.vendor} (₹${e.amount}) is missing from the file.` });
    else if (got !== want || got !== e.proof.sha256)
      problems.push({ fatal: true, text: `The proof for ${e.vendor} (₹${e.amount}) was changed after the handover was made. Ask for a new handover file.` });
  }
  return { pack: p, problems };
}

/** The reviewer can sign off once every expense has a decision; any query or rejection returns it. */
export function signOff(h: ReceivedHandover, now = new Date()): { ok: false; open: number } | { ok: true; state: "reconciled" | "returned"; reply: Reply } {
  const live = h.pack.expenses.filter((e) => !e.removed);
  const open = live.filter((e) => (h.reviews[e.id]?.state ?? "open") === "open").length;
  if (open) return { ok: false, open };
  const state = live.some((e) => h.reviews[e.id]?.state !== "checked") ? "returned" : "reconciled";
  return {
    ok: true,
    state,
    reply: { format: REPLY_FORMAT, v: 1, handoverId: h.id, eventId: h.pack.event.id, eventRef: h.pack.event.ref, reviewer: h.reviewer, signedAt: now.toISOString(), state, reviews: h.reviews },
  };
}

/** The recorder's side: the reviewer's decisions on each expense, with a "reviewed" history entry. */
export function applyReply(reply: unknown, sent: SentHandover[], expenses: Expense[]): { error: string } | { handover: SentHandover; expenses: Expense[] } {
  const r = reply as Reply;
  if (!r || r.format !== REPLY_FORMAT || r.v !== 1) return { error: "This isn't an Event Bridge handover reply." };
  const h = sent.find((x) => x.id === r.handoverId);
  if (!h) return { error: "This reply is for a handover that wasn't made on this device, or for another event." };
  if (contributors(expenses.filter((e) => h.expenseIds.includes(e.id))).has(r.reviewer.trim().toLowerCase()))
    return { error: "The reply was signed by someone who recorded these expenses, so it can't count as a review." };
  const changed = expenses
    .filter((e) => h.expenseIds.includes(e.id) && r.reviews[e.id])
    .map((e) => {
      const rv = r.reviews[e.id];
      return {
        ...e,
        review: { state: rv.state, note: rv.note, by: r.reviewer, at: r.signedAt },
        history: [...e.history, { at: r.signedAt, by: r.reviewer, action: "reviewed" as const, note: `${rv.state}${rv.note ? `: ${rv.note}` : ""}` }],
      };
    });
  return { handover: { ...h, state: r.state, reviewer: r.reviewer, signedAt: r.signedAt }, expenses: changed };
}

const categoryLabel = (cats: { id: string; label: string }[], id: string) => cats.find((c) => c.id === id)?.label ?? id;

/** The PDF summary inside the pack: event, totals by category and payer, and the ledger (UPI IDs masked). */
export function packSummaryDoc(p: PackData, brand: Brand, logoPng?: string): TDocumentDefinitions {
  const s = summarise(p.expenses);
  const live = p.expenses.filter((e) => !e.removed).sort((a, b) => (a.paidOn + (a.paidAt ?? "")).localeCompare(b.paidOn + (b.paidAt ?? "")));
  const ink = `#${brand.colors.ink}`;
  const accent = `#${brand.colors.accent}`;
  const muted = "#7a7068";
  const flagText = (e: Expense) =>
    flagsOf(e, p.expenses)
      .map((f) => ({ missingProof: "no proof", possibleDuplicate: "check duplicate", queried: "queried", rejected: "rejected" })[f])
      .join(", ");
  return {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [32, 32, 32, 36],
    info: { title: `Expenses ${p.event.ref}`, author: brand.company },
    defaultStyle: { font: "Roboto", fontSize: 9, color: ink },
    content: [
      {
        columns: [
          logoPng ? { image: `data:image/png;base64,${logoPng}`, width: 80 } : { text: brand.company, bold: true },
          {
            stack: [
              { text: "EXPENSES HANDOVER", bold: true, fontSize: 13, color: accent, characterSpacing: 2, alignment: "right" },
              { text: `${p.event.title} · ${p.event.client} · quotation ${p.event.ref}`, alignment: "right", margin: [0, 3, 0, 0] },
              { text: `Handed over by ${p.from} on ${formatDate(p.createdAt.slice(0, 10))}`, color: muted, alignment: "right" },
            ],
          },
        ],
      },
      { text: `${s.count} expenses · total ${formatINR(s.total)} · ${s.missingProof} without proof · ${s.duplicates} to check for duplicates`, bold: true, margin: [0, 14, 0, 6] },
      p.note ? { text: `Note: ${p.note}`, margin: [0, 0, 0, 8] } : { text: "" },
      {
        columns: [
          { width: "*", stack: [{ text: "By category", bold: true, margin: [0, 0, 0, 4] }, ...s.byCategory.map((c) => ({ text: `${categoryLabel(p.categories, c.id)}: ${formatINR(c.total)} (${c.count})` }))] },
          { width: "*", stack: [{ text: "Paid by (for reimbursement)", bold: true, margin: [0, 0, 0, 4] }, ...s.byPayer.map((x) => ({ text: `${x.label}: ${formatINR(x.total)}` }))] },
        ],
        margin: [0, 0, 0, 12],
      },
      {
        table: {
          headerRows: 1,
          widths: [62, "*", 80, 76, 90, 66, 70],
          body: [
            ["Date", "Paid to / what", "Category", "Paid by", "UPI ref", "Amount", "Check"].map((t) => ({ text: t, bold: true, color: "#ffffff", fillColor: ink })),
            ...live.map((e) => [
              `${formatDate(e.paidOn)}${e.paidAt ? ` ${e.paidAt}` : ""}`,
              { stack: [{ text: e.vendor }, { text: [e.description, maskUpi(e.payeeUpi)].filter(Boolean).join(" · "), color: muted, fontSize: 8 }] },
              categoryLabel(p.categories, e.category),
              e.payer.kind === "company" ? "Company account" : e.payer.name,
              cleanRef(e.upiRef) || "—",
              { text: formatINR(e.amount), alignment: "right" as const },
              { text: flagText(e), color: muted, fontSize: 8 },
            ] as TableCell[]),
          ] as TableCell[][],
        },
        layout: { hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => `#${brand.colors.line}` },
      },
      { text: "Each expense's proof is in the proof folder of this file, named by date, vendor and amount. Treat this file as confidential and delete it once the handover is signed off.", color: muted, fontSize: 8, margin: [0, 12, 0, 0] },
    ],
  };
}

/** The handover receipt: who handed over, who reviewed, when, and the outcome. */
export function handoverReceiptDoc(h: ReceivedHandover, reply: Reply, brand: Brand, logoPng?: string): TDocumentDefinitions {
  const live = h.pack.expenses.filter((e) => !e.removed);
  const s = summarise(live);
  const count = (st: ReviewState) => live.filter((e) => h.reviews[e.id]?.state === st).length;
  const issues = live.filter((e) => h.reviews[e.id]?.state !== "checked");
  return {
    pageSize: "A5",
    pageMargins: [32, 32, 32, 36],
    info: { title: `Handover ${h.pack.event.ref}`, author: brand.company },
    defaultStyle: { font: "Roboto", fontSize: 10, color: `#${brand.colors.ink}` },
    content: [
      logoPng ? { image: `data:image/png;base64,${logoPng}`, width: 80, margin: [0, 0, 0, 10] } : { text: brand.company, bold: true },
      { text: reply.state === "reconciled" ? "EXPENSES RECONCILED" : "EXPENSES RETURNED WITH QUERIES", bold: true, fontSize: 12, color: `#${brand.colors.accent}`, characterSpacing: 1.5 },
      { text: `${h.pack.event.title} · ${h.pack.event.client} · quotation ${h.pack.event.ref}`, margin: [0, 6, 0, 10] },
      {
        table: {
          widths: [110, "*"],
          body: [
            ["Handed over by", `${h.pack.from}, ${formatDate(h.pack.createdAt.slice(0, 10))}`],
            ["Reviewed by", `${reply.reviewer}, ${formatDate(reply.signedAt.slice(0, 10))}`],
            ["Expenses", `${s.count}, total ${formatINR(s.total)}`],
            ["Checked", String(count("checked"))],
            ["Queried", String(count("queried"))],
            ["Rejected", String(count("rejected"))],
          ],
        },
        layout: "lightHorizontalLines",
      },
      ...(issues.length
        ? [
            { text: "Queries and rejections", bold: true, margin: [0, 12, 0, 4] as [number, number, number, number] },
            { ul: issues.map((e) => `${e.vendor}, ${formatINR(e.amount)} (${formatDate(e.paidOn)}): ${h.reviews[e.id]?.state}${h.reviews[e.id]?.note ? `, ${h.reviews[e.id]!.note}` : ""}`) },
          ]
        : []),
    ],
  };
}
