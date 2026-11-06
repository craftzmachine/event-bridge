import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";

// the same security headers Vercel sends, so `vite preview` behaves like production
const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { headers: { headers: { key: string; value: string }[] }[] };
const siteHeaders = Object.fromEntries(vercel.headers[0].headers.map((h) => [h.key, h.value]));

/**
 * Runs the Vercel functions in api/ inside the Vite dev server, so Visualize Proposal works with `npm run dev`.
 * With VISUALIZE_STORE=memory in .env.local, files and sessions live in memory.
 */
function devApi(): Plugin {
  async function handle(server: ViteDevServer, req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (!/^\/api\/[a-z/]+$/.test(url.pathname)) return false;
    // same shape Vercel requires: `export default { fetch }`
    let mod: { default?: { fetch?: (r: Request) => Promise<Response> } };
    try {
      mod = await server.ssrLoadModule(`${url.pathname}.ts`);
    } catch {
      return false;
    }
    const fetchHandler = mod.default?.fetch;
    if (!fetchHandler) return false;
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const body = chunks.length && req.method !== "GET" && req.method !== "HEAD" ? Buffer.concat(chunks) : undefined;
    const out = await fetchHandler(new Request(url, { method: req.method, headers, body }));
    const setCookies = out.headers.getSetCookie();
    out.headers.forEach((v, k) => k !== "set-cookie" && res.setHeader(k, v));
    if (setCookies.length) res.setHeader("set-cookie", setCookies);
    res.statusCode = out.status;
    res.end(Buffer.from(await out.arrayBuffer()));
    return true;
  }
  return {
    name: "dev-api",
    apply: "serve",
    configureServer(server) {
      Object.assign(process.env, { ...loadEnv(server.config.mode, process.cwd(), ""), ...process.env });
      server.middlewares.use((req, res, next) => {
        handle(server, req, res).then((done) => !done && next(), next);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi()],
  base: "./",
  server: { port: 5173 },
  preview: { headers: siteHeaders },
  // ExcelJS and pdfmake (+ its fonts) are loaded on demand when exporting, so their large chunks never block start-up
  build: { chunkSizeWarningLimit: 1400 },
  test: { environment: "node", testTimeout: 20000 },
} as never);
