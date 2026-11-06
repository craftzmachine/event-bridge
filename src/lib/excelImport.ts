/**
 * Turns a spreadsheet into a Proposal in the app's standard format (the same JSON that
 * "Back up all" writes and "Import" reads), without inventing values: anything missing,
 * unclear or contradictory becomes a question for the person uploading the file.
 *
 * Pure: it works on plain cell grids, so it runs in tests; `readWorkbook.ts` produces the grids.
 * Call `convertWorkbook(book, ctx, answers)` again after each round of answers; it returns the
 * questions still open (some only appear once an earlier one is answered) or the finished proposal.
 */
import type { Brand, Catalog, CatalogElement, EventFunction, Line, LineUpgrade, Proposal } from "../types";
import { computeTotals } from "./totals";
import { formatINR } from "./format";
import { QUOTE_REF_PATTERN, generateQuoteRef } from "./quoteRef";
import { uid } from "../state/proposals";

export type Cell = string | number | boolean | Date | null;
export interface SheetGrid {
  name: string;
  /** rows[r][c]; row 0 is spreadsheet row 1 */
  rows: Cell[][];
}
export interface WorkbookGrid {
  fileName: string;
  sheets: SheetGrid[];
}

export type Question =
  | { id: string; kind: "text"; prompt: string; help?: string; placeholder?: string; skipLabel?: string }
  | { id: string; kind: "choice"; prompt: string; help?: string; options: { value: string; label: string }[] }
  /** a rupee amount; "actuals" when allowActuals and the person picks "As per actuals" */
  | { id: string; kind: "amount"; prompt: string; help?: string; allowActuals?: boolean }
  | { id: string; kind: "number"; prompt: string; help?: string; suffix?: string; presets?: { value: string; label: string }[] }
  /** comma-separated YYYY-MM-DD, or "none" for no date yet */
  | { id: string; kind: "dates"; prompt: string; help?: string };
export type Answers = Record<string, string>;
export const SKIP = "__skip__";

/** One fact shown in the preview, with the cell it came from (or how it was decided). */
export interface SourceNote {
  label: string;
  value: string;
  source: string;
}
export interface ImportReport {
  fileName: string;
  sources: SourceNote[];
  /** things the file didn't have; left empty for the team to fill in later */
  notInFile: string[];
  /** rows left out, with why */
  skipped: { where: string; text: string; why: string }[];
  /** other things worth knowing before creating the proposal */
  notes: string[];
}
export type ConvertResult =
  | { status: "error"; message: string }
  | { status: "questions"; questions: Question[] }
  | { status: "ready"; proposal: Proposal; report: ImportReport };

export interface ConvertContext {
  catalog: Catalog;
  brand: Brand;
  /** quotation references already used on this device */
  takenRefs: string[];
}

/* ------------------------------------------------------------------ text and numbers */

/** lower case, accents and punctuation removed: "Décor & Production" → "decor production" */
export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%#]+/g, " ")
    .trim();
}
/** header cells also drop "(₹)", "Rs", "INR": "RATE (₹)" → "rate" */
const normHeader = (s: string) =>
  norm(s.replace(/\([^)]*\)/g, " ").replace(/₹/g, " "))
    .replace(/\b(rs|inr|in)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const text = (c: Cell | undefined): string => {
  if (c === null || c === undefined) return "";
  if (c instanceof Date) return isoFromDate(c);
  return String(c).trim();
};
const isBlank = (c: Cell | undefined) => text(c) === "" || /^[-–—]+$/.test(text(c));
const ACTUALS = /^(as per actuals?|at actuals?|on actuals?|actuals?|at cost|as per actual cost)$/i;
const isActuals = (c: Cell | undefined) => typeof c === "string" && ACTUALS.test(c.trim().replace(/\.$/, ""));
const TBC = /^(to be confirmed|date to be confirmed|tbc|tbd|to be decided|not decided|not fixed|na|n\/a)$/i;

/** 65000, "₹ 65,000.00", "1,20,000/-", "Rs. 500" → number; anything else → null */
export function parseNumber(c: Cell | undefined): number | null {
  if (typeof c === "number") return Number.isFinite(c) ? c : null;
  if (typeof c !== "string") return null;
  const s = c.replace(/₹|rs\.?|inr|\/-|,|\s/gi, "");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}
/** "2 nos" → { n: 2, unit: "nos" } */
function parseQty(c: Cell | undefined): { n: number | null; unit: string } {
  const n = parseNumber(c);
  if (n !== null) return { n, unit: "" };
  const m = typeof c === "string" ? c.trim().match(/^(\d+(?:\.\d+)?)\s*([A-Za-z][\w. ]*)$/) : null;
  return m ? { n: Number(m[1]), unit: m[2].trim() } : { n: null, unit: "" };
}
const r2 = (n: number) => Math.round(n * 100) / 100;
const close = (a: number, b: number) => Math.abs(a - b) <= 0.5;

/* ------------------------------------------------------------------ dates */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");
/** ExcelJS gives date cells as UTC midnight, so the UTC parts are the date the sheet shows. */
export function isoFromDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function iso(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
}
const fullYear = (y: number) => (y < 100 ? 2000 + y : y);
const monthIndex = (w: string) => {
  const i = MONTHS.indexOf(w.slice(0, 3).toLowerCase());
  return i >= 0 && /^[a-z]+$/i.test(w) && (w.length === 3 || "january february march april may june july august september october november december sept".includes(w.toLowerCase()))
    ? i + 1
    : 0;
};

export interface ParsedDates {
  dates: string[];
  /** day/month order unclear, e.g. 03/04/2027 */
  ambiguous: { text: string; dayFirst: string; monthFirst: string }[];
  /** true when part of the text couldn't be read as a date */
  unclear: boolean;
}

/**
 * Reads the date forms people type and the app writes: "12th & 14th February 2027",
 * "28th February 2027 · 1st March 2027", "12 Feb 2027", "Feb 12, 2027", "2027-02-12", "12/02/2027".
 */
export function parseDateText(raw: string): ParsedDates {
  const out: ParsedDates = { dates: [], ambiguous: [], unclear: false };
  let s = ` ${raw} `;
  s = s.replace(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, (_, y, m, d) => {
    const v = iso(+y, +m, +d);
    if (v) out.dates.push(v);
    else out.unclear = true;
    return " ";
  });
  s = s.replace(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})\b/g, (whole, a, b, y) => {
    const year = fullYear(+y);
    const dayFirst = iso(year, +b, +a);
    const monthFirst = iso(year, +a, +b);
    if (dayFirst && monthFirst && dayFirst !== monthFirst) out.ambiguous.push({ text: whole, dayFirst, monthFirst });
    else if (dayFirst || monthFirst) out.dates.push((dayFirst || monthFirst)!);
    else out.unclear = true;
    return " ";
  });

  // words: days, month names and years, read left to right
  const tokens = s.match(/[A-Za-z]+|\d+(?:st|nd|rd|th)?/gi) ?? [];
  let days: number[] = [];
  let pending: { d: number; m: number }[] = [];
  let monthFirst = 0;
  const filler = /^(and|to|on|the|of|st|nd|rd|th|date|dates|event|day|days)$/i;
  for (const t of tokens) {
    const ord = t.match(/^(\d{1,2})(st|nd|rd|th)?$/i);
    if (ord && +ord[1] >= 1 && +ord[1] <= 31) {
      if (monthFirst) pending.push({ d: +ord[1], m: monthFirst });
      else days.push(+ord[1]);
      continue;
    }
    if (/^\d{4}$/.test(t)) {
      const y = +t;
      if (days.length && monthFirst === 0 && !pending.length) out.unclear = true; // days with no month
      if (!pending.length) out.unclear = true; // a year with no day, e.g. "February 2027"
      for (const p of pending) {
        const v = iso(y, p.m, p.d);
        if (v) out.dates.push(v);
        else out.unclear = true;
      }
      pending = [];
      days = [];
      monthFirst = 0;
      continue;
    }
    const m = monthIndex(t);
    if (m) {
      if (days.length) {
        pending.push(...days.map((d) => ({ d, m })));
        days = [];
        monthFirst = 0;
      } else monthFirst = m;
      continue;
    }
    if (!filler.test(t)) out.unclear = true;
  }
  if (days.length || pending.length || monthFirst) out.unclear = true; // left without a year or month
  out.dates = [...new Set(out.dates)].sort();
  return out;
}

/* ------------------------------------------------------------------ reading the sheets */

type FieldKey = "client" | "contact" | "event" | "style" | "dates" | "venue" | "location" | "ref" | "notes";
const FIELD_LABELS: Record<FieldKey, string[]> = {
  client: ["client", "client name", "name of client", "name of the client", "customer", "customer name", "prepared for", "bride groom", "couple"],
  contact: ["contact", "contact number", "contact no", "contact details", "phone", "phone number", "phone no", "mobile", "mobile number", "mobile no", "email", "e mail"],
  event: ["event", "occasion", "event type", "type of event", "function"],
  style: ["ceremony style", "style", "ceremony", "tradition", "ceremony type"],
  dates: ["event date", "event dates", "date of event", "dates of event", "wedding date", "function date", "event day", "dates"],
  venue: ["venue", "venue name", "event venue", "hall"],
  location: ["location", "city", "place"],
  ref: ["quotation ref", "quotation reference", "quote ref", "quotation no", "quotation number", "quote no", "ref", "ref no", "reference"],
  notes: ["notes", "note", "remarks", "remark", "notes on the proposal"],
};
const LABEL_TO_FIELD = new Map<string, FieldKey>();
for (const [k, labels] of Object.entries(FIELD_LABELS)) for (const l of labels) LABEL_TO_FIELD.set(l, k as FieldKey);

type Col = "sl" | "name" | "notes" | "qty" | "unit" | "rate" | "amount" | "category" | "optional" | "included";
const HEADER_LABELS: Record<Col, string[]> = {
  sl: ["sl", "sl no", "s no", "sno", "sr no", "sr", "no", "#", "s l", "serial", "serial no"],
  name: ["element", "elements", "item", "items", "description", "item description", "particulars", "service", "services", "option", "options", "work", "scope", "element name", "item name", "product"],
  notes: ["notes", "note", "remarks", "remark", "specification", "specifications", "details", "comments", "comment"],
  qty: ["qty", "quantity", "nos", "count", "pax", "no of units", "number"],
  unit: ["unit", "units", "uom", "per"],
  rate: ["rate", "price", "unit price", "unit rate", "rate per unit", "cost", "unit cost"],
  amount: ["amount", "total", "total amount", "value", "line total", "net amount", "total cost"],
  category: ["category", "section", "head", "group"],
  optional: ["optional", "additional option", "add on", "addon"],
  included: ["included", "include", "in total", "in grand total"],
};

interface Found {
  value: Cell;
  where: string;
  label: string;
}
interface RawLine {
  key: string;
  where: string;
  name: string;
  notes: string;
  qty: Cell;
  unit: Cell;
  rate: Cell;
  amount: Cell;
  section: string;
  optional: boolean;
  upgrades: { name: string; price: Cell; where: string }[];
  /** the function heading it sits under ("FUNCTION: Haldi — …"), if any */
  fn?: string;
}
interface ItemsTable {
  sheet: string;
  headerRow: number;
  lines: RawLine[];
  /** rows with figures but no item name, kept whole so a name from the person turns them into items */
  nameless: { text: string; line: RawLine }[];
  /** rows that looked like a heading but had nothing under them, e.g. "No additional options in this proposal." */
  emptyHeadings: { where: string; text: string }[];
  /** "FUNCTION: Haldi — 12th February 2027" rows, as the app's export writes them */
  functions: { label: string; dateText: string; where: string }[];
}
interface Parsed {
  fields: Partial<Record<FieldKey, Found>>;
  tables: ItemsTable[];
  options: ItemsTable[];
  terms: string[];
  termsWhere: string;
  notes: { text: string; where: string }[];
  coordination?: { pct: number; where: string };
  grandTotal?: { value: number; where: string };
  /** the file's own "Total" / "Sub Total" of the items, checked against the converted items */
  itemsTotal?: { value: number; where: string };
  hiddenNotes: string[];
}

const colLetter = (c: number) => {
  let s = "";
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
const at = (sheet: string, r: number, c?: number) => (c === undefined ? `${sheet}, row ${r + 1}` : `${sheet}!${colLetter(c)}${r + 1}`);
const isOptionsSheet = (name: string) => /option|add[- ]?on|additional/i.test(name);
const isTermsSheet = (name: string) => /term|condition/i.test(name);
const AUTO_NOTE = /will be billed as per actuals and are not included|additional options are listed on the next tab/i;
const TOTAL_ROW = /^(sub ?total|grand total|total|net total|gross total)\b/;

/** "Client: Ananya" in one cell → label + value */
function splitLabel(s: string): { label: string; value: string } | null {
  const m = s.match(/^([^:]{2,40}):\s*(.+)$/);
  return m ? { label: norm(m[1]), value: m[2].trim() } : null;
}

function readFields(sheet: SheetGrid, from: number, to: number, fields: Parsed["fields"]) {
  for (let r = from; r < to; r++) {
    const row = sheet.rows[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const t = text(row[c]);
      if (!t || typeof row[c] !== "string") continue;
      const inline = splitLabel(t);
      const key = LABEL_TO_FIELD.get(norm(t)) ?? (inline ? LABEL_TO_FIELD.get(inline.label) : undefined);
      if (!key || fields[key]) continue;
      if (inline && LABEL_TO_FIELD.get(inline.label) === key && !LABEL_TO_FIELD.get(norm(t))) {
        fields[key] = { value: inline.value, where: at(sheet.name, r, c), label: t.split(":")[0].trim() };
        break;
      }
      // the value is the next filled cell to the right
      let v = c + 1;
      while (v < row.length && isBlank(row[v]) && !(row[v] instanceof Date) && typeof row[v] !== "number") v++;
      if (v < row.length) {
        fields[key] = { value: row[v], where: at(sheet.name, r, v), label: t };
        break;
      }
    }
  }
}

function findHeader(sheet: SheetGrid): { row: number; cols: Partial<Record<Col, number>> } | null {
  for (let r = 0; r < sheet.rows.length; r++) {
    const cols: Partial<Record<Col, number>> = {};
    (sheet.rows[r] ?? []).forEach((cell, c) => {
      if (typeof cell !== "string") return;
      const h = normHeader(cell);
      for (const [col, labels] of Object.entries(HEADER_LABELS) as [Col, string[]][]) {
        if (cols[col] === undefined && labels.includes(h)) {
          cols[col] = c;
          break;
        }
      }
    });
    if (cols.name !== undefined && (cols.qty !== undefined || cols.rate !== undefined || cols.amount !== undefined)) return { row: r, cols };
  }
  return null;
}

const yes = (c: Cell | undefined) => c === true || /^(y|yes|true|1|optional)$/i.test(text(c));
const no = (c: Cell | undefined) => c === false || /^(n|no|false|0)$/i.test(text(c));

function readTable(sheet: SheetGrid, header: { row: number; cols: Partial<Record<Col, number>> }, parsed: Parsed, optionsSheet: boolean): ItemsTable {
  const { cols } = header;
  const get = (row: Cell[], col: Col) => (cols[col] === undefined ? null : row[cols[col]!] ?? null);
  const table: ItemsTable = { sheet: sheet.name, headerRow: header.row, lines: [], nameless: [], emptyHeadings: [], functions: [] };
  let fn = "";
  let section = "";
  let sectionStart: RawLine | null = null; // a "section" row that may turn out to be an unpriced item
  let sectionHadItems = false;
  let sectionNumbered = false;
  let r = header.row + 1;
  // a heading with nothing under it is an unpriced item when it has a serial number; otherwise it is left out (and reported)
  const flushSection = () => {
    if (sectionStart && !sectionHadItems) {
      if (sectionNumbered) table.lines.push(sectionStart);
      else table.emptyHeadings.push({ where: sectionStart.where, text: sectionStart.name });
    }
    sectionStart = null;
  };
  for (; r < sheet.rows.length; r++) {
    const row = sheet.rows[r] ?? [];
    const name = text(get(row, "name"));
    const rowText = row.map(text).filter(Boolean);
    if (!rowText.length) continue;
    // a function heading: the items below belong to it until the next one
    const fnHead = rowText.find((t) => /^function\s*:/i.test(t));
    if (fnHead) {
      flushSection();
      const [label, ...date] = fnHead.replace(/^function\s*:\s*/i, "").split(/\s+[—–]\s+/);
      fn = label.trim();
      table.functions.push({ label: fn, dateText: date.join(" ").trim(), where: at(sheet.name, r) });
      section = "";
      continue;
    }
    // "Haldi subtotal": the export's own sum of that function, worked out again from the items
    if (/\S\s+sub ?total$/.test(norm(name))) continue;
    if (TOTAL_ROW.test(norm(name)) || (!name && rowText.some((t) => TOTAL_ROW.test(norm(t))))) break;
    const numbers = [get(row, "qty"), get(row, "rate"), get(row, "amount")].some((c) => !isBlank(c));
    const key = `${sheet.name}!${r + 1}`;
    const notes = text(get(row, "notes"));
    const unit = get(row, "unit");
    const category = text(get(row, "category"));
    const line: RawLine = {
      key,
      where: at(sheet.name, r),
      name,
      notes,
      qty: get(row, "qty"),
      unit,
      rate: get(row, "rate"),
      amount: get(row, "amount"),
      section: category || section,
      optional: optionsSheet || /^(additional options?|optional|add ons?)$/.test(norm(section)) || yes(get(row, "optional")) || no(get(row, "included")),
      upgrades: [],
      ...(fn ? { fn } : {}),
    };
    if (!name) {
      if (numbers) table.nameless.push({ text: rowText.join(" · "), line });
      continue;
    }
    if (name.startsWith("+")) {
      const prev = table.lines[table.lines.length - 1];
      const price = isBlank(get(row, "amount")) ? get(row, "rate") : get(row, "amount");
      if (prev) prev.upgrades.push({ name: name.replace(/^\+\s*/, ""), price, where: at(sheet.name, r) });
      else table.nameless.push({ text: rowText.join(" · "), line: { ...line, name: "" } });
      continue;
    }
    if (!numbers && isBlank(unit) && !notes && !category) {
      // a section heading ("A  Décor & Production"), unless nothing follows it
      flushSection();
      section = name;
      sectionStart = line;
      sectionHadItems = false;
      sectionNumbered = parseNumber(get(row, "sl")) !== null;
      continue;
    }
    if (sectionStart) sectionHadItems = true;
    table.lines.push(line);
  }
  flushSection();

  // below the table: totals and free-text notes
  for (; r < sheet.rows.length; r++) {
    const row = sheet.rows[r] ?? [];
    const cells = row.map(text);
    const label = norm(cells.find((t) => /[a-z]/i.test(t)) ?? "");
    const lastNumber = [...row].reverse().find((c) => parseNumber(c) !== null);
    if (/co ?ordination/.test(label) && !optionsSheet) {
      const fromLabel = cells.join(" ").match(/(\d+(?:\.\d+)?)\s*%/);
      const pctCell = row.find((c) => typeof c === "number" && c > 0 && c < 1);
      const pct = fromLabel ? Number(fromLabel[1]) : typeof pctCell === "number" ? r2(pctCell * 100) : null;
      if (pct !== null && !parsed.coordination) parsed.coordination = { pct, where: at(sheet.name, r) };
      continue;
    }
    if (/^grand total/.test(label) && !optionsSheet && lastNumber !== undefined && !parsed.grandTotal) {
      parsed.grandTotal = { value: parseNumber(lastNumber)!, where: at(sheet.name, r) };
      continue;
    }
    if (/^(sub ?total|total|net total|total amount)$/.test(label) && !optionsSheet && lastNumber !== undefined && !parsed.itemsTotal) {
      parsed.itemsTotal = { value: parseNumber(lastNumber)!, where: at(sheet.name, r) };
      continue;
    }
    const filled = cells.filter(Boolean);
    if (filled.length === 1 && filled[0].length >= 20 && !AUTO_NOTE.test(filled[0]) && !optionsSheet && parseNumber(filled[0]) === null)
      parsed.notes.push({ text: filled[0], where: at(sheet.name, r) });
  }
  return table;
}

function readTerms(sheet: SheetGrid, parsed: Parsed) {
  for (let r = 0; r < sheet.rows.length; r++) {
    const strings = (sheet.rows[r] ?? []).map(text).filter((t) => t && parseNumber(t) === null);
    if (!strings.length) continue;
    const longest = strings.reduce((a, b) => (b.length > a.length ? b : a));
    if (/point of contact/i.test(longest)) break; // the app's own export: contact block after the terms
    if (/^terms( and| &)? conditions$/i.test(longest.trim()) || longest.length < 4) continue;
    if (!parsed.terms.length) parsed.termsWhere = at(sheet.name, r);
    parsed.terms.push(longest);
  }
}

export function parseWorkbook(book: WorkbookGrid): Parsed {
  const parsed: Parsed = { fields: {}, tables: [], options: [], terms: [], termsWhere: "", notes: [], hiddenNotes: [] };
  for (const sheet of book.sheets) {
    if (isTermsSheet(sheet.name)) {
      readTerms(sheet, parsed);
      continue;
    }
    const header = findHeader(sheet);
    if (!header) {
      readFields(sheet, 0, sheet.rows.length, parsed.fields);
      continue;
    }
    readFields(sheet, 0, header.row, parsed.fields);
    const optionsSheet = isOptionsSheet(sheet.name);
    const table = readTable(sheet, header, parsed, optionsSheet);
    (optionsSheet ? parsed.options : parsed.tables).push(table);
  }
  return parsed;
}

/* ------------------------------------------------------------------ resolving into a proposal */

function matchCategory(label: string, catalog: Catalog): string | null {
  const n = norm(label);
  if (!n) return null;
  if (/^other( elements)?$/.test(n)) return "other";
  const hit = catalog.categories.find((c) => norm(c.label) === n || c.id === n);
  return hit?.id ?? null;
}
export function matchElement(name: string, catalog: Catalog): CatalogElement | undefined {
  const n = norm(name);
  return catalog.elements.find((e) => norm(e.name) === n);
}
/** whole-word matches of catalogue labels inside free text */
function labelsIn(t: string, choices: { id: string; label: string }[]): string[] {
  const words = ` ${norm(t)} `;
  return choices.filter((c) => words.includes(` ${norm(c.label)} `) || words.includes(` ${norm(c.label)}s `)).map((c) => c.id);
}
const quote = (s: string) => `“${s.length > 60 ? `${s.slice(0, 57)}…` : s}”`;
const rupees = (n: number) => formatINR(n);

export function convertWorkbook(book: WorkbookGrid, ctx: ConvertContext, answers: Answers = {}): ConvertResult {
  const { catalog, brand } = ctx;
  if (!book.sheets.length || book.sheets.every((s) => !s.rows.some((r) => r.some((c) => !isBlank(c)))))
    return { status: "error", message: "The workbook is empty, so there is nothing to convert." };

  const parsed = parseWorkbook(book);
  if (!parsed.tables.length && !parsed.options.length)
    return {
      status: "error",
      message:
        "No items table was found. The sheet needs a header row with an item column (Element, Item, Description or Particulars) and at least one of Qty, Rate or Amount, with one item per row below it.",
    };

  const questions: Question[] = [];
  const ask = (q: Question) => {
    if (answers[q.id] === undefined) questions.push(q);
  };
  const report: ImportReport = { fileName: book.fileName, sources: [], notInFile: [], skipped: [], notes: [] };

  // ---- which sheet holds the proposal
  let tables = parsed.tables;
  if (tables.length > 1) {
    ask({
      id: "sheet",
      kind: "choice",
      prompt: "The file has more than one items table. Which sheet is this proposal?",
      options: tables.map((t) => ({ value: t.sheet, label: `${t.sheet} (${t.lines.length} item${t.lines.length === 1 ? "" : "s"})` })),
    });
    const pick = answers.sheet;
    if (pick) {
      for (const t of tables) if (t.sheet !== pick) report.notes.push(`The items on “${t.sheet}” were left out, as you chose “${pick}”.`);
      tables = tables.filter((t) => t.sheet === pick);
    }
  }
  const all = [...tables, ...parsed.options];
  for (const t of all)
    for (const h of t.emptyHeadings)
      if (!/^no (elements selected yet|additional options in this proposal).?$/i.test(h.text))
        report.skipped.push({ where: h.where, text: h.text, why: "A heading with no items under it." });
  const rawLines = all.flatMap((t) => t.lines);
  if (!rawLines.length && !all.some((t) => t.nameless.length))
    return {
      status: "error",
      message: `The items table on “${all[0].sheet}” (header on row ${all[0].headerRow + 1}) has no items under it.`,
    };

  // ---- client and event details
  const f = parsed.fields;
  const fieldText = (k: FieldKey) => {
    const v = f[k];
    if (!v) return "";
    const t = text(v.value);
    return TBC.test(t.replace(/\.$/, "")) ? "" : t;
  };
  const source = (label: string, value: string, k: FieldKey | null, fallback: string) =>
    report.sources.push({ label, value, source: k && f[k] ? `${f[k]!.where}` : fallback });

  let clientName = fieldText("client");
  if (!clientName) {
    ask({ id: "client", kind: "text", prompt: "What is the client's name?", help: "The file doesn't say who the proposal is for.", placeholder: "e.g. Ms. Ananya Menon" });
    clientName = (answers.client ?? "").trim();
    if (answers.client !== undefined && !clientName) questions.push({ id: "client", kind: "text", prompt: "What is the client's name?", help: "A name is needed to create the proposal." });
    source("Client", clientName, null, "Your answer");
  } else source("Client", clientName, "client", "");

  const contact = fieldText("contact");
  if (contact) source("Contact", contact, "contact", "");
  else report.notInFile.push("Contact number");
  const venue = fieldText("venue");
  if (venue) source("Venue", venue, "venue", "");
  else report.notInFile.push("Venue");
  const location = fieldText("location");
  if (location) source("Location", location, "location", "");

  // event type and ceremony style, e.g. "Hindu Wedding"
  const eventText = fieldText("event");
  const styleText = fieldText("style") || eventText;
  const resolveChoice = (
    id: "eventType" | "style",
    found: string[],
    textSeen: string,
    noun: string,
    choices: { id: string; label: string }[],
    k: FieldKey,
  ): string | null => {
    if (found.length === 1) {
      source(noun, choices.find((c) => c.id === found[0])!.label, k, "");
      return found[0];
    }
    const prompt = textSeen
      ? `The file says ${quote(textSeen)}. Which ${noun.toLowerCase()} is it?`
      : `Which ${noun.toLowerCase()} is this proposal for?`;
    ask({
      id,
      kind: "choice",
      prompt,
      help: textSeen ? undefined : "The file doesn't say.",
      options: [...choices.map((c) => ({ value: c.id, label: c.label })), { value: "", label: "Decide later in the Occasion step" }],
    });
    const a = answers[id];
    if (a === undefined) return null;
    source(noun, a ? choices.find((c) => c.id === a)?.label ?? a : "Not chosen yet", null, "Your answer");
    return a || null;
  };
  const eventType = resolveChoice("eventType", labelsIn(eventText, catalog.eventTypes), eventText, "Event type", catalog.eventTypes, "event");
  const style = resolveChoice("style", labelsIn(styleText, catalog.ceremonyStyles), fieldText("style") || eventText, "Ceremony style", catalog.ceremonyStyles, f.style ? "style" : "event");

  // event dates
  let dates: string[] = [];
  const dateField = f.dates;
  const dateCell = dateField?.value ?? null;
  if (dateCell instanceof Date) dates = [isoFromDate(dateCell)];
  else if (typeof dateCell === "number" && dateCell > 20000 && dateCell < 80000) {
    dates = [isoFromDate(new Date(Date.UTC(1899, 11, 30) + dateCell * 86400000))]; // Excel serial date
  } else if (fieldText("dates")) {
    const p = parseDateText(fieldText("dates"));
    if (p.unclear || (!p.dates.length && !p.ambiguous.length)) {
      ask({
        id: "dates",
        kind: "dates",
        prompt: `The event date reads ${quote(fieldText("dates"))}. Which date or dates is that?`,
        help: "Add each date, or choose “No date yet”.",
      });
      if (answers.dates !== undefined) dates = answers.dates === "none" ? [] : answers.dates.split(",").filter(Boolean);
    } else {
      dates = p.dates;
      p.ambiguous.forEach((a, i) => {
        const id = `dateOrder:${i}`;
        const fmt = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
        ask({
          id,
          kind: "choice",
          prompt: `Is ${quote(a.text)} ${fmt(a.dayFirst)} or ${fmt(a.monthFirst)}?`,
          options: [
            { value: a.dayFirst, label: fmt(a.dayFirst) },
            { value: a.monthFirst, label: fmt(a.monthFirst) },
          ],
        });
        if (answers[id]) dates.push(answers[id]);
      });
    }
  }
  dates = [...new Set(dates)].sort();
  if (dates.length) report.sources.push({ label: dates.length > 1 ? "Event dates" : "Event date", value: dates.join(", "), source: answers.dates || Object.keys(answers).some((k) => k.startsWith("dateOrder")) ? "Your answer" : dateField!.where });
  else report.notInFile.push("Event date");

  // rows with figures but no item name: once named, they go through the same rules as other items
  for (const n of all.flatMap((t) => t.nameless)) {
    const id = `rowName:${n.line.key}`;
    ask({ id, kind: "text", prompt: `${n.line.where} has figures but no item name (${quote(n.text)}). What is the item?`, skipLabel: "Leave this row out" });
    const a = answers[id]?.trim();
    if (a === SKIP) report.skipped.push({ where: n.line.where, text: n.text, why: "No item name; you chose to leave it out." });
    else if (a) rawLines.push({ ...n.line, name: a });
  }

  // ---- functions ("FUNCTION: Haldi — 12th February 2027" rows, as the app's export writes them)
  const functions: EventFunction[] = [];
  const fnIds = new Map<string, string>();
  for (const t of tables)
    for (const f of t.functions) {
      if (fnIds.has(norm(f.label))) continue;
      // a date that can't be read for certain is left to be set in the app, never guessed
      const d = parseDateText(f.dateText);
      const date = d.dates.length === 1 && !d.ambiguous.length && !d.unclear ? d.dates[0] : "";
      const id = `f-${uid()}`;
      fnIds.set(norm(f.label), id);
      functions.push({ id, label: f.label, date });
      source(`Function: ${f.label}`, f.dateText || "date to be confirmed", null, f.where);
    }

  // ---- lines
  const lines: Line[] = [];
  const categoryAsked = new Map<string, string[]>(); // section → item names, for one question per section
  type Pending = { raw: RawLine; el?: CatalogElement; category: string | null };
  // "Upgrade: X" rows in Additional Options belong to another item, so they need no category of their own
  const offeredFor = (raw: RawLine) => {
    const parent = raw.optional && /^upgrade:/i.test(raw.name) ? raw.notes.match(/for\s+[“"](.+)[”"]/i)?.[1] : undefined;
    return parent && rawLines.some((x) => x !== raw && norm(x.name) === norm(parent)) ? parent : undefined;
  };
  const pendings: Pending[] = rawLines.map((raw) => {
    const el = matchElement(raw.name, catalog);
    const category = matchCategory(raw.section, catalog) ?? el?.category ?? (offeredFor(raw) ? "other" : null);
    if (!category) {
      const k = raw.section || "";
      categoryAsked.set(k, [...(categoryAsked.get(k) ?? []), raw.name]);
    }
    return { raw, el, category };
  });
  const catOptions = [
    ...[...catalog.categories].sort((a, b) => a.order - b.order).map((c) => ({ value: c.id, label: c.label })),
    { value: "other", label: "Other elements" },
  ];
  for (const [section, names] of categoryAsked) {
    const id = `category:${section}`;
    ask({
      id,
      kind: "choice",
      prompt: section
        ? `Which catalogue category matches the section ${quote(section)}?`
        : `Which category do ${names.length === 1 ? "this item" : `these ${names.length} items`} belong to: ${names.slice(0, 3).map(quote).join(", ")}${names.length > 3 ? "…" : ""}?`,
      help: section ? `${names.length} item${names.length === 1 ? "" : "s"} in it.` : "They have no section in the file and aren't catalogue elements.",
      options: catOptions,
    });
  }

  // items with only an amount: one question for all of them
  const amountOnly = pendings.filter(
    ({ raw }) => parseQty(raw.qty).n === null && parseNumber(raw.rate) === null && !isActuals(raw.rate) && parseNumber(raw.amount) !== null,
  );
  if (amountOnly.length) {
    ask({
      id: "amountOnly",
      kind: "choice",
      prompt: `${amountOnly.length === 1 ? "One item has" : `${amountOnly.length} items have`} an amount but no quantity or rate (${amountOnly.slice(0, 2).map((p) => quote(p.raw.name)).join(", ")}${amountOnly.length > 2 ? "…" : ""}). How should ${amountOnly.length === 1 ? "it" : "they"} be entered?`,
      options: [
        { value: "lump", label: "As a lump sum: quantity 1 at the amount shown" },
        { value: "each", label: "Let me enter the quantity for each" },
      ],
    });
  }

  for (const { raw, el, category } of pendings) {
    const q = parseQty(raw.qty);
    let qty = q.n;
    let rate: number | null | undefined = parseNumber(raw.rate);
    const amount = parseNumber(raw.amount);
    const actuals = isActuals(raw.rate) || isActuals(raw.amount);
    const label = quote(raw.name);
    if (actuals) rate = null;

    if (qty === null && rate !== null && rate !== undefined && amount !== null && rate > 0) {
      const derived = amount / rate;
      if (Math.abs(derived - Math.round(derived * 1000) / 1000) < 1e-9) qty = Math.round(derived * 1000) / 1000;
    }
    if (qty === null && amountOnly.some((p) => p.raw === raw)) {
      if (answers.amountOnly === "lump") {
        qty = 1;
        rate = amount;
        report.notes.push(`${raw.name}: entered as 1 × ${rupees(amount!)}, as you chose.`);
      }
    }
    if (qty === null && !(amountOnly.some((p) => p.raw === raw) && answers.amountOnly === undefined)) {
      const id = `qty:${raw.key}`;
      ask({ id, kind: "number", prompt: `What is the quantity for ${label}?`, help: `${raw.where} has no quantity.` });
      if (answers[id] !== undefined) qty = Number(answers[id]);
    }
    if (rate === undefined || (rate === null && !actuals)) {
      if (amount !== null && qty) rate = r2(amount / qty);
      else if (!(amountOnly.some((p) => p.raw === raw) && answers.amountOnly !== "each")) {
        const id = `rate:${raw.key}`;
        ask({ id, kind: "amount", prompt: `What is the rate for ${label}?`, help: `${raw.where} has no rate or amount.`, allowActuals: true });
        if (answers[id] !== undefined) rate = answers[id] === "actuals" ? null : Number(answers[id]);
      }
    }
    // the sheet's amount disagrees with qty × rate
    if (qty !== null && typeof rate === "number" && amount !== null && !close(qty * rate, amount) && answers[`rate:${raw.key}`] === undefined) {
      const id = `amount:${raw.key}`;
      const perUnit = qty ? r2(amount / qty) : rate;
      ask({
        id,
        kind: "choice",
        prompt: `For ${label}, ${qty} × ${rupees(rate)} is ${rupees(r2(qty * rate))}, but the amount says ${rupees(amount)}. Which is right?`,
        options: [
          { value: "rate", label: `The rate: ${rupees(rate)} each (${rupees(r2(qty * rate))})` },
          { value: "amount", label: `The amount: ${rupees(amount)} (${rupees(perUnit)} each)` },
        ],
      });
      if (answers[id] === "amount") rate = perUnit;
    }

    const cat = category ?? answers[`category:${raw.section || ""}`];
    if (qty === null || rate === undefined || !cat) continue; // still waiting for an answer

    const upgrades: LineUpgrade[] = (el?.upgrades ?? []).map((u) => ({ ...u, mode: "off" as const }));
    raw.upgrades.forEach((u, i) => {
      let price = parseNumber(u.price);
      if (price === null) {
        const id = `upgrade:${raw.key}:${i}`;
        ask({ id, kind: "amount", prompt: `What is the price of the upgrade ${quote(u.name)} on ${label}?`, help: `${u.where} has no price.` });
        if (answers[id] === undefined) return;
        price = Number(answers[id]);
      }
      const known = upgrades.find((x) => norm(x.name) === norm(u.name));
      if (known) Object.assign(known, { price, mode: "include" });
      else upgrades.push({ id: uid(), name: u.name, price, mode: "include" });
    });

    lines.push({
      uid: uid(),
      elementId: el?.id ?? null,
      name: raw.name,
      category: cat,
      unit: text(raw.unit) || q.unit || el?.unit || "",
      qty,
      rate: rate === null ? null : r2(rate),
      notes: raw.notes,
      optional: raw.optional,
      upgrades,
      ...(raw.fn && fnIds.has(norm(raw.fn)) ? { fn: fnIds.get(norm(raw.fn)) } : {}),
    });
  }

  // offered upgrades from the Additional Options sheet ("Upgrade: X", notes "For “Y”")
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    const up = l.name.match(/^upgrade:\s*(.+)$/i);
    const parent = l.notes.match(/for\s+[“"](.+)[”"]/i);
    if (!l.optional || !up || !parent) continue;
    const target = lines.find((x) => !x.name.match(/^upgrade:/i) && norm(x.name) === norm(parent[1]));
    if (!target || l.rate === null) continue;
    const known = target.upgrades.find((u) => norm(u.name) === norm(up[1]));
    if (known) Object.assign(known, { price: l.rate * l.qty, mode: "offer" });
    else target.upgrades.push({ id: uid(), name: up[1].trim(), price: l.rate * l.qty, mode: "offer" });
    lines.splice(i, 1);
  }

  // ---- co-ordination, terms, notes, reference
  let coordinationPct: number | null = parsed.coordination?.pct ?? null;
  if (coordinationPct !== null) report.sources.push({ label: brand.coordinationLabel, value: `${coordinationPct}%`, source: parsed.coordination!.where });
  else {
    ask({
      id: "coordination",
      kind: "number",
      prompt: `The file has no ${brand.coordinationLabel.toLowerCase()}. What percentage should the proposal use?`,
      suffix: "%",
      presets: [
        { value: String(brand.coordinationPct), label: `${brand.coordinationPct}% (the usual rate)` },
        { value: "0", label: "None (0%)" },
      ],
    });
    if (answers.coordination !== undefined) {
      coordinationPct = Number(answers.coordination);
      report.sources.push({ label: brand.coordinationLabel, value: `${coordinationPct}%`, source: "Your answer" });
    }
  }

  let terms = parsed.terms;
  if (terms.length) report.sources.push({ label: "Terms & conditions", value: `${terms.length} from the file`, source: parsed.termsWhere });
  else {
    ask({
      id: "terms",
      kind: "choice",
      prompt: "The file has no terms and conditions. What should the proposal use?",
      options: [
        { value: "standard", label: `The standard ${brand.company} terms (${brand.terms.length})` },
        { value: "none", label: "No terms for now" },
      ],
    });
    if (answers.terms !== undefined) {
      terms = answers.terms === "standard" ? [...brand.terms] : [];
      report.sources.push({ label: "Terms & conditions", value: answers.terms === "standard" ? `The standard terms (${terms.length})` : "None", source: "Your answer" });
    }
  }

  const notes = [fieldText("notes"), ...parsed.notes.map((n) => n.text)].filter(Boolean).join("\n");
  if (notes) report.sources.push({ label: "Notes", value: notes, source: f.notes?.where ?? parsed.notes[0]?.where ?? "" });

  if (questions.length) return { status: "questions", questions: dedupe(questions) };
  if (!lines.length) return { status: "error", message: "Every row was left out, so there are no items to create a proposal from." };

  // ---- grand total: keep a quoted total that differs from the calculation only if the person says so
  let grandTotal: number | null = null;
  if (parsed.grandTotal) {
    const t = computeTotals({ lines, coordinationPct: coordinationPct!, grandTotal: null }, brand.gstPct);
    const sheetGT = parsed.grandTotal.value;
    if (!close(sheetGT, t.beforeRound)) {
      ask({
        id: "grandTotal",
        kind: "choice",
        prompt: `The file's Grand Total is ${rupees(sheetGT)}, but the items and ${brand.coordinationLabel.toLowerCase()} add up to ${rupees(t.beforeRound)}. Which should the proposal quote?`,
        help: `Keeping the file's total adds a round-off of ${rupees(r2(sheetGT - t.beforeRound))}.`,
        options: [
          { value: "file", label: `${rupees(sheetGT)}, from the file` },
          { value: "calc", label: `${rupees(t.beforeRound)}, as calculated` },
        ],
      });
      if (answers.grandTotal === undefined) return { status: "questions", questions };
      if (answers.grandTotal === "file") grandTotal = sheetGT;
    }
    report.sources.push({ label: "Grand Total", value: rupees(grandTotal ?? t.beforeRound), source: answers.grandTotal ? "Your answer" : parsed.grandTotal.where });
  }
  if (parsed.itemsTotal) {
    const sub = computeTotals({ lines, coordinationPct: coordinationPct!, grandTotal }, brand.gstPct).subTotal;
    if (!close(sub, parsed.itemsTotal.value))
      report.notes.push(
        `The file's total (${rupees(parsed.itemsTotal.value)}, ${parsed.itemsTotal.where}) differs from the items' Sub Total here (${rupees(sub)}), because of the answers above or items billed as per actuals. Check the figures before sending.`,
      );
  }

  const fileRef = fieldText("ref");
  let ref = "";
  if (fileRef && QUOTE_REF_PATTERN.test(fileRef) && !ctx.takenRefs.includes(fileRef)) {
    ref = fileRef;
    source("Quotation ref", ref, "ref", "");
  } else {
    ref = generateQuoteRef(ctx.takenRefs);
    report.notes.push(
      fileRef
        ? QUOTE_REF_PATTERN.test(fileRef)
          ? `The quotation reference ${fileRef} is already used on this device, so this proposal gets ${ref}.`
          : `${quote(fileRef)} isn't in the app's reference format (YYYYDDMM-ABC), so this proposal gets ${ref}.`
        : `A new quotation reference, ${ref}, was assigned.`,
    );
  }

  const now = new Date().toISOString();
  const proposal: Proposal = {
    id: uid(),
    createdAt: now,
    updatedAt: now,
    client: { name: clientName, contact, date: dates[0] ?? "", dates, venue, location },
    ref,
    eventType,
    style,
    lines,
    coordinationPct: coordinationPct!,
    grandTotal,
    terms,
    notes,
    ...(functions.length ? { functions } : {}),
  };
  return { status: "ready", proposal, report };
}

function dedupe(qs: Question[]): Question[] {
  const seen = new Set<string>();
  return qs.filter((q) => (seen.has(q.id) ? false : (seen.add(q.id), true)));
}
