// Shared by the Visualize Proposal page and "Share with client" in the Builder.

/** Mirrors server/visualize.ts `forStaff`: what staff may see of a share. */
export interface Share {
  id: string;
  token: string;
  client: string;
  title: string;
  kind: "pdf" | "xlsx";
  fileName: string;
  size: number;
  pages?: number;
  sheets?: number;
  createdAt: number;
  expiresAt: number;
  createdBy: string;
  views: number;
  lastViewedAt?: number;
  expired: boolean;
  /** the Proposal Studio proposal it was shared from, when shared from the Builder */
  proposalId?: string;
  /** the client's answer on the shared page */
  decision?: ShareDecision;
}

export interface ShareDecision {
  kind: "approved" | "changes";
  comment?: string;
  at: number;
}

export const MAX_SHARE_BYTES = 4 * 1024 * 1024;
export const EXPIRY_DAYS = [7, 30, 90];

export const shareLink = (token: string) => `${location.origin}${location.pathname}#/view/${token}`;
export const shortDate = (t: number) => new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
export const fileSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Easy to read aloud or type on a phone: no 0/O or 1/l/I. */
export function generatePassword() {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const s = Array.from(crypto.getRandomValues(new Uint32Array(12)), (n) => abc[n % abc.length]).join("");
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

/**
 * Each proposal's latest client answer: from the share recorded on it (`shareId`), or else the newest share
 * made from it. A newer share without an answer yet means there's nothing to show.
 */
export function clientAnswers(list: { id: string; shareId?: string }[], shares: Share[]): Map<string, ShareDecision> {
  const out = new Map<string, ShareDecision>();
  for (const p of list) {
    const own = p.shareId ? shares.find((s) => s.id === p.shareId) : undefined;
    const latest = own ?? shares.filter((s) => s.proposalId === p.id).sort((a, b) => b.createdAt - a.createdAt)[0];
    if (latest?.decision) out.set(p.id, latest.decision);
  }
  return out;
}

/** "Approved 3 Dec 2026" / "Changes requested 3 Dec 2026" */
export const decisionLine = (d: ShareDecision) => `${d.kind === "approved" ? "Approved" : "Changes requested"} ${shortDate(d.at)}`;
