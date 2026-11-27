import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { memoryFiles, memoryKv } from "./store";
import { run, type Deps, type Handler } from "./deps";
import { hashPassword } from "./passwords";
import { staffLogin } from "./visualize";
import { rsvpLinks, rsvpRespond, validateInvite } from "./rsvp";

// test-only account
const STAFF = "staff@studio.test";
const STAFF_PW = "test-only-Passw0rd";
const SITE = "https://studio.test";
let clock = Date.parse("2026-11-04T10:00:00Z");
let d: Deps;
let cookie = "";

beforeAll(async () => {
  d = {
    kv: memoryKv(() => clock),
    files: memoryFiles(),
    env: { sessionSecret: "s".repeat(40), fileKey: randomBytes(32), staff: { [STAFF]: await hashPassword(STAFF_PW) } },
    now: () => clock,
    failDelayMs: 0,
  };
  const r = await call(staffLogin, "/api/staff/login", { method: "POST", json: { email: STAFF, password: STAFF_PW } });
  cookie = r.res.headers.get("set-cookie")!.split(";")[0];
});

async function call(h: Handler, path: string, init: { method?: string; json?: unknown; cookie?: string; origin?: string | null; ip?: string } = {}) {
  const headers = new Headers({ "content-type": "application/json", "x-real-ip": init.ip ?? "203.0.113.1" });
  if (init.origin !== null) headers.set("origin", init.origin ?? SITE);
  if (init.cookie) headers.set("cookie", init.cookie);
  const res = await run(h, new Request(SITE + path, { method: init.method ?? "GET", headers, body: init.json ? JSON.stringify(init.json) : undefined }), d);
  return { status: res.status, res, body: await res.json() };
}

const invite = (over: Record<string, unknown> = {}) => ({
  title: "Priya & Arjun",
  host: "Studio",
  meals: ["Vegetarian", "Non-vegetarian"],
  open: false,
  deadline: "2027-01-31",
  fns: [
    { id: "f1", label: "Sangeet", date: "2027-02-13", venue: "Kovalam" },
    { id: "f2", label: "Wedding", date: "2027-02-14", venue: "Kovalam" },
  ],
  guests: [
    { code: "ABCDEFGH23", name: "The Menon family", invited: 4, fns: ["f1", "f2"] },
    { code: "XYZ2345678", name: "Rahul", invited: 1, fns: ["f2"] },
  ],
  ...over,
});

async function create(over: Record<string, unknown> = {}) {
  const r = await call(rsvpLinks, "/api/staff/rsvp", { method: "POST", cookie, json: { invite: invite(over), proposalId: "p1" } });
  expect(r.status).toBe(201);
  return r.body.rsvp as { id: string; token: string };
}

describe("rsvp", () => {
  it("shows a guest only their own household, and the same answer for a wrong code or an unknown link", async () => {
    const { token } = await create();
    const mine = await call(rsvpRespond, "/api/rsvp", { method: "POST", json: { token, code: "ABCDEFGH23" } });
    expect(mine.status).toBe(200);
    expect(mine.body.guest).toEqual({ name: "The Menon family", invited: 4, fns: ["f1", "f2"] });
    expect(JSON.stringify(mine.body)).not.toContain("Rahul");
    expect(mine.body.invite.guests).toBeUndefined();

    const wrong = await call(rsvpRespond, "/api/rsvp", { method: "POST", json: { token, code: "ZZZZZZZZZZ" } });
    const unknown = await call(rsvpRespond, "/api/rsvp", { method: "POST", json: { token: "x".repeat(43), code: "ABCDEFGH23" } });
    expect(wrong.status).toBe(404);
    expect(unknown.body.error).toBe(wrong.body.error);
    // a personal-only invitation refuses the bare link
    expect((await call(rsvpRespond, "/api/rsvp", { method: "POST", json: { token } })).status).toBe(404);
  });

  it("cleans replies to what the household was invited to, and staff read them back", async () => {
    const { id, token } = await create();
    const save = await call(rsvpRespond, "/api/rsvp", {
      method: "POST",
      json: { token, code: "XYZ2345678", reply: { replies: { f1: { status: "yes", count: 3 }, f2: { status: "yes", count: 9 } }, meal: "Pizza", note: "See you!" } },
    });
    expect(save.status).toBe(200);
    // not invited to f1; one person at most; an unlisted meal dropped
    expect(save.body.reply.replies).toEqual({ f2: { status: "yes", count: 1 } });
    expect(save.body.reply.meal).toBeUndefined();
    const staff = await call(rsvpLinks, `/api/staff/rsvp?id=${id}`, { cookie });
    expect(staff.body.replies.XYZ2345678.note).toBe("See you!");
    expect((await call(rsvpLinks, `/api/staff/rsvp?id=${id}`)).status).toBe(401);
  });

  it("takes open replies with a name and phone, one per number, and closes after the deadline", async () => {
    const { id, token } = await create({ open: true });
    const bad = await call(rsvpRespond, "/api/rsvp", { method: "POST", json: { token, reply: { name: "Asha", replies: { f1: { status: "yes", count: 2 } } } } });
    expect(bad.status).toBe(400);
    const reply = { name: "Asha", phone: "+91 98470 12345", replies: { f1: { status: "yes", count: 2 } } };
    expect((await call(rsvpRespond, "/api/rsvp", { method: "POST", json: { token, reply } })).status).toBe(200);
    expect((await call(rsvpRespond, "/api/rsvp", { method: "POST", json: { token, reply: { ...reply, replies: { f1: { status: "no" } } } } })).status).toBe(200);
    const staff = await call(rsvpLinks, `/api/staff/rsvp?id=${id}`, { cookie });
    const open = Object.entries(staff.body.replies).filter(([k]) => k.startsWith("open-"));
    expect(open).toHaveLength(1);
    expect((open[0][1] as { replies: unknown }).replies).toEqual({ f1: { status: "no", count: 0 } });

    clock = Date.parse("2027-02-01T10:00:00Z");
    const late = await call(rsvpRespond, "/api/rsvp", { method: "POST", json: { token, code: "ABCDEFGH23", reply: { replies: { f1: { status: "yes", count: 1 } } } } });
    expect(late.status).toBe(409);
    clock = Date.parse("2026-11-04T10:00:00Z");
  });

  it("refreshes in place, turns off, and requires the site's own origin", async () => {
    const { id, token } = await create();
    const put = await call(rsvpLinks, `/api/staff/rsvp?id=${id}`, { method: "PUT", cookie, json: { invite: invite({ title: "New title" }) } });
    expect(put.body.rsvp.token).toBe(token);
    expect((await call(rsvpRespond, "/api/rsvp", { method: "POST", json: { token, code: "ABCDEFGH23" } })).body.invite.title).toBe("New title");
    expect((await call(rsvpRespond, "/api/rsvp", { method: "POST", origin: "https://evil.test", json: { token, code: "ABCDEFGH23" } })).status).toBe(403);
    await call(rsvpLinks, `/api/staff/rsvp?id=${id}`, { method: "DELETE", cookie });
    expect((await call(rsvpRespond, "/api/rsvp", { method: "POST", json: { token, code: "ABCDEFGH23" } })).status).toBe(404);
  });

  it("rate-limits replies per network", async () => {
    const { token } = await create();
    let last = 0;
    for (let i = 0; i < 45; i++)
      last = (await call(rsvpRespond, "/api/rsvp", { method: "POST", ip: "198.51.100.9", json: { token, code: "XYZ2345678", reply: { replies: { f2: { status: "yes", count: 1 } } } } })).status;
    expect(last).toBe(429);
  });

  it("validates the invitation it's given", () => {
    expect(validateInvite({ ...invite(), fns: [] })).toHaveProperty("error");
    const ok = validateInvite({ ...invite(), theme: "neon", guests: [{ code: "bad", name: "x" }, { code: "ABCDEFGH23", name: "  ", invited: 1 }] });
    expect("invite" in ok && ok.invite.guests).toEqual([]);
    expect("invite" in ok && ok.invite.theme).toBeUndefined();
  });
});
