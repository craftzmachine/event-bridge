/**
 * Storage behind two small interfaces, so the handlers run against Upstash Redis + a private Vercel Blob
 * store in production and against in-memory maps in tests and local dev.
 */
export interface Kv {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  /** Increments and, on the first hit, starts the key's expiry. */
  incr(key: string, ttlSeconds: number): Promise<number>;
  /** Seconds left before the key expires; 0 when missing or permanent. */
  ttl(key: string): Promise<number>;
  zadd(key: string, score: number, member: string): Promise<void>;
  zrem(key: string, member: string): Promise<void>;
  /** Members, highest score first. */
  zrevrange(key: string, start: number, stop: number): Promise<string[]>;
}

export interface FileStore {
  put(path: string, data: Buffer): Promise<void>;
  get(path: string): Promise<Buffer | null>;
  del(paths: string[]): Promise<void>;
}

export function memoryKv(now = () => Date.now()): Kv {
  const data = new Map<string, { v: unknown; exp: number }>();
  const live = (k: string) => {
    const e = data.get(k);
    if (e && e.exp && e.exp <= now()) data.delete(k);
    return data.get(k);
  };
  const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  return {
    async get<T>(k: string) {
      const e = live(k);
      return e ? clone(e.v as T) : null;
    },
    async set(k, v, ttl) {
      data.set(k, { v: clone(v), exp: ttl ? now() + ttl * 1000 : 0 });
    },
    async del(...keys) {
      keys.forEach((k) => data.delete(k));
    },
    async incr(k, ttl) {
      const e = live(k);
      const n = (typeof e?.v === "number" ? e.v : 0) + 1;
      data.set(k, { v: n, exp: e?.exp || now() + ttl * 1000 });
      return n;
    },
    async ttl(k) {
      const e = live(k);
      return e?.exp ? Math.ceil((e.exp - now()) / 1000) : 0;
    },
    async zadd(k, score, member) {
      const set = (live(k)?.v as Record<string, number>) ?? {};
      set[member] = score;
      data.set(k, { v: set, exp: 0 });
    },
    async zrem(k, member) {
      const set = live(k)?.v as Record<string, number> | undefined;
      if (set) delete set[member];
    },
    async zrevrange(k, start, stop) {
      const set = (live(k)?.v as Record<string, number>) ?? {};
      return Object.entries(set).sort((a, b) => b[1] - a[1]).map(([m]) => m).slice(start, stop + 1);
    },
  };
}

export function memoryFiles(): FileStore {
  const files = new Map<string, Buffer>();
  return {
    async put(p, d) {
      files.set(p, Buffer.from(d));
    },
    async get(p) {
      return files.get(p) ?? null;
    },
    async del(paths) {
      paths.forEach((p) => files.delete(p));
    },
  };
}

/**
 * Finds the Upstash REST credentials whatever the Vercel integration named them: UPSTASH_REDIS_REST_*,
 * KV_REST_API_*, or either with the custom prefix chosen when connecting (VISUALIZE_REDIS_PREFIX, e.g. "VIZ").
 * A prefix avoids the "REDIS_URL already exists" clash when the project already has a Redis variable.
 */
export function redisCredentials(env: Record<string, string | undefined> = process.env) {
  const p = env.VISUALIZE_REDIS_PREFIX ? `${env.VISUALIZE_REDIS_PREFIX.replace(/_$/, "")}_` : "";
  const pick = (...names: string[]) => names.map((n) => env[n]).find(Boolean);
  const url = pick(`${p}UPSTASH_REDIS_REST_URL`, `${p}KV_REST_API_URL`, "UPSTASH_REDIS_REST_URL", "KV_REST_API_URL");
  const token = pick(`${p}UPSTASH_REDIS_REST_TOKEN`, `${p}KV_REST_API_TOKEN`, "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN");
  return url && token ? { url, token } : null;
}

export async function redisKv(env = process.env): Promise<Kv | null> {
  const creds = redisCredentials(env);
  if (!creds) return null;
  const { Redis } = await import("@upstash/redis");
  const r = new Redis(creds);
  return {
    get: (k) => r.get(k),
    async set(k, v, ttl) {
      if (ttl) await r.set(k, v, { ex: ttl });
      else await r.set(k, v);
    },
    async del(...keys) {
      if (keys.length) await r.del(...keys);
    },
    async incr(k, ttl) {
      const n = await r.incr(k);
      if (n === 1) await r.expire(k, ttl);
      return n;
    },
    async ttl(k) {
      return Math.max(0, await r.ttl(k));
    },
    async zadd(k, score, member) {
      await r.zadd(k, { score, member });
    },
    async zrem(k, member) {
      await r.zrem(k, member);
    },
    zrevrange: (k, start, stop) => r.zrange<string[]>(k, start, stop, { rev: true }),
  };
}

/** Private Vercel Blob store: every read and write needs the server's token (or Vercel's OIDC token). */
export async function blobFiles(env = process.env): Promise<FileStore | null> {
  if (!env.BLOB_READ_WRITE_TOKEN && !env.BLOB_STORE_ID) return null;
  const blob = await import("@vercel/blob");
  return {
    async put(p, d) {
      await blob.put(p, d, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/octet-stream" });
    },
    async get(p) {
      const res = await blob.get(p, { access: "private" });
      if (!res || res.statusCode !== 200) return null;
      return Buffer.from(await new Response(res.stream).arrayBuffer());
    },
    async del(paths) {
      if (paths.length) await blob.del(paths);
    },
  };
}
