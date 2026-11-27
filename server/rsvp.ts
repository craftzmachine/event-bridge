// RSVP links: the couple's guests answer whether they're coming, per function.
// Staff create, refresh, read and turn off a link (api/staff/rsvp); guests read their invitation and reply through
// api/rsvp. A personal link (token + code) shows only that household; an open link takes a name and phone.
// The reply rules mirror cleanReply in src/lib/guestList.ts (server code can't import src/), so keep them in step.
import type { Deps } from "./deps.js";
import { decrypt, encrypt, keyedHash, randomId, randomToken } from "./crypto.js";
import { HttpError, assertMethod, assertSameOrigin, clientIp, json, readJson } from "./http.js";
import { requireStaff } from "./sessions.js";
import { PAGE_THEMES } from "./page.js";

export const RSVP_GUESTS_MAX = 2000;
export const RSVP_OPEN_MAX = 1000;
const PARTY_MAX = 20;
const FNS_MAX = 12;
const INVITE_MAX_BYTES = 400_000;
const IP_WINDOW = 3600;
const IP_READS = 120;
const IP_REPLIES = 40;
const LINK_DAYS = 400;

export interface RsvpRecord {
  id: string;
  tokenHash: string;
  tokenEnc: string;
  proposalId?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  /** the invitation, encrypted JSON (it holds guests' names) */
  inviteEnc: string;
}

interface Invite {
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

interface Reply {
  replies: Record<string, { status: "yes" | "no" | "maybe"; count: number }>;
  meal?: string;
  dietary?: string;
  note?: string;
  name?: string;
  phone?: string;
  at: number;
}

const recKey = (id: string) => `rsvp:${id}`;
const tokKey = (d: Deps, token: string) => `rsvp:tok:${keyedHash(d.env.sessionSecret, token)}`;
const replyKey = (id: string, who: string) => `rsvp:${id}:r:${who}`;
const whoSet = (id: string) => `rsvp:${id}:who`;
const openCount = (id: string) => `rsvp:${id}:open`;

const isId = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{32}$/.test(s);
const isToken = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{43}$/.test(s);
const isCode = (s: unknown): s is string => typeof s === "string" && /^[2-9A-HJKMNP-Z]{10}$/.test(s);
const isFnId = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{0,64}$/.test(s);
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const text = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n) : "");
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/** The same answer for a link that never existed, was turned off, or has a wrong code. */
const GONE = "This RSVP link isn't active. Please ask the family for the latest link.";

// ---- invitation checks --------------------------------------------------------------------

export function validateInvite(raw: unknown): { invite: Invite } | { error: string } {
  if (typeof raw === "string" && raw.length > INVITE_MAX_BYTES) return { error: "The guest list is too large to share." };
  let x: unknown = raw;
  if (typeof raw === "string") {
    try {
      x = JSON.parse(raw);
    } catch {
      return { error: "The invitation didn't arrive complete." };
    }
  }
  if (!isObj(x)) return { error: "The invitation didn't arrive complete." };
  const fns = Array.isArray(x.fns) ? x.fns.slice(0, FNS_MAX).filter(isObj) : [];
  const cleanFns = fns
    .filter((f) => isFnId(f.id))
    .map((f) => ({ id: f.id as string, label: text(f.label, 60) || "Celebration", date: isDate(f.date) ? f.date : "", venue: text(f.venue, 200) }));
  if (!cleanFns.length) return { error: "Add at least one function to invite guests to." };
  const fnIds = new Set(cleanFns.map((f) => f.id));
  const guests = Array.isArray(x.guests) ? x.guests : [];
  if (guests.length > RSVP_GUESTS_MAX) return { error: `An RSVP link can hold at most ${RSVP_GUESTS_MAX} households.` };
  const seen = new Set<string>();
  const cleanGuests: Invite["guests"] = [];
  for (const g of guests) {
    if (!isObj(g) || !isCode(g.code) || seen.has(g.code)) continue;
    const name = text(g.name, 120);
    if (!name) continue;
    seen.add(g.code);
    const invited = Math.max(1, Math.min(PARTY_MAX, Math.floor(Number(g.invited) || 1)));
    const gf = Array.isArray(g.fns) ? g.fns.filter((f): f is string => typeof f === "string" && fnIds.has(f)) : [];
    cleanGuests.push({ code: g.code, name, invited, fns: [...new Set(gf)] });
  }
  const meals = Array.isArray(x.meals) ? [...new Set(x.meals.map((m) => text(m, 60)).filter(Boolean))].slice(0, 8) : [];
  const theme = PAGE_THEMES.includes(x.theme as (typeof PAGE_THEMES)[number]) ? (x.theme as string) : undefined;
  return {
    invite: {
      title: text(x.title, 160) || "Our wedding",
      host: text(x.host, 120),
      ...(text(x.message, 1000) ? { message: text(x.message, 1000) } : {}),
      ...(isDate(x.deadline) ? { deadline: x.deadline } : {}),
      meals,
      open: x.open === true,
      ...(theme ? { theme } : {}),
      fns: cleanFns,
      guests: cleanGuests,
    },
  };
}

/** A guest's reply checked against what they were invited to. */
export function cleanReply(x: unknown, fns: string[], invited: number, meals: string[], at: number): Reply | null {
  if (!isObj(x) || !isObj(x.replies)) return null;
  const replies: Reply["replies"] = {};
  for (const f of fns) {
    const a = x.replies[f];
    if (!isObj(a) || (a.status !== "yes" && a.status !== "no" && a.status !== "maybe")) continue;
    replies[f] = { status: a.status, count: a.status === "no" ? 0 : Math.max(1, Math.min(invited, Math.floor(Number(a.count) || 1))) };
  }
  if (!Object.keys(replies).length) return null;
  const meal = text(x.meal, 60);
  const r: Reply = { replies, at };
  if (meal && meals.includes(meal)) r.meal = meal;
  if (text(x.dietary, 300)) r.dietary = text(x.dietary, 300);
  if (text(x.note, 500)) r.note = text(x.note, 500);
  return r;
}

// ---- storage helpers ------------------------------------------------------------------------

const readInvite = (d: Deps, r: RsvpRecord): Invite => JSON.parse(decrypt(d.env.fileKey, Buffer.from(r.inviteEnc, "base64")).toString()) as Invite;
const sealInvite = (d: Deps, i: Invite) => encrypt(d.env.fileKey, Buffer.from(JSON.stringify(i))).toString("base64");
const sealReply = (d: Deps, r: Reply) => encrypt(d.env.fileKey, Buffer.from(JSON.stringify(r))).toString("base64");
const openReply = (d: Deps, s: string | null): Reply | null => {
  if (!s) return null;
  try {
    return JSON.parse(decrypt(d.env.fileKey, Buffer.from(s, "base64")).toString()) as Reply;
  } catch {
    return null;
  }
};

async function limit(d: Deps, req: Request, scope: string, max: number) {
  const key = `rl:${scope}:${keyedHash(d.env.sessionSecret, clientIp(req))}`;
  const n = await d.kv.incr(key, IP_WINDOW);
  if (n > max) {
    const t = await d.kv.ttl(key);
    throw new HttpError(429, "Too many tries from this network. Please try again in a little while.", { retryAfter: t });
  }
}

async function allReplies(d: Deps, id: string): Promise<Record<string, Reply>> {
  const who = await d.kv.zrevrange(whoSet(id), 0, RSVP_GUESTS_MAX + RSVP_OPEN_MAX);
  const out: Record<string, Reply> = {};
  await Promise.all(
    who.map(async (w) => {
      const r = openReply(d, await d.kv.get<string>(replyKey(id, w)));
      if (r) out[w] = r;
    }),
  );
  return out;
}

function forStaff(d: Deps, r: RsvpRecord) {
  return { id: r.id, token: decrypt(d.env.fileKey, Buffer.from(r.tokenEnc, "base64")).toString(), proposalId: r.proposalId, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

// ---- staff: api/staff/rsvp ------------------------------------------------------------------

export async function rsvpLinks(req: Request, d: Deps) {
  assertMethod(req, "GET", "POST", "PUT", "DELETE");
  const email = await requireStaff(req, d);
  const url = new URL(req.url);

  if (req.method === "GET") {
    const id = url.searchParams.get("id");
    const r = isId(id) ? await d.kv.get<RsvpRecord>(recKey(id)) : null;
    if (!r) throw new HttpError(404, "That RSVP link no longer exists. Create a new one.");
    return json(200, { rsvp: forStaff(d, r), replies: await allReplies(d, r.id) });
  }

  assertSameOrigin(req);

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!isId(id)) throw new HttpError(400, "Unknown RSVP link.");
    const r = await d.kv.get<RsvpRecord>(recKey(id));
    if (r) {
      const token = decrypt(d.env.fileKey, Buffer.from(r.tokenEnc, "base64")).toString();
      // replies are kept until the link record goes, so a planner who turns it off by mistake hasn't lost them in Studio
      await d.kv.del(recKey(id), tokKey(d, token));
    }
    return json(200, { ok: true });
  }

  const body = await readJson<{ invite: unknown; proposalId: string }>(req);
  const check = validateInvite(body.invite);
  if ("error" in check) throw new HttpError(415, check.error);
  const now = d.now();

  if (req.method === "PUT") {
    const id = url.searchParams.get("id");
    const r = isId(id) ? await d.kv.get<RsvpRecord>(recKey(id)) : null;
    if (!r) throw new HttpError(404, "That RSVP link no longer exists. Create a new one.");
    const next: RsvpRecord = { ...r, inviteEnc: sealInvite(d, check.invite), updatedAt: now };
    await d.kv.set(recKey(r.id), next, LINK_DAYS * 86400);
    return json(200, { rsvp: forStaff(d, next) });
  }

  const n = await d.kv.incr(`rl:rsvp-create:${keyedHash(d.env.sessionSecret, email)}`, 3600);
  if (n > 30) throw new HttpError(429, "Too many RSVP links made this hour. Try again later.");
  const id = randomId();
  const token = randomToken();
  const proposalId = typeof body.proposalId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(body.proposalId) ? { proposalId: body.proposalId } : {};
  const record: RsvpRecord = {
    id,
    tokenHash: keyedHash(d.env.sessionSecret, token),
    tokenEnc: encrypt(d.env.fileKey, Buffer.from(token)).toString("base64"),
    ...proposalId,
    createdBy: email,
    createdAt: now,
    updatedAt: now,
    inviteEnc: sealInvite(d, check.invite),
  };
  await d.kv.set(recKey(id), record, LINK_DAYS * 86400);
  await d.kv.set(tokKey(d, token), id, LINK_DAYS * 86400);
  return json(201, { rsvp: forStaff(d, record) });
}

// ---- guests: api/rsvp -----------------------------------------------------------------------

/**
 * POST { token, code? } → the invitation (without the guest list) and, for a personal link, that household with its
 * last reply. POST { token, code?, reply } → saves the reply. An open link (no code) needs reply.name and reply.phone.
 */
export async function rsvpRespond(req: Request, d: Deps) {
  assertMethod(req, "POST");
  assertSameOrigin(req);
  const body = await readJson<{ token: string; code: string; reply: unknown; website: string }>(req);
  const saving = body.reply !== undefined;
  await limit(d, req, saving ? "rsvp-reply" : "rsvp-read", saving ? IP_REPLIES : IP_READS);
  if (!isToken(body.token)) throw new HttpError(404, GONE);
  const id = await d.kv.get<string>(tokKey(d, body.token));
  const r = id ? await d.kv.get<RsvpRecord>(recKey(id)) : null;
  if (!r) throw new HttpError(404, GONE);
  const invite = readInvite(d, r);
  const code = body.code === undefined || body.code === "" ? null : body.code;
  const guest = code === null ? null : isCode(code) ? invite.guests.find((g) => g.code === code) ?? null : null;
  if (code !== null && !guest) throw new HttpError(404, GONE);
  if (code === null && !invite.open) throw new HttpError(404, "This invitation is personal. Please use the link sent to you.");

  const { guests: _all, ...publicInvite } = invite;
  const closed = !!invite.deadline && new Date(`${invite.deadline}T23:59:59+05:30`).getTime() < d.now();

  if (!saving) {
    const last = guest ? openReply(d, await d.kv.get<string>(replyKey(r.id, guest.code))) : null;
    return json(200, {
      invite: { ...publicInvite, closed },
      ...(guest ? { guest: { name: guest.name, invited: guest.invited, fns: guest.fns, ...(last ? { reply: last } : {}) } } : {}),
    });
  }

  // a bot filling every field; people never see this one
  if (typeof body.website === "string" && body.website.trim()) return json(200, { ok: true });
  if (closed) throw new HttpError(409, "Replies for this invitation have closed. Please contact the family directly.");

  const fns = guest ? guest.fns : invite.fns.map((f) => f.id);
  const reply = cleanReply(body.reply, fns, guest ? guest.invited : PARTY_MAX, invite.meals, d.now());
  if (!reply) throw new HttpError(400, "Choose whether you're coming to at least one function.");

  let who: string;
  if (guest) who = guest.code;
  else {
    const raw = body.reply as Record<string, unknown>;
    const name = text(raw.name, 120);
    const phone = text(raw.phone, 20);
    if (!name) throw new HttpError(400, "Please enter your name.");
    if (!/^[+\d][\d\s-]{7,19}$/.test(phone)) throw new HttpError(400, "Please enter a phone number we can reach you on.");
    const n = await d.kv.incr(openCount(r.id), LINK_DAYS * 86400);
    if (n > RSVP_OPEN_MAX) throw new HttpError(429, "This invitation has reached its reply limit. Please contact the family directly.");
    reply.name = name;
    reply.phone = phone;
    // one open reply per phone number on this link, so answering again replaces the earlier answer
    who = `open-${keyedHash(d.env.sessionSecret, `${r.id}:${phone.replace(/\D/g, "")}`).slice(0, 16)}`;
  }
  await d.kv.set(replyKey(r.id, who), sealReply(d, reply), LINK_DAYS * 86400);
  await d.kv.zadd(whoSet(r.id), reply.at, who);
  return json(200, { ok: true, reply });
}
