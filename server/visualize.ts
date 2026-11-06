import type { Deps } from "./deps.js";
import { decrypt, encrypt, keyedHash, randomId, randomToken } from "./crypto.js";
import { DUMMY_HASH, hashPassword, normaliseEmail, verifyPassword } from "./passwords.js";
import { HttpError, assertMethod, assertSameOrigin, bytes, clientIp, json, readJson, sleep } from "./http.js";
import { endStaffSession, endViewSession, requireStaff, requireViewer, staffEmail, startStaffSession, startViewSession } from "./sessions.js";
import { validateUpload, type FileKind } from "./files.js";
import { packPage, packPdf, packXlsx, unpack } from "./bundle.js";
import { validatePage } from "./page.js";

/** an uploaded PDF or Excel file, or a proposal shared as a web page */
export type ShareKind = FileKind | "page";
import { renderPdf } from "./render/pdf.js";
import { renderXlsx } from "./render/xlsx.js";

export const EXPIRY_DAYS = [7, 30, 90] as const;
const UNLOCK_FAILS = 5;
const UNLOCK_LOCK = 15 * 60;
const IP_WINDOW = 3600;
const IP_ATTEMPTS = 30;
const STAFF_FAILS = 5;
const STAFF_LOCK = 15 * 60;
const UPLOADS_PER_HOUR = 30;

export interface ShareRecord {
  id: string;
  tokenHash: string;
  /** encrypted link token, so staff can copy the link again later */
  tokenEnc: string;
  client: string;
  title: string;
  kind: ShareKind;
  fileName: string;
  size: number;
  pages?: number;
  sheets?: number;
  passwordHash: string;
  createdAt: number;
  expiresAt: number;
  createdBy: string;
  views: number;
  lastViewedAt?: number;
  /** the Proposal Studio proposal it was shared from ("Share with client"); lets the Studio show the client's answer */
  proposalId?: string;
  /** the client's answer on the shared page; a later answer replaces an earlier one */
  decision?: Decision;
}

export interface Decision {
  kind: "approved" | "changes";
  /** plain text, at most COMMENT_MAX characters */
  comment?: string;
  at: number;
}

export const COMMENT_MAX = 1000;

const shareKey = (id: string) => `share:${id}`;
const tokenKey = (d: Deps, token: string) => `share:tok:${keyedHash(d.env.sessionSecret, token)}`;
const ALL = "shares:all";
const filePath = (id: string, part: "original" | "view") => `shares/${id}/${part}.bin`;
const isId = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{32}$/.test(s);
const isToken = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{43}$/.test(s);
const minutes = (s: number) => `${Math.max(1, Math.ceil(s / 60))} minute${s > 60 ? "s" : ""}`;

/** Counts every attempt from one network address, whatever account or link it targets. */
async function ipLimit(d: Deps, req: Request, scope: string) {
  const key = `rl:${scope}:${keyedHash(d.env.sessionSecret, clientIp(req))}`;
  const n = await d.kv.incr(key, IP_WINDOW);
  if (n > IP_ATTEMPTS) {
    const t = await d.kv.ttl(key);
    throw new HttpError(429, `Too many attempts from this network. Try again in ${minutes(t)}.`, { retryAfter: t });
  }
}

async function failGate(d: Deps, key: string, message: (t: number) => string) {
  const t = await d.kv.ttl(`${key}:lock`);
  if (t > 0) throw new HttpError(429, message(t), { retryAfter: t });
}

async function recordFail(d: Deps, key: string, max: number, lockSeconds: number) {
  const n = await d.kv.incr(key, lockSeconds);
  if (n >= max) {
    await d.kv.set(`${key}:lock`, 1, lockSeconds);
    await d.kv.del(key);
  }
}

// ---- staff ----------------------------------------------------------------------------

export async function staffLogin(req: Request, d: Deps) {
  assertMethod(req, "POST");
  assertSameOrigin(req);
  await ipLimit(d, req, "staff");
  const body = await readJson<{ email: string; password: string }>(req);
  const email = normaliseEmail(String(body.email ?? ""));
  const password = String(body.password ?? "");
  if (!email || !password) throw new HttpError(400, "Enter your email address and password.");

  const failKey = `fail:staff:${keyedHash(d.env.sessionSecret, email)}`;
  const lockMsg = (t: number) => `Too many unsuccessful attempts. Please wait ${minutes(t)} and try again.`;
  await failGate(d, failKey, lockMsg);

  const stored = d.env.staff[email];
  const ok = await verifyPassword(password, stored ?? DUMMY_HASH);
  if (!stored || !ok) {
    await recordFail(d, failKey, STAFF_FAILS, STAFF_LOCK);
    await sleep(d.failDelayMs);
    await failGate(d, failKey, lockMsg);
    throw new HttpError(401, "That email and password don't match an authorised account.");
  }
  await d.kv.del(failKey);
  return json(200, { email }, { "Set-Cookie": await startStaffSession(req, d, email) });
}

export async function staffMe(req: Request, d: Deps) {
  assertMethod(req, "GET");
  const email = await staffEmail(req, d);
  return email ? json(200, { email }) : json(401, { error: "Not signed in." });
}

export async function staffLogout(req: Request, d: Deps) {
  assertMethod(req, "POST");
  assertSameOrigin(req);
  return json(200, { ok: true }, { "Set-Cookie": await endStaffSession(req, d) });
}

// ---- shares (staff only) ----------------------------------------------------------------

function forStaff(d: Deps, r: ShareRecord) {
  const { tokenHash: _hash, tokenEnc, passwordHash: _pw, ...rest } = r;
  return { ...rest, token: decrypt(d.env.fileKey, Buffer.from(tokenEnc, "base64")).toString(), expired: r.expiresAt <= d.now() };
}

export async function shares(req: Request, d: Deps) {
  assertMethod(req, "GET", "POST", "DELETE");
  const email = await requireStaff(req, d);

  if (req.method === "GET") {
    const ids = await d.kv.zrevrange(ALL, 0, 199);
    const records = (await Promise.all(ids.map((id) => d.kv.get<ShareRecord>(shareKey(id))))).filter((r): r is ShareRecord => !!r);
    return json(200, { shares: records.map((r) => forStaff(d, r)) });
  }

  assertSameOrigin(req);

  if (req.method === "DELETE") {
    const id = new URL(req.url).searchParams.get("id");
    if (!isId(id)) throw new HttpError(400, "Unknown share.");
    const r = await d.kv.get<ShareRecord>(shareKey(id));
    if (r) {
      const token = decrypt(d.env.fileKey, Buffer.from(r.tokenEnc, "base64")).toString();
      await d.kv.del(shareKey(id), tokenKey(d, token));
      await d.files.del([filePath(id, "original"), filePath(id, "view")]);
      bundleCache.delete(id);
    }
    await d.kv.zrem(ALL, id);
    return json(200, { ok: true });
  }

  // POST: create a share
  const n = await d.kv.incr(`rl:upload:${keyedHash(d.env.sessionSecret, email)}`, 3600);
  if (n > UPLOADS_PER_HOUR) throw new HttpError(429, "Upload limit reached for this hour. Try again later.");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "The upload didn't arrive complete. Please try again.");
  }
  const file = form.get("file");
  // a web page share sends the proposal snapshot as a "page" field instead of a file
  const pageText = form.get("page");
  const isPage = !(file instanceof File) && typeof pageText === "string";
  const client = String(form.get("client") ?? "").trim().slice(0, 120);
  const password = String(form.get("password") ?? "");
  const days = Number(form.get("expiryDays"));
  if (!(file instanceof File) && !isPage) throw new HttpError(400, "Choose a PDF or Excel file to share.");
  if (!client) throw new HttpError(400, "Enter the client's name.");
  if (password.length < 8 || password.length > 128) throw new HttpError(400, "The password must be 8–128 characters.");
  if (!EXPIRY_DAYS.includes(days as (typeof EXPIRY_DAYS)[number])) throw new HttpError(400, "Choose how long the link stays active.");
  // an opaque id from the browser's proposal list; anything unexpected is simply not stored
  const proposalId = String(form.get("proposalId") ?? "");
  const linked = /^[A-Za-z0-9_-]{1,64}$/.test(proposalId) ? { proposalId } : {};

  let data: Buffer;
  let bundle: Buffer;
  let kind: ShareKind;
  let fileName: string;
  let counts: Pick<ShareRecord, "pages" | "sheets"> = {};
  if (isPage) {
    const check = validatePage(pageText as string);
    if ("error" in check) throw new HttpError(415, check.error);
    // the cleaned snapshot is both what's kept and what the client is shown
    data = Buffer.from(JSON.stringify(check.page));
    bundle = packPage(check.page);
    kind = "page";
    fileName = "Web page";
  } else {
    const f = file as File;
    data = Buffer.from(await f.arrayBuffer());
    const check = validateUpload(f.name, data);
    if ("error" in check) throw new HttpError(415, check.error);
    kind = check.kind;
    fileName = f.name.slice(0, 200);
    if (check.kind === "pdf") {
      const pdf = await renderPdf(data, `${client} · Confidential`);
      bundle = packPdf(pdf.pages);
      counts = { pages: pdf.pages.length };
    } else {
      const grid = await renderXlsx(data);
      bundle = packXlsx(grid);
      counts = { sheets: grid.sheets.length };
    }
  }
  const title = (String(form.get("title") ?? "").trim() || (isPage ? "Proposal" : fileName.replace(/\.[^.]+$/, ""))).slice(0, 160);

  const id = randomId();
  const token = randomToken();
  const now = d.now();
  const ttl = days * 86400;
  await d.files.put(filePath(id, "original"), encrypt(d.env.fileKey, data));
  await d.files.put(filePath(id, "view"), encrypt(d.env.fileKey, bundle));
  const record: ShareRecord = {
    id,
    tokenHash: keyedHash(d.env.sessionSecret, token),
    tokenEnc: encrypt(d.env.fileKey, Buffer.from(token)).toString("base64"),
    client,
    title,
    kind,
    fileName,
    size: data.length,
    ...counts,
    passwordHash: await hashPassword(password),
    createdAt: now,
    expiresAt: now + ttl * 1000,
    createdBy: email,
    views: 0,
    ...linked,
  };
  await d.kv.set(shareKey(id), record);
  await d.kv.set(tokenKey(d, token), id, ttl);
  await d.kv.zadd(ALL, now, id);
  return json(201, { share: forStaff(d, record) });
}

// ---- client viewing ------------------------------------------------------------------

const DENIED = "That password doesn't match this proposal link, or the link is no longer active.";

export async function unlock(req: Request, d: Deps) {
  assertMethod(req, "POST");
  assertSameOrigin(req);
  await ipLimit(d, req, "unlock");
  const body = await readJson<{ token: string; password: string }>(req);
  const password = String(body.password ?? "");
  if (!password) throw new HttpError(400, "Enter the password you were given.");

  const id = isToken(body.token) ? await d.kv.get<string>(tokenKey(d, body.token)) : null;
  const failKey = `fail:share:${id}`;
  const lockMsg = (t: number) => `Too many incorrect passwords. This link is locked for ${minutes(t)}.`;
  if (id) await failGate(d, failKey, lockMsg);

  const r = id ? await d.kv.get<ShareRecord>(shareKey(id)) : null;
  const ok = await verifyPassword(password, r?.passwordHash ?? DUMMY_HASH);
  // the same answer for an unknown link, a wrong password and an expired or revoked share
  if (!r || !ok || r.expiresAt <= d.now()) {
    if (id) await recordFail(d, failKey, UNLOCK_FAILS, UNLOCK_LOCK);
    await sleep(d.failDelayMs);
    if (id) await failGate(d, failKey, lockMsg);
    throw new HttpError(401, DENIED);
  }
  await d.kv.del(failKey);
  await d.kv.set(shareKey(r.id), { ...r, views: r.views + 1, lastViewedAt: d.now() });
  return json(200, { id: r.id }, { "Set-Cookie": await startViewSession(req, d, r.id) });
}

// decrypted bundles are reused while the same function instance stays warm
const bundleCache = new Map<string, Buffer>();

/** The share this viewer session may see right now: bound to that share, not expired, not revoked. */
async function liveShare(req: Request, d: Deps) {
  const id = new URL(req.url).searchParams.get("id");
  if (!isId(id)) throw new HttpError(404, "This proposal link isn't valid.");
  const session = await requireViewer(req, d, id);
  const r = await d.kv.get<ShareRecord>(shareKey(id));
  if (!r) throw new HttpError(410, "This proposal is no longer available.", { reason: "gone" });
  if (r.expiresAt <= d.now()) throw new HttpError(410, "This proposal link has expired. Ask your planner for a new one.", { reason: "expired" });
  return { id, r, session };
}

async function viewable(req: Request, d: Deps) {
  const { id, r, session } = await liveShare(req, d);
  let data = bundleCache.get(id);
  if (!data) {
    const enc = await d.files.get(filePath(id, "view"));
    if (!enc) throw new HttpError(410, "This proposal is no longer available.", { reason: "gone" });
    data = decrypt(d.env.fileKey, enc);
    bundleCache.set(id, data);
    if (bundleCache.size > 4) bundleCache.delete(bundleCache.keys().next().value as string);
  }
  return { r, session, bundle: unpack(data) };
}

export async function viewDoc(req: Request, d: Deps) {
  assertMethod(req, "GET");
  const { r, session, bundle } = await viewable(req, d);
  const h = bundle.header;
  return json(200, {
    client: r.client,
    title: r.title,
    kind: r.kind,
    expiresAt: r.expiresAt,
    sessionEndsAt: Math.min(session.endsAt, r.expiresAt),
    decision: r.decision ?? null,
    ...(h.kind === "pdf" ? { pages: h.pages.map(({ w, h: ht }) => ({ w, h: ht })) } : h.kind === "xlsx" ? { grid: h.grid } : { page: h.page }),
  });
}

export async function viewPage(req: Request, d: Deps) {
  assertMethod(req, "GET");
  const { bundle } = await viewable(req, d);
  const n = Number(new URL(req.url).searchParams.get("n"));
  const img = Number.isInteger(n) ? bundle.page(n) : null;
  if (!img) throw new HttpError(404, "That page doesn't exist.");
  return bytes(Buffer.from(img), "image/webp");
}

/** The client approves the proposal or asks for changes, from the shared page. Their planner sees it in the share list. */
export async function viewRespond(req: Request, d: Deps) {
  assertMethod(req, "POST");
  assertSameOrigin(req);
  await ipLimit(d, req, "respond");
  const { id, r } = await liveShare(req, d);
  const body = await readJson<{ kind: string; comment?: string }>(req);
  if (body.kind !== "approved" && body.kind !== "changes") throw new HttpError(400, "Choose whether to approve the proposal or ask for changes.");
  // plain text only: control characters (other than line breaks) are dropped, then it's trimmed and capped
  const comment = String(body.comment ?? "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim().slice(0, COMMENT_MAX);
  if (body.kind === "changes" && !comment) throw new HttpError(400, "Tell your planner what you'd like changed.");
  const decision: Decision = { kind: body.kind, at: d.now(), ...(comment ? { comment } : {}) };
  // re-read just before writing, so a view counted in between isn't lost
  const latest = (await d.kv.get<ShareRecord>(shareKey(id))) ?? r;
  await d.kv.set(shareKey(id), { ...latest, decision });
  return json(200, { decision });
}

export async function viewLock(req: Request, d: Deps) {
  assertMethod(req, "POST");
  assertSameOrigin(req);
  return json(200, { ok: true }, { "Set-Cookie": await endViewSession(req, d) });
}
