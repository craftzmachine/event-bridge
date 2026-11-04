/** Small helpers for the Web Request/Response handlers. */

const BASE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}

export function bytes(body: Buffer, contentType: string) {
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: { ...BASE_HEADERS, "Content-Type": contentType, "Content-Disposition": "inline", "Cross-Origin-Resource-Policy": "same-origin" },
  });
}

export function cookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** HttpOnly, SameSite=Strict, and Secure except on plain-http localhost during development. */
export function setCookie(req: Request, name: string, value: string, path: string, maxAgeSeconds: number) {
  const url = new URL(req.url);
  const secure = !(url.protocol === "http:" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname));
  return [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `Max-Age=${maxAgeSeconds}`, "HttpOnly", "SameSite=Strict", secure && "Secure"]
    .filter(Boolean)
    .join("; ");
}

export const clearCookie = (req: Request, name: string, path: string) => setCookie(req, name, "", path, 0);

export function clientIp(req: Request) {
  return (req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
}

/** State-changing requests must come from this site's own pages (on top of SameSite=Strict cookies). */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  let ok = false;
  try {
    ok = !!origin && new URL(origin).host === host;
  } catch {
    ok = false;
  }
  if (!ok) throw new HttpError(403, "This request must come from the Event Bridge site.");
}

export function assertMethod(req: Request, ...methods: string[]) {
  if (!methods.includes(req.method)) throw new HttpError(405, "Method not allowed.");
}

export async function readJson<T>(req: Request): Promise<Partial<T>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
