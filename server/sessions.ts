import type { Deps } from "./deps.js";
import { keyedHash, randomToken } from "./crypto.js";
import { HttpError, clearCookie, cookies, setCookie } from "./http.js";

const STAFF_COOKIE = "pb_staff";
const STAFF_PATH = "/api";
const STAFF_TTL = 12 * 3600;

const VIEW_COOKIE = "pb_view";
const VIEW_PATH = "/api/view";
export const VIEW_IDLE = 30 * 60;
export const VIEW_MAX = 2 * 3600;

interface StaffSession { email: string }
export interface ViewSession { shareId: string; startedAt: number }

const staffKey = (d: Deps, id: string) => `staff:s:${keyedHash(d.env.sessionSecret, id)}`;
const viewKey = (d: Deps, id: string) => `view:s:${keyedHash(d.env.sessionSecret, id)}`;

export async function startStaffSession(req: Request, d: Deps, email: string) {
  const id = randomToken();
  await d.kv.set(staffKey(d, id), { email } satisfies StaffSession, STAFF_TTL);
  return setCookie(req, STAFF_COOKIE, id, STAFF_PATH, STAFF_TTL);
}

export async function staffEmail(req: Request, d: Deps) {
  const id = cookies(req)[STAFF_COOKIE];
  if (!id) return null;
  const s = await d.kv.get<StaffSession>(staffKey(d, id));
  // the account may have been removed from STAFF_ACCOUNTS since sign-in
  return s && d.env.staff[s.email] ? s.email : null;
}

export async function requireStaff(req: Request, d: Deps) {
  const email = await staffEmail(req, d);
  if (!email) throw new HttpError(401, "Please sign in again to use Visualize Proposal.");
  return email;
}

export async function endStaffSession(req: Request, d: Deps) {
  const id = cookies(req)[STAFF_COOKIE];
  if (id) await d.kv.del(staffKey(d, id));
  return clearCookie(req, STAFF_COOKIE, STAFF_PATH);
}

export async function startViewSession(req: Request, d: Deps, shareId: string) {
  const id = randomToken();
  await d.kv.set(viewKey(d, id), { shareId, startedAt: d.now() } satisfies ViewSession, VIEW_IDLE);
  return setCookie(req, VIEW_COOKIE, id, VIEW_PATH, VIEW_MAX);
}

/**
 * The viewer session must exist, belong to the requested share, be under 2 hours old and have been used in the
 * last 30 minutes. Each successful check extends the idle window.
 */
export async function requireViewer(req: Request, d: Deps, shareId: string) {
  const id = cookies(req)[VIEW_COOKIE];
  const denied = new HttpError(401, "Your viewing session has ended. Enter the password again to continue.", { reason: "session" });
  if (!id) throw denied;
  const key = viewKey(d, id);
  const s = await d.kv.get<ViewSession>(key);
  if (!s || s.shareId !== shareId) throw denied;
  const left = VIEW_MAX - Math.floor((d.now() - s.startedAt) / 1000);
  if (left <= 0) {
    await d.kv.del(key);
    throw denied;
  }
  await d.kv.set(key, s, Math.min(VIEW_IDLE, left));
  return { ...s, endsAt: s.startedAt + VIEW_MAX * 1000 };
}

export async function endViewSession(req: Request, d: Deps) {
  const id = cookies(req)[VIEW_COOKIE];
  if (id) await d.kv.del(viewKey(d, id));
  return clearCookie(req, VIEW_COOKIE, VIEW_PATH);
}
