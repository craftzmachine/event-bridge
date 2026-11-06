import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Brand, Catalog } from "../src/types";
import { buildPdfDoc } from "../src/lib/exportPdf";
import { buildWorkbook } from "../src/lib/exportXlsx";
import { lineFromElement, newProposal } from "../src/state/proposals";
import { pageSnapshot } from "../src/lib/proposalPage";
import { decrypt, encrypt } from "./crypto";
import { hashPassword, verifyPassword } from "./passwords";
import { memoryFiles, memoryKv, redisCredentials } from "./store";
import { run, type Deps, type Handler } from "./deps";
import { validateUpload } from "./files";
import { renderXlsx } from "./render/xlsx";
import { shares, staffLogin, staffMe, unlock, viewDoc, viewLock, viewPage, viewRespond } from "./visualize";

const require = createRequire(import.meta.url);
const catalog: Catalog = JSON.parse(readFileSync("public/config/catalog.json", "utf8"));
const brand: Brand = JSON.parse(readFileSync("public/config/brand.json", "utf8"));

// test-only account; real accounts live in the STAFF_ACCOUNTS environment variable
const STAFF = "staff@studio.test";
const STAFF_PW = "test-only-Passw0rd";
const SITE = "https://studio.test";

function proposal() {
  const p = newProposal(brand, []);
  p.client = { name: "Ms. Priya Nair", contact: "", date: "2027-02-14", venue: "Taj Green Cove", location: "Kovalam" };
  p.eventType = "wedding";
  p.style = "hindu";
  p.lines = ["mandap", "sound-basic", "lighting"].map((id) => lineFromElement(catalog.elements.find((e) => e.id === id)!));
  return p;
}

async function samplePdf() {
  const vfs: Record<string, string> = require("pdfmake/build/vfs_fonts");
  const buf = (n: string) => Buffer.from(vfs[n], "base64");
  const PdfPrinter = require("pdfmake");
  const printer = new PdfPrinter({ Roboto: { normal: buf("Roboto-Regular.ttf"), bold: buf("Roboto-Medium.ttf"), italics: buf("Roboto-Italic.ttf"), bolditalics: buf("Roboto-MediumItalic.ttf") } });
  const doc = printer.createPdfKitDocument(buildPdfDoc(proposal(), catalog, brand));
  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.end();
  });
}

const sampleXlsx = async () => Buffer.from(await buildWorkbook(proposal(), catalog, brand).xlsx.writeBuffer());

let clock = Date.parse("2026-11-04T10:00:00Z");
let d: Deps;
let pdf: Buffer;
let xlsx: Buffer;

beforeAll(async () => {
  d = {
    kv: memoryKv(() => clock),
    files: memoryFiles(),
    env: { sessionSecret: "s".repeat(40), fileKey: randomBytes(32), staff: { [STAFF]: await hashPassword(STAFF_PW) } },
    now: () => clock,
    failDelayMs: 0,
  };
  [pdf, xlsx] = await Promise.all([samplePdf(), sampleXlsx()]);
}, 30_000);

// ---- request helpers ---------------------------------------------------------------------

const jar: Record<string, string> = {};
async function call(h: Handler, path: string, init: { method?: string; json?: unknown; form?: FormData; cookie?: string; origin?: string | null } = {}) {
  const headers = new Headers();
  if (init.origin !== null) headers.set("origin", init.origin ?? SITE);
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.json) headers.set("content-type", "application/json");
  const res = await run(h, new Request(SITE + path, { method: init.method ?? "GET", headers, body: init.json ? JSON.stringify(init.json) : init.form }), d);
  const set = res.headers.get("set-cookie");
  if (set) {
    const [pair] = set.split(";");
    const [k, v] = pair.split("=");
    jar[k] = v;
  }
  const type = res.headers.get("content-type") ?? "";
  return { status: res.status, res, body: type.includes("json") ? await res.json() : null };
}
const staffCookie = () => `pb_staff=${jar.pb_staff}`;
const viewCookie = () => `pb_view=${jar.pb_view}`;

async function signIn() {
  const r = await call(staffLogin, "/api/staff/login", { method: "POST", json: { email: ` ${STAFF.toUpperCase()} `, password: STAFF_PW } });
  expect(r.status).toBe(200);
  return staffCookie();
}

async function upload(file: Buffer, name: string, client = "Ms. Priya Nair", password = "client-secret-77", expiryDays = "30", extra: Record<string, string> = {}) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(file)], name));
  form.set("client", client);
  form.set("password", password);
  form.set("expiryDays", expiryDays);
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  return call(shares, "/api/shares", { method: "POST", form, cookie: await signIn() });
}

// ---- tests ----------------------------------------------------------------------------------

describe("crypto, passwords and config", () => {
  it("round-trips encrypted files and rejects tampering", () => {
    const key = randomBytes(32);
    const enc = encrypt(key, Buffer.from("proposal"));
    expect(decrypt(key, enc).toString()).toBe("proposal");
    enc[enc.length - 1] ^= 1;
    expect(() => decrypt(key, enc)).toThrow();
  });
  it("hashes passwords with scrypt and normalises phone-keyboard input", async () => {
    const h = await hashPassword("abc-12345");
    expect(h.startsWith("scrypt:")).toBe(true);
    expect(h).not.toContain("$");
    expect(await verifyPassword(" abc-12345​", h)).toBe(true);
    expect(await verifyPassword("ABC-12345", h)).toBe(false);
  });
  it("accepts hashes made by the setup script", async () => {
    const { hashStaffPassword } = await import("../scripts/visualize-setup.mjs");
    expect(await verifyPassword("from-the-script-1", await hashStaffPassword(" from-the-script-1 "))).toBe(true);
  });
  it("finds Redis credentials under any of the integration's names, including a custom prefix", () => {
    expect(redisCredentials({ KV_REST_API_URL: "u1", KV_REST_API_TOKEN: "t1" })).toEqual({ url: "u1", token: "t1" });
    expect(redisCredentials({ UPSTASH_REDIS_REST_URL: "u2", UPSTASH_REDIS_REST_TOKEN: "t2" })).toEqual({ url: "u2", token: "t2" });
    expect(redisCredentials({ VISUALIZE_REDIS_PREFIX: "VIZ", VIZ_KV_REST_API_URL: "u3", VIZ_KV_REST_API_TOKEN: "t3", REDIS_URL: "redis://other" })).toEqual({ url: "u3", token: "t3" });
    expect(redisCredentials({ REDIS_URL: "redis://only-tcp" })).toBeNull();
  });
});

describe("api routes", () => {
  it("export the shape Vercel runs as a Web handler: default { fetch }", async () => {
    // a bare default function is treated as the legacy Node (req, res) signature on Vercel and never answers
    const routes = import.meta.glob<{ default?: { fetch?: unknown } }>("../api/**/*.ts", { eager: true });
    expect(Object.keys(routes)).toHaveLength(9);
    for (const [file, mod] of Object.entries(routes)) expect(typeof mod.default?.fetch, file).toBe("function");
  });
});

describe("upload validation", () => {
  it("checks type, content and size", () => {
    expect(validateUpload("p.pdf", pdf)).toEqual({ kind: "pdf" });
    expect(validateUpload("p.xlsx", xlsx)).toEqual({ kind: "xlsx" });
    expect(validateUpload("p.xlsx", pdf)).toHaveProperty("error");
    expect(validateUpload("p.pdf", xlsx)).toHaveProperty("error");
    expect(validateUpload("p.docx", pdf)).toHaveProperty("error");
    expect(validateUpload("p.xls", xlsx)).toEqual({ error: expect.stringContaining(".xlsx") });
    expect(validateUpload("big.pdf", Buffer.concat([pdf, Buffer.alloc(5 * 1024 * 1024)]))).toEqual({ error: expect.stringContaining("limit is 4.0 MB") });
  });
});

describe("staff sign-in", () => {
  it("issues an HttpOnly cookie and locks out after 5 wrong passwords", async () => {
    await signIn();
    expect((await call(staffMe, "/api/staff/me", { cookie: staffCookie() })).status).toBe(200);
    expect((await call(staffMe, "/api/staff/me")).status).toBe(401);
    const email = "someone@studio.test";
    for (let i = 0; i < 4; i++) expect((await call(staffLogin, "/x", { method: "POST", json: { email, password: "nope" } })).status).toBe(401);
    const fifth = await call(staffLogin, "/x", { method: "POST", json: { email, password: "nope" } });
    expect(fifth.status).toBe(429);
    expect(fifth.body.error).toMatch(/wait 15 minutes/);
  });
  it("rejects cross-site requests", async () => {
    expect((await call(staffLogin, "/x", { method: "POST", json: { email: STAFF, password: STAFF_PW }, origin: "https://evil.test" })).status).toBe(403);
    expect((await call(staffLogin, "/x", { method: "POST", json: { email: STAFF, password: STAFF_PW }, origin: null })).status).toBe(403);
  });
});

describe("sharing and viewing", () => {
  it("requires a staff session to list or upload", async () => {
    expect((await call(shares, "/api/shares")).status).toBe(401);
    expect((await call(shares, "/api/shares", { method: "POST", form: new FormData() })).status).toBe(401);
  });

  it("renders a PDF to page images behind a password, and never serves the file", async () => {
    const up = await upload(pdf, "Proposal.pdf");
    expect(up.status).toBe(201);
    const { id, token, pages, kind } = up.body.share;
    expect(kind).toBe("pdf");
    expect(pages).toBeGreaterThan(0);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(up.body)).not.toMatch(/passwordHash|tokenHash/);

    // stored files are encrypted: the PDF signature isn't visible
    expect((await d.files.get(`shares/${id}/original.bin`))!.includes("%PDF-")).toBe(false);

    expect((await call(viewDoc, `/api/view/doc?id=${id}`)).status).toBe(401);
    expect((await call(viewPage, `/api/view/page?id=${id}&n=0`)).status).toBe(401);

    const wrong = await call(unlock, "/api/view/unlock", { method: "POST", json: { token, password: "guess" } });
    expect(wrong.status).toBe(401);
    const unknown = await call(unlock, "/api/view/unlock", { method: "POST", json: { token: "A".repeat(43), password: "guess" } });
    expect(unknown.body.error).toBe(wrong.body.error);

    const ok = await call(unlock, "/api/view/unlock", { method: "POST", json: { token, password: "client-secret-77" } });
    expect(ok.status).toBe(200);
    expect(ok.res.headers.get("set-cookie")).toMatch(/HttpOnly; SameSite=Strict; Secure/);

    const doc = await call(viewDoc, `/api/view/doc?id=${id}`, { cookie: viewCookie() });
    expect(doc.status).toBe(200);
    expect(doc.body).toMatchObject({ client: "Ms. Priya Nair", kind: "pdf" });
    expect(doc.body.pages.length).toBe(pages);

    const page = await call(viewPage, `/api/view/page?id=${id}&n=0`, { cookie: viewCookie() });
    expect(page.status).toBe(200);
    expect(page.res.headers.get("content-type")).toBe("image/webp");
    expect(page.res.headers.get("cache-control")).toMatch(/no-store/);

    const before = viewCookie();
    await call(viewLock, "/api/view/lock", { method: "POST", cookie: before });
    expect((await call(viewDoc, `/api/view/doc?id=${id}`, { cookie: before })).status).toBe(401);
  }, 30_000);

  it("binds a viewer session to one share", async () => {
    const a = (await upload(pdf, "A.pdf", "Client A", "password-a-1")).body.share;
    const b = (await upload(xlsx, "B.xlsx", "Client B", "password-b-1")).body.share;
    await call(unlock, "/x", { method: "POST", json: { token: a.token, password: "password-a-1" } });
    expect((await call(viewDoc, `/api/view/doc?id=${a.id}`, { cookie: viewCookie() })).status).toBe(200);
    expect((await call(viewDoc, `/api/view/doc?id=${b.id}`, { cookie: viewCookie() })).status).toBe(401);
  }, 30_000);

  it("locks a link after 5 wrong passwords, even for the right one, until the lock expires", async () => {
    const s = (await upload(xlsx, "Lock.xlsx", "Client L", "right-password-9")).body.share;
    for (let i = 0; i < 4; i++) expect((await call(unlock, "/x", { method: "POST", json: { token: s.token, password: "wrong" } })).status).toBe(401);
    expect((await call(unlock, "/x", { method: "POST", json: { token: s.token, password: "wrong" } })).status).toBe(429);
    expect((await call(unlock, "/x", { method: "POST", json: { token: s.token, password: "right-password-9" } })).status).toBe(429);
    clock += 16 * 60 * 1000;
    expect((await call(unlock, "/x", { method: "POST", json: { token: s.token, password: "right-password-9" } })).status).toBe(200);
  }, 30_000);

  it("shows an Excel file as a read-only grid, and stops at revocation and expiry", async () => {
    const s = (await upload(xlsx, "Estimate.xlsx", "Client X", "excel-pass-42", "7")).body.share;
    await call(unlock, "/x", { method: "POST", json: { token: s.token, password: "excel-pass-42" } });
    const doc = await call(viewDoc, `/api/view/doc?id=${s.id}`, { cookie: viewCookie() });
    expect(doc.body.kind).toBe("xlsx");
    const text = JSON.stringify(doc.body.grid);
    expect(text).toContain("Ms. Priya Nair");
    expect(text).not.toMatch(/SUM\(|formula/i);
    expect((await call(viewPage, `/api/view/page?id=${s.id}&n=0`, { cookie: viewCookie() })).status).toBe(404);

    expect((await call(shares, `/api/shares?id=${s.id}`, { method: "DELETE", cookie: await signIn() })).status).toBe(200);
    expect((await call(viewDoc, `/api/view/doc?id=${s.id}`, { cookie: viewCookie() })).status).toBe(410);

    const e = (await upload(pdf, "Old.pdf", "Client E", "expired-pass-1", "7")).body.share;
    clock += 8 * 86400 * 1000;
    expect((await call(unlock, "/x", { method: "POST", json: { token: e.token, password: "expired-pass-1" } })).status).toBe(401);
    const list = await call(shares, "/api/shares", { cookie: await signIn() });
    expect(list.body.shares.find((x: { id: string }) => x.id === e.id).expired).toBe(true);
  }, 30_000);
});

describe("share with client and the client's answer", () => {
  const respond = (id: string, json: unknown, init: { cookie?: string; origin?: string | null } = {}) =>
    call(viewRespond, `/api/view/respond?id=${id}`, { method: "POST", json, cookie: init.cookie ?? viewCookie(), origin: init.origin });
  const listed = async (id: string) => (await call(shares, "/api/shares", { cookie: await signIn() })).body.shares.find((x: { id: string }) => x.id === id);

  it("keeps the proposal it came from, and ignores anything that isn't an id", async () => {
    const a = (await upload(pdf, "A.pdf", "Client A", "password-a-1", "30", { proposalId: "mk3x9q2a1b" })).body.share;
    expect(a.proposalId).toBe("mk3x9q2a1b");
    const b = (await upload(pdf, "B.pdf", "Client B", "password-b-1", "30", { proposalId: "<script>" })).body.share;
    expect(b).not.toHaveProperty("proposalId");
  }, 30_000);

  it("lets the client approve or ask for changes, and shows it to staff", async () => {
    const s = (await upload(pdf, "Ok.pdf", "Client R", "respond-pass-1")).body.share;
    await call(unlock, "/x", { method: "POST", json: { token: s.token, password: "respond-pass-1" } });

    expect((await respond(s.id, { kind: "maybe" })).status).toBe(400);
    expect((await respond(s.id, { kind: "changes", comment: "   " })).status).toBe(400);

    const ok = await respond(s.id, { kind: "approved" });
    expect(ok.status).toBe(200);
    expect((await listed(s.id)).decision).toMatchObject({ kind: "approved", at: clock });
    expect((await call(viewDoc, `/api/view/doc?id=${s.id}`, { cookie: viewCookie() })).body.decision.kind).toBe("approved");

    // a later answer replaces it; the comment is plain text, capped, and the view count survives
    const long = `Move the haldi to the morning\u0007 ${"x".repeat(2000)}`;
    expect((await respond(s.id, { kind: "changes", comment: long })).status).toBe(200);
    const after = await listed(s.id);
    expect(after.decision.kind).toBe("changes");
    expect(after.decision.comment).toHaveLength(1000);
    expect(after.decision.comment).not.toContain("\u0007");
    expect(after.views).toBe(1);
  }, 30_000);

  it("only answers for that share, from this site, while the link is live", async () => {
    const a = (await upload(pdf, "A2.pdf", "Client A", "password-a-2")).body.share;
    const b = (await upload(pdf, "B2.pdf", "Client B", "password-b-2")).body.share;
    expect((await respond(a.id, { kind: "approved" }, { cookie: "pb_view=nope" })).status).toBe(401);
    await call(unlock, "/x", { method: "POST", json: { token: a.token, password: "password-a-2" } });
    // a session for share A can't answer for share B
    expect((await respond(b.id, { kind: "approved" })).status).toBe(401);
    expect((await respond(a.id, { kind: "approved" }, { origin: "https://evil.test" })).status).toBe(403);
    expect((await listed(b.id)).decision).toBeUndefined();

    // revoked
    const cookie = viewCookie();
    await call(shares, `/api/shares?id=${a.id}`, { method: "DELETE", cookie: await signIn() });
    expect((await respond(a.id, { kind: "approved" }, { cookie })).status).toBe(410);

    // expired
    const e = (await upload(pdf, "E2.pdf", "Client E", "expired-pass-2", "7")).body.share;
    await call(unlock, "/x", { method: "POST", json: { token: e.token, password: "expired-pass-2" } });
    const eCookie = viewCookie();
    clock += 8 * 86400 * 1000;
    const late = await respond(e.id, { kind: "approved" }, { cookie: eCookie });
    expect([401, 410]).toContain(late.status);
    expect((await listed(e.id)).decision).toBeUndefined();
  }, 30_000);
});

describe("sharing a proposal as a web page", () => {
  async function sharePage(page: unknown, password = "page-pass-123") {
    const form = new FormData();
    form.set("page", typeof page === "string" ? page : JSON.stringify(page));
    form.set("client", "Ms. Priya Nair");
    form.set("password", password);
    form.set("expiryDays", "30");
    return call(shares, "/api/shares", { method: "POST", form, cookie: await signIn() });
  }
  const snapshot = () => {
    const p = proposal();
    p.lines[0].upgrades = [
      { id: "kept", name: "Floral arch", price: 25000, mode: "include" },
      { id: "internal", name: "Internal option", price: 999, mode: "off" },
    ];
    const s = pageSnapshot(p, catalog, "nord", "2026-11-06");
    return s;
  };

  it("stores a cleaned snapshot, encrypted, and shows it only after the password", async () => {
    const s = snapshot() as unknown as { catalog: { ceremonyStyles: { image: string }[] }; proposal: { lines: { upgrades: unknown[] }[] } };
    s.catalog.ceremonyStyles[0].image = "javascript:alert(1)";
    // an upgrade sneaked in with mode "off" is dropped by the server too
    s.proposal.lines[1].upgrades = [{ id: "x", name: "Not offered", price: 1, mode: "off" }];
    const up = await sharePage(s);
    expect(up.status).toBe(201);
    const share = up.body.share;
    expect(share).toMatchObject({ kind: "page", fileName: "Web page", title: "Proposal" });
    expect((await d.files.get(`shares/${share.id}/view.bin`))!.includes("Priya")).toBe(false);

    expect((await call(viewDoc, `/api/view/doc?id=${share.id}`)).status).toBe(401);
    await call(unlock, "/x", { method: "POST", json: { token: share.token, password: "page-pass-123" } });
    const doc = await call(viewDoc, `/api/view/doc?id=${share.id}`, { cookie: viewCookie() });
    expect(doc.status).toBe(200);
    expect(doc.body.kind).toBe("page");
    const page = doc.body.page;
    expect(page).toMatchObject({ v: 1, theme: "nord", dated: "2026-11-06" });
    expect(page.proposal.client.name).toBe("Ms. Priya Nair");
    expect(page.proposal.lines[0].upgrades.map((u: { id: string }) => u.id)).toEqual(["kept"]);
    expect(page.proposal.lines[1].upgrades).toEqual([]);
    expect(page.catalog.ceremonyStyles[0].image).toBe("");
    expect(JSON.stringify(page)).not.toMatch(/Internal option|Not offered|javascript:/);
    // no page images for a web page
    expect((await call(viewPage, `/api/view/page?id=${share.id}&n=0`, { cookie: viewCookie() })).status).toBe(404);
  }, 30_000);

  it("refuses an unknown theme, a broken or foreign snapshot, and an oversized one", async () => {
    const s = snapshot();
    expect((await sharePage({ ...s, theme: "neon" })).status).toBe(415);
    expect((await sharePage("{not json")).status).toBe(415);
    expect((await sharePage({ hello: "world" })).status).toBe(415);
    expect((await sharePage({ ...s, proposal: { ...s.proposal, notes: "x".repeat(300 * 1024) } })).status).toBe(415);
  }, 30_000);
});

describe("excel grid", () => {
  it("keeps values, merges and formatting but no formulas", async () => {
    const grid = await renderXlsx(xlsx);
    expect(grid.sheets.map((s) => s.name)).toEqual(["Proposal", "Additional Options", "Terms"]);
    const cells = grid.sheets[0].rows.flatMap((r) => r.cells).filter(Boolean);
    expect(cells.some((c) => c!.v.startsWith("₹ "))).toBe(true);
    expect(cells.some((c) => (c!.cs ?? 1) > 1)).toBe(true);
  });
});
