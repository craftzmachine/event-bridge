import { describe, expect, it } from "vitest";
import { decideLogin } from "./loginRules";

const err = (status: number, extra: { retryAfter?: number } = {}) => ({ status, message: `error ${status}`, ...extra });
const TEAM = "planner@example.com";

describe("sign-in decisions", () => {
  it("signs in whoever the server accepts, in both modes", () => {
    for (const serverOnly of [false, true]) {
      expect(decideLogin({ email: TEAM }, null, serverOnly)).toEqual({ kind: "signedIn", email: TEAM });
    }
  });

  it("passes on the server's lockout in both modes", () => {
    for (const serverOnly of [false, true]) {
      expect(decideLogin(err(429, { retryAfter: 900 }), TEAM, serverOnly)).toEqual({ kind: "locked", seconds: 900, message: "error 429" });
    }
  });

  it("today: falls back to the browser list only when the server can't answer", () => {
    expect(decideLogin(err(0), TEAM, false)).toEqual({ kind: "signedIn", email: TEAM });
    expect(decideLogin(err(503), TEAM, false)).toEqual({ kind: "signedIn", email: TEAM });
    expect(decideLogin(err(0), null, false)).toEqual({ kind: "wrong" });
    // the server said no: a browser-list account is told it's missing from STAFF_ACCOUNTS
    expect(decideLogin(err(401), TEAM, false)).toEqual({ kind: "notOnServer", account: TEAM });
    expect(decideLogin(err(401), null, false)).toEqual({ kind: "wrong" });
    expect(decideLogin(err(400), TEAM, false)).toEqual({ kind: "wrong" });
  });

  it("server-only: never falls back, and says when sign-in is unavailable", () => {
    expect(decideLogin(err(0), TEAM, true)).toEqual({ kind: "unavailable" });
    expect(decideLogin(err(503), TEAM, true)).toEqual({ kind: "unavailable" });
    expect(decideLogin(err(401), TEAM, true)).toEqual({ kind: "wrong" });
  });
});
