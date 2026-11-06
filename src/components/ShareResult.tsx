import { useState, type ReactNode } from "react";
import { shareLink, shortDate, type Share } from "../lib/shares";

export function useCopy() {
  const [copied, setCopied] = useState("");
  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      setCopied("");
    }
  };
  return { copied, copy };
}

/** The new private link and its password, each with a Copy button. The password can't be shown again. */
export default function ShareResult({ share, password, actions }: { share: Share; password: string; actions?: ReactNode }) {
  const { copied, copy } = useCopy();
  const link = shareLink(share.token);
  return (
    <section className="viz-card viz-result" aria-live="polite">
      <p className="eyebrow">Link ready</p>
      <h2>Shared with {share.client}</h2>
      <p className="viz-result-note">
        Send the link and the password <strong>separately</strong> — for example the link by email and the password by
        WhatsApp or a call. The password can't be shown again later, so note it now.
      </p>
      <div className="viz-copy">
        <span className="field-label">Link</span>
        <code>{link}</code>
        <button className="btn-ghost btn-sm" onClick={() => copy("link", link)}>{copied === "link" ? "Copied ✓" : "Copy link"}</button>
      </div>
      <div className="viz-copy">
        <span className="field-label">Password</span>
        <code>{password}</code>
        <button className="btn-ghost btn-sm" onClick={() => copy("pw", password)}>{copied === "pw" ? "Copied ✓" : "Copy password"}</button>
      </div>
      <p className="hint">Active until {shortDate(share.expiresAt)}. You can revoke it any time from Visualize Proposal.</p>
      {actions}
    </section>
  );
}
