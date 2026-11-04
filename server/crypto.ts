import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** URL-safe random token; 32 bytes = 256 bits, so links can't be guessed or enumerated. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const randomId = () => randomBytes(16).toString("hex");

/** Keyed hash used to store tokens and session ids, so a database leak reveals no usable secret. */
export const keyedHash = (secret: string, value: string) => createHmac("sha256", secret).update(value).digest("hex");

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** AES-256-GCM: [12-byte IV][16-byte auth tag][ciphertext]. Tampering makes decrypt throw. */
export function encrypt(key: Buffer, plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]);
}

export function decrypt(key: Buffer, data: Buffer): Buffer {
  const d = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
  d.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([d.update(data.subarray(28)), d.final()]);
}
