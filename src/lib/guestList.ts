// The couple's guest list and RSVP: who's invited to which function, how many, and what they answered.
// Pure, so guestList.test.ts runs it in Node. The server keeps its own copy of the reply rules in server/rsvp.ts.
import type { Brand, EventFunction, Guest, GuestList, GuestSide, Proposal, RsvpSettings, RsvpStatus } from "../types";
import { sheetFunctions } from "./coordination";
import { waNumber } from "./whatsapp";

export const GUEST_LIMIT = 2000;
export const PARTY_MAX = 20;
export const TEXT_MAX = 300;
export const MEALS_DEFAULT = ["Vegetarian", "Non-vegetarian"];
export const SIDES: { id: GuestSide; label: string }[] = [
  { id: "bride", label: "Bride's side" },
  { id: "groom", label: "Groom's side" },
  { id: "both", label: "Both" },
  { id: "", label: "Not set" },
];
export const STATUS_LABEL: Record<RsvpStatus | "pending", string> = { yes: "Coming", no: "Not coming", maybe: "Maybe", pending: "No reply" };

/** the reply a guest sends (and the server returns), keyed by their code; open replies carry a name and phone */
export interface WireReply {
  replies: Record<string, { status: RsvpStatus; count: number }>;
  meal?: string;
  dietary?: string;
  note?: string;
  name?: string;
  phone?: string;
  /** epoch ms */
  at: number;
}

/** what the RSVP page shows: the invitation, and for a personal link only that household */
export interface RsvpInvite {
  title: string;
  host: string;
  message?: string;
  deadline?: string;
  meals: string[];
  open: boolean;
  theme?: string;
  fns: { id: string; label: string; date: string; venue: string }[];
  guests: { code: string; name: string; invited: number; fns: string[] }[];
}

// no 0/O, 1/I/L: codes get read out over the phone
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** a 10-character personal code from the browser's random source (getRandomValues works on plain http too) */
export function guestCode(rand: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = rand(10);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export const isCode = (s: unknown): s is string => typeof s === "string" && /^[2-9A-HJKMNP-Z]{10}$/.test(s);
/** an open reply's key on the server: "open-" + 16 lowercase hex characters */
export const isOpenKey = (s: unknown): s is string => typeof s === "string" && /^open-[0-9a-f]{16}$/.test(s);

const id = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const clip = (s: unknown, n = TEXT_MAX) => (typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n) : "");

/** the functions guests can be invited to: the proposal's own, or one stand-in ("") */
export const guestFunctions = (p: Proposal): EventFunction[] => sheetFunctions(p, "Wedding");

export const listOf = (p: Pick<Proposal, "guestList">): GuestList => p.guestList ?? { guests: [] };

export function newGuest(p: Proposal, partial: Partial<Guest> = {}, taken: Set<string> = new Set(listOf(p).guests.map((g) => g.code))): Guest {
  let code = guestCode();
  while (taken.has(code)) code = guestCode();
  return {
    id: id(),
    name: "",
    side: "",
    invited: 1,
    fns: guestFunctions(p).map((f) => f.id),
    ...partial,
    code,
  };
}

/** their invited functions that still exist on the proposal */
export function invitedTo(p: Proposal, g: Guest): string[] {
  const all = guestFunctions(p).map((f) => f.id);
  // invited before the proposal had functions ("" = the whole celebration): invited to all of them now
  if (g.fns.includes("") && !all.includes("")) return all;
  return g.fns.filter((f) => all.includes(f));
}

export const statusOf = (g: Guest, fnId: string): RsvpStatus | "pending" => g.reply?.[fnId]?.status ?? "pending";
/** people coming to a function from this household (0 unless they said yes) */
export const comingCount = (g: Guest, fnId: string) => (g.reply?.[fnId]?.status === "yes" ? g.reply[fnId].count : 0);

export interface FnSummary {
  fn: EventFunction;
  households: number;
  invited: number;
  yes: number;
  no: number;
  maybe: number;
  pending: number;
}

/** per function: households and people invited, people coming / not / maybe, and households yet to answer */
export function rsvpSummary(p: Proposal): FnSummary[] {
  const guests = listOf(p).guests;
  return guestFunctions(p).map((fn) => {
    const s: FnSummary = { fn, households: 0, invited: 0, yes: 0, no: 0, maybe: 0, pending: 0 };
    for (const g of guests) {
      if (!invitedTo(p, g).includes(fn.id)) continue;
      s.households++;
      s.invited += g.invited;
      const r = g.reply?.[fn.id];
      if (!r) s.pending++;
      else if (r.status === "yes") s.yes += r.count;
      else if (r.status === "maybe") s.maybe += r.count || g.invited;
      else s.no += g.invited;
    }
    return s;
  });
}

/** the largest confirmed headcount across the functions, for "Use confirmed headcount" */
export const confirmedHeadcount = (p: Proposal) => Math.max(0, ...rsvpSummary(p).map((s) => s.yes));

const SIDE_WORDS: Record<string, GuestSide> = { bride: "bride", "bride's": "bride", brides: "bride", groom: "groom", "groom's": "groom", grooms: "groom", both: "both" };

/**
 * Guests from pasted text or a CSV: one per line, columns name, phone, side, group, party size (any after the name may
 * be missing). A header row is skipped. Tabs (pasted from a spreadsheet) or commas separate the columns.
 */
export function importGuests(p: Proposal, text: string): Guest[] {
  const taken = new Set(listOf(p).guests.map((g) => g.code));
  const out: Guest[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = (line.includes("\t") ? line.split("\t") : splitCsv(line)).map((c) => c.trim());
    const [name, phone = "", side = "", group = "", party = ""] = cells;
    if (!name || /^(name|guest|guest name)$/i.test(name)) continue;
    const n = Number.parseInt(party, 10);
    const g = newGuest(p, {
      name: clip(name, 120),
      ...(phone && waNumber(phone) ? { phone: clip(phone, 20) } : {}),
      side: SIDE_WORDS[side.toLowerCase()] ?? "",
      ...(group ? { group: clip(group, 60) } : {}),
      invited: Number.isFinite(n) && n > 0 ? Math.min(n, PARTY_MAX) : 1,
    }, taken);
    taken.add(g.code);
    out.push(g);
    if (out.length + listOf(p).guests.length >= GUEST_LIMIT) break;
  }
  return out;
}

function splitCsv(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && quoted && line[i + 1] === '"') {
      cur += '"';
      i++;
    } else if (c === '"') quoted = !quoted;
    else if (c === "," && !quoted) {
      cells.push(cur);
      cur = "";
    } else cur += c;
  }
  cells.push(cur);
  return cells;
}

/** A reply cleaned against the invitation: known functions only, counts within the party, a listed meal, short text. */
export function cleanReply(x: unknown, fns: string[], invited: number, meals: string[]): WireReply | null {
  const r = x as Partial<WireReply> | null;
  if (!r || typeof r !== "object" || !r.replies || typeof r.replies !== "object") return null;
  const replies: WireReply["replies"] = {};
  for (const f of fns) {
    const a = (r.replies as Record<string, unknown>)[f] as { status?: unknown; count?: unknown } | undefined;
    if (!a || (a.status !== "yes" && a.status !== "no" && a.status !== "maybe")) continue;
    const count = a.status === "no" ? 0 : Math.max(1, Math.min(invited, Math.floor(Number(a.count) || 1)));
    replies[f] = { status: a.status, count };
  }
  if (!Object.keys(replies).length) return null;
  const meal = clip(r.meal, 60);
  return {
    replies,
    ...(meal && meals.includes(meal) ? { meal } : {}),
    ...(clip(r.dietary) ? { dietary: clip(r.dietary) } : {}),
    ...(clip(r.note, 500) ? { note: clip(r.note, 500) } : {}),
    ...(clip(r.name, 120) ? { name: clip(r.name, 120) } : {}),
    ...(clip(r.phone, 20) ? { phone: clip(r.phone, 20) } : {}),
    at: Number.isFinite(r.at) ? Number(r.at) : 0,
  };
}

/** Replies from the server written onto the guest list: newer replies win, open replies become new guests. */
export function mergeRsvp(p: Proposal, incoming: Record<string, WireReply> | undefined): Proposal | null {
  if (!incoming) return null;
  const list = listOf(p);
  const meals = list.rsvp?.meals ?? [];
  const fnIds = guestFunctions(p).map((f) => f.id);
  let changed = false;
  const byCode = new Map(list.guests.map((g) => [g.code, g]));
  const guests = list.guests.map((g) => {
    const raw = incoming[g.code];
    if (!raw) return g;
    const r = cleanReply(raw, invitedTo(p, g), g.invited, meals);
    if (!r) return g;
    const at = new Date(r.at).toISOString();
    if (g.repliedAt && g.repliedAt >= at) return g;
    changed = true;
    return { ...g, reply: r.replies, meal: r.meal, dietary: r.dietary, note: r.note ?? g.note, repliedAt: at };
  });
  for (const [key, raw] of Object.entries(incoming)) {
    if (!isOpenKey(key) || byCode.has(key)) continue;
    const r = cleanReply(raw, fnIds, PARTY_MAX, meals);
    if (!r?.name) continue;
    changed = true;
    guests.push({
      id: id(),
      name: r.name,
      ...(r.phone ? { phone: r.phone } : {}),
      side: "",
      invited: Math.max(1, ...Object.values(r.replies).map((x) => x.count)),
      fns: Object.keys(r.replies),
      code: key,
      reply: r.replies,
      ...(r.meal ? { meal: r.meal } : {}),
      ...(r.dietary ? { dietary: r.dietary } : {}),
      ...(r.note ? { note: r.note } : {}),
      repliedAt: new Date(r.at).toISOString(),
      source: "rsvp",
    });
  }
  return changed ? { ...p, guestList: { ...list, guests } } : null;
}

/** What the server keeps for the RSVP page: the invitation, and each household's name, party size and functions. */
export function inviteSnapshot(p: Proposal, brand: Pick<Brand, "company">, s: RsvpSettings): RsvpInvite {
  const fns = guestFunctions(p);
  return {
    title: p.client.name ? `${p.client.name}` : "Our wedding",
    host: brand.company,
    ...(s.message?.trim() ? { message: s.message.trim().slice(0, 1000) } : {}),
    ...(s.deadline ? { deadline: s.deadline } : {}),
    meals: s.meals.map((m) => m.trim()).filter(Boolean).slice(0, 8),
    open: s.open,
    ...(p.pageTheme ? { theme: p.pageTheme } : {}),
    fns: fns.map((f) => ({ id: f.id, label: f.label, date: f.date, venue: [p.client.venue, p.client.location].filter(Boolean).join(", ") })),
    // households that added themselves through the open link have no personal code, so no personal link
    guests: listOf(p)
      .guests.filter((g) => isCode(g.code) && g.name.trim())
      .map((g) => ({ code: g.code, name: g.name, invited: g.invited, fns: invitedTo(p, g) })),
  };
}

export const rsvpLink = (token: string, code?: string) => `${location.origin}${location.pathname}#/rsvp/${token}${code ? `/${code}` : ""}`;

export function inviteMessage(guest: Pick<Guest, "name">, coupleTitle: string, link: string, deadline?: string) {
  const by = deadline ? ` Please reply by ${new Date(`${deadline}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}.` : "";
  return `Dear ${guest.name.trim() || "there"}, you're warmly invited to celebrate with ${coupleTitle}. Please let us know if you can join us: ${link}${by}`;
}

/** a short fingerprint of an invitation, so the Guests tab can tell when the live link is out of date */
export function inviteKey(i: RsvpInvite): string {
  const s = JSON.stringify(i);
  let h = 5381;
  for (let n = 0; n < s.length; n++) h = ((h << 5) + h + s.charCodeAt(n)) | 0;
  return (h >>> 0).toString(36) + s.length.toString(36);
}
