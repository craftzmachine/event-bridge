import { HttpError, json } from "./http.js";
import { blobFiles, memoryFiles, memoryKv, redisKv, type FileStore, type Kv } from "./store.js";

export interface Env {
  /** HMAC key for stored token and session hashes. */
  sessionSecret: string;
  /** 32-byte AES-256-GCM key for stored files. */
  fileKey: Buffer;
  /** Lowercased email → scrypt hash (see scripts/visualize-setup.mjs). */
  staff: Record<string, string>;
}

export interface Deps {
  kv: Kv;
  files: FileStore;
  env: Env;
  now: () => number;
  /** Delay added to failed sign-ins and unlocks; 0 in tests. */
  failDelayMs: number;
}

export function readEnv(e: Record<string, string | undefined> = process.env): Env | null {
  const sessionSecret = e.SESSION_SECRET ?? "";
  const fileKey = Buffer.from(e.FILE_ENCRYPTION_KEY ?? "", "base64");
  let staff: Record<string, string> = {};
  try {
    staff = JSON.parse(e.STAFF_ACCOUNTS ?? "{}");
  } catch {
    return null;
  }
  if (sessionSecret.length < 32 || fileKey.length !== 32 || !Object.keys(staff).length) return null;
  return { sessionSecret, fileKey, staff: Object.fromEntries(Object.entries(staff).map(([k, v]) => [k.toLowerCase(), v])) };
}

// in local dev (VISUALIZE_STORE=memory) the store lives as long as the dev server process
let memory: { kv: Kv; files: FileStore } | null = null;

async function loadDeps(): Promise<Deps | null> {
  const env = readEnv();
  if (!env) return null;
  if (process.env.VISUALIZE_STORE === "memory") {
    memory ??= { kv: memoryKv(), files: memoryFiles() };
    return { ...memory, env, now: Date.now, failDelayMs: 400 };
  }
  const [kv, files] = await Promise.all([redisKv(), blobFiles()]);
  return kv && files ? { kv, files, env, now: Date.now, failDelayMs: 400 } : null;
}

export type Handler = (req: Request, d: Deps) => Promise<Response>;

/** Wraps a handler for an api/ route: 503 until storage and secrets are configured, readable errors, no stack traces. */
export const route = (h: Handler) => async (req: Request) => run(h, req, await loadDeps());

export async function run(h: Handler, req: Request, d: Deps | null) {
  if (!d) return json(503, { error: "Visualize Proposal isn't set up on this site yet. Ask the Event Bridge admin to connect its storage." });
  try {
    return await h(req, d);
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message, ...e.extra });
    console.error("visualize:", e);
    return json(500, { error: "Something went wrong on the server. Please try again." });
  }
}
