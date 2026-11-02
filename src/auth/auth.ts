import { sha256 } from "./sha256";

/*
 * The only accounts allowed in. Passwords are never stored — just
 * sha256("parinay-proposals:<email>:<password>"). To add or change an account,
 * compute that value (see README) and edit this list.
 *
 * This is a browser-side gate for a static site: it keeps casual visitors out
 * but is not a substitute for server or hosting-level authentication.
 */
const ACCOUNTS: { email: string; hash: string }[] = [
  { email: "planner.parinayweddings@gmail.com", hash: "c74e6272d9b089e669f0ca950ff1bb10692279e50c020a0866a197dea19fa4c4" },
  { email: "info.parinayweddings@gmail.com", hash: "fb7e9584209508a538b7f66320030555fa788ae2e974a89debe08b5849ccc711" },
  { email: "operations.eventsiq@gmail.com", hash: "f0ae1150e33e88bff0a7acee2b7d691c21f9bcbc9eedb87cf92f1b265a380a52" },
];

const SESSION_KEY = "proposal-builder.session.v1";
const SESSION_HOURS = 12;

// Phone keyboards and autofill can add trailing spaces, zero-width characters or
// full-width look-alikes (＠, ９), so both fields are normalised before hashing.
const clean = (s: string) => s.normalize("NFKC").replace(/[​-‍⁠﻿]/g, "").trim();

export const normaliseEmail = (email: string) => clean(email).toLowerCase();
export const normalisePassword = (password: string) => clean(password);

export function credentialHash(email: string, password: string) {
  return sha256(`parinay-proposals:${normaliseEmail(email)}:${normalisePassword(password)}`);
}

/** Returns the account email when the pair matches an authorised account, otherwise null. */
export function checkCredentials(email: string, password: string): string | null {
  const e = normaliseEmail(email);
  const account = ACCOUNTS.find((a) => a.email === e);
  if (!account || !normalisePassword(password)) return null;
  return credentialHash(e, password) === account.hash ? account.email : null;
}

export interface Session {
  email: string;
  expires: number;
}

export function readSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null") as Session | null;
    if (!s || typeof s.email !== "string" || s.expires < Date.now()) return null;
    // an account removed from the list loses access on its next visit
    return ACCOUNTS.some((a) => a.email === s.email) ? s : null;
  } catch {
    return null;
  }
}

export function startSession(email: string): Session {
  const s = { email, expires: Date.now() + SESSION_HOURS * 3600_000 };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* blocked storage: signed in for this page load only */
  }
  return s;
}

export function endSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing to clear */
  }
}
