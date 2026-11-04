/** Client for the Visualize Proposal API (api/ on Vercel, or the dev bridge in vite.config.ts). */

export class ApiError extends Error {
  constructor(
    message: string,
    /** 0 = the API isn't reachable here (offline, or a host without the functions) */
    public status: number,
    public retryAfter?: number,
    public reason?: string,
  ) {
    super(message);
  }
}

const UNAVAILABLE = "The sharing service can't be reached right now. Check your connection and try again.";

async function parse<T>(res: Response): Promise<T> {
  // a static host without the API answers /api/* with the app's index.html
  if (!(res.headers.get("content-type") ?? "").includes("application/json")) throw new ApiError(UNAVAILABLE, 0);
  const body = await res.json();
  if (!res.ok) throw new ApiError(body.error ?? "Something went wrong.", res.status, body.retryAfter, body.reason);
  return body as T;
}

// a server that never answers shows as "can't reach the sharing service" instead of a page waiting forever
const TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 120_000;

export async function api<T>(path: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`./api/${path}`, {
      method: init.method ?? (init.json ? "POST" : "GET"),
      credentials: "same-origin",
      cache: "no-store",
      headers: init.json ? { "Content-Type": "application/json" } : undefined,
      body: init.json ? JSON.stringify(init.json) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ApiError(UNAVAILABLE, 0);
  }
  return parse<T>(res);
}

/** Multipart upload with progress (fetch can't report upload progress). */
export function upload<T>(path: string, form: FormData, onProgress: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `./api/${path}`);
    xhr.withCredentials = true;
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onerror = () => reject(new ApiError(UNAVAILABLE, 0));
    xhr.ontimeout = () => reject(new ApiError(UNAVAILABLE, 0));
    xhr.onload = () => {
      const res = new Response(xhr.response, { status: xhr.status, headers: { "content-type": xhr.getResponseHeader("content-type") ?? "" } });
      parse<T>(res).then(resolve, reject);
    };
    xhr.send(form);
  });
}

/** Fetches one rendered page as an image bitmap, to draw on a canvas rather than place as a saveable <img>. */
export async function pageBitmap(id: string, n: number) {
  let res: Response;
  try {
    res = await fetch(`./api/view/page?id=${id}&n=${n}`, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new ApiError(UNAVAILABLE, 0);
  }
  if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) await parse(res);
  return createImageBitmap(await res.blob());
}

export const formatRetry = (s?: number) => (s ? `${Math.max(1, Math.ceil(s / 60))} min` : "a few minutes");
