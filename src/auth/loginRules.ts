// What the sign-in form does with the server's answer. Pure, so both modes are tested in Node.

export type LoginOutcome =
  | { kind: "signedIn"; email: string }
  | { kind: "locked"; seconds?: number; message: string }
  /** a valid browser-list account the server doesn't know: explain, rather than look like a wrong password */
  | { kind: "notOnServer"; account: string }
  /** server-only mode and the server can't be reached or isn't set up */
  | { kind: "unavailable" }
  | { kind: "wrong" };

/**
 * @param server  the server's answer: an email on success, or the error status
 * @param browserAccount  the email the browser allow-list accepts for these credentials, or null
 * @param serverOnly  VITE_SERVER_SIGNIN: the server is the only list, with no browser fallback
 */
export function decideLogin(
  server: { email: string } | { status: number; retryAfter?: number; message: string },
  browserAccount: string | null,
  serverOnly: boolean,
): LoginOutcome {
  if ("email" in server) return { kind: "signedIn", email: server.email };
  if (server.status === 429) return { kind: "locked", seconds: server.retryAfter, message: server.message };
  const unreachable = server.status === 0 || server.status === 503;
  if (serverOnly) return unreachable ? { kind: "unavailable" } : { kind: "wrong" };
  if (server.status === 401 && browserAccount) return { kind: "notOnServer", account: browserAccount };
  if (unreachable && browserAccount) return { kind: "signedIn", email: browserAccount };
  return { kind: "wrong" };
}
