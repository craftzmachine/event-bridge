import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Proposal } from "../types";
import { useConfig } from "../config/context";
import { ApiError, upload } from "../lib/api";
import { exportFileName, proposalTitle } from "../lib/proposal";
import { EXPIRY_DAYS, fileSize, generatePassword, MAX_SHARE_BYTES, type Share } from "../lib/shares";
import PasswordField from "./PasswordField";
import ShareResult from "./ShareResult";

type Phase = { at: "form" } | { at: "busy"; step: "pdf" | "upload"; progress: number } | { at: "done"; share: Share; password: string };

/**
 * "Share with client" from the Review step: builds the proposal's PDF in the browser and creates a private,
 * password-protected Visualize Proposal link in one go — no separate export and upload.
 */
export default function ShareDialog({
  p,
  onShared,
  onClose,
  onReauth,
}: {
  p: Proposal;
  onShared: (share: Share) => void;
  onClose: () => void;
  onReauth: () => void;
}) {
  const { catalog, brand } = useConfig();
  const ref = useRef<HTMLDialogElement>(null);
  const [client, setClient] = useState(p.client.name);
  const [title, setTitle] = useState(() => `${proposalTitle(p, catalog) || "Event"} proposal`);
  const [password, setPassword] = useState(generatePassword);
  const [days, setDays] = useState(30);
  const [phase, setPhase] = useState<Phase>({ at: "form" });
  const [err, setErr] = useState<{ text: string; signIn?: boolean } | null>(null);

  // no close() on cleanup: it fires onClose, and React's dev double-run would dismiss the dialog
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!client.trim()) return setErr({ text: "Enter the client's name — it's shown on the shared page and in the watermark." });
    if (password.length < 8) return setErr({ text: "Use a password of at least 8 characters, or generate one." });
    try {
      setPhase({ at: "busy", step: "pdf", progress: 0 });
      const blob = await (await import("../lib/exportPdf")).buildPdfBlob(p, catalog, brand);
      if (blob.size > MAX_SHARE_BYTES) {
        setPhase({ at: "form" });
        return setErr({ text: `The PDF is ${fileSize(blob.size)}; sharing allows up to 4 MB. Export it and share a smaller file from Visualize Proposal.` });
      }
      const form = new FormData();
      form.set("file", new File([blob], exportFileName(p, catalog, "pdf"), { type: "application/pdf" }));
      form.set("client", client.trim());
      form.set("title", title.trim());
      form.set("password", password);
      form.set("expiryDays", String(days));
      form.set("proposalId", p.id);
      const r = await upload<{ share: Share }>("shares", form, (progress) => setPhase({ at: "busy", step: "upload", progress }));
      onShared(r.share);
      setPhase({ at: "done", share: r.share, password });
    } catch (ex) {
      const e2 = ex as ApiError;
      setPhase({ at: "form" });
      if (e2.status === 401) setErr({ text: "Sharing needs a fresh sign-in on this device, so the server can confirm it's you.", signIn: true });
      else if (e2.status === 503) setErr({ text: "Sharing isn't set up on this site yet. The steps are in the README under “Visualize Proposal”." });
      else if (e2.status === 0) setErr({ text: "Can't reach the sharing service. Check the connection and try again." });
      else setErr({ text: e2.message || "The link couldn't be created." });
    }
  }

  const busy = phase.at === "busy";
  return (
    <dialog ref={ref} className="venue-dialog xi share-dialog" onClose={onClose} onCancel={(e) => busy && e.preventDefault()} aria-labelledby="share-title">
      <header className="xi-head">
        <h2 id="share-title">{phase.at === "done" ? "Ready to send" : "Share with client"}</h2>
        <button className="vd-close" onClick={onClose} aria-label="Close" disabled={busy}>×</button>
      </header>

      {phase.at === "done" ? (
        <div className="xi-body">
          <ShareResult share={phase.share} password={phase.password} actions={<button className="btn-primary" onClick={onClose}>Done</button>} />
        </div>
      ) : (
        <form className="xi-body" onSubmit={submit} noValidate>
          <p className="xi-lede">
            The proposal is turned into a PDF and shared as a private page: your client opens the link, enters the password and
            reads it in the browser, watermarked with their name. Nothing to download.
          </p>
          <label className="field">
            <span>Client name</span>
            <input value={client} maxLength={120} onChange={(e) => setClient(e.target.value)} disabled={busy} />
          </label>
          <label className="field">
            <span>Title shown to the client</span>
            <input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
          </label>
          <PasswordField
            id="share-password"
            label="Password for the client"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            after={
              <div className="viz-pw-tools">
                <button type="button" className="link-btn" onClick={() => setPassword(generatePassword())} disabled={busy}>Generate another</button>
                <small>At least 8 characters · case-sensitive</small>
              </div>
            }
          />
          <fieldset className="viz-expiry">
            <legend>Link stays active for</legend>
            {EXPIRY_DAYS.map((n) => (
              <label key={n} className={days === n ? "is-on" : ""}>
                <input type="radio" name="share-expiry" value={n} checked={days === n} onChange={() => setDays(n)} disabled={busy} />
                {n} days
              </label>
            ))}
          </fieldset>

          {err && (
            <div className="error" role="alert">
              <p>{err.text}</p>
              {err.signIn && <button type="button" className="btn-primary" onClick={onReauth}>Sign in again</button>}
            </div>
          )}
          <div className="xi-actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {phase.at !== "busy" ? "Create private link" : phase.step === "pdf" ? "Making the PDF…" : phase.progress < 1 ? `Uploading… ${Math.round(phase.progress * 100)}%` : "Preparing the viewer…"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
