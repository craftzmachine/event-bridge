import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

const scrypt = (pw: string, salt: Buffer, len: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(pw, salt, len, opts, (e, k) => (e ? reject(e) : resolve(k))));

const N = 16384;
const R = 8;
const P = 1;
const LEN = 32;
const MAXMEM = 64 * 1024 * 1024;

/** Same clean-up as the studio sign-in (src/auth/auth.ts), so phone keyboards behave the same on the server. */
const clean = (s: string) => s.normalize("NFKC").replace(/[​-‍⁠﻿]/g, "").trim();
export const normaliseEmail = (email: string) => clean(email).toLowerCase();
export const normalisePassword = clean;

/** Format: scrypt:N:r:p:<salt b64>:<hash b64> — no "$", which .env loaders and shells expand. */
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(normalisePassword(password), salt, LEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt:${N}:${R}:${P}:${salt.toString("base64")}:${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, n, r, p, salt, hash] = stored.split(":");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await scrypt(normalisePassword(password), Buffer.from(salt, "base64"), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM,
  });
  return timingSafeEqual(key, expected);
}

/** Verified against when an account or link doesn't exist, so misses take as long as wrong passwords. */
export const DUMMY_HASH = "scrypt:16384:8:1:AAAAAAAAAAAAAAAAAAAAAA==:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
