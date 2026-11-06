import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useConfig } from "../config/context";
import { ApiError, api, upload } from "../lib/api";
import AppearanceControls from "../components/AppearanceControls";
import PasswordField from "../components/PasswordField";
import ShareResult, { useCopy } from "../components/ShareResult";
import { EXPIRY_DAYS as EXPIRY, fileSize as mb, generatePassword, MAX_SHARE_BYTES as MAX_BYTES, shareLink, shortDate as when, type Share } from "../lib/shares";
import ClientAnswer from "../components/ClientAnswer";

function checkFile(f: File): string {
  const ext = f.name.toLowerCase().split(".").pop();
  if (ext === "xls" || ext === "xlsm" || ext === "csv") return `.${ext} files aren't supported. Save it as an Excel workbook (.xlsx) first.`;
  if (ext !== "pdf" && ext !== "xlsx") return "Choose a PDF (.pdf) or an Excel workbook (.xlsx).";
  if (!f.size) return "That file is empty.";
  if (f.size > MAX_BYTES) return `That file is ${mb(f.size)}; the limit is 4 MB. Try exporting a smaller PDF or removing large images.`;
  return "";
}

type Access = "checking" | "ok" | "signin" | "setup" | "offline";

/** Staff page for Visualize Proposal: upload a PDF or Excel file and send the client a private link. */
export default function Visualize({ onBack, onReauth }: { onBack: () => void; onReauth: () => void }) {
  const { brand } = useConfig();
  const [access, setAccess] = useState<Access>("checking");
  const [accessMsg, setAccessMsg] = useState("");
  const [list, setList] = useState<Share[] | null>(null);
  const [listErr, setListErr] = useState("");

  const handleErr = useCallback((e: unknown) => {
    const err = e as ApiError;
    if (err.status === 401) setAccess("signin");
    else if (err.status === 503) setAccess("setup");
    else if (err.status === 0) setAccess("offline");
    setAccessMsg(err.message);
    return err;
  }, []);

  const refresh = useCallback(async () => {
    try {
      setList((await api<{ shares: Share[] }>("shares")).shares);
      setListErr("");
    } catch (e) {
      setListErr(handleErr(e).message);
    }
  }, [handleErr]);

  useEffect(() => {
    api<{ email: string }>("staff/me")
      .then(() => {
        setAccess("ok");
        refresh();
      })
      .catch(handleErr);
  }, [refresh, handleErr]);

  return (
    <div className="viz-page">
      <header className="topbar">
        <button className="btn-ghost btn-sm" onClick={onBack} aria-label="Back to Proposal Studio">
          ←<span className="hide-phone"> Proposals</span>
        </button>
        <img className="topbar-logo" src={`${import.meta.env.BASE_URL}${brand.logo}`} alt={brand.company} />
        <div className="topbar-title">
          <span className="eyebrow">Private sharing</span>
          <strong>Visualize Proposal</strong>
        </div>
        <AppearanceControls />
      </header>

      <main className="viz-main">
        <p className="eyebrow">Password-protected, view-only links</p>
        <h1>Share a proposal with your client</h1>
        <p className="lede">
          Upload the PDF or Excel file. Your client opens the link, enters the password you give them, and reads it in the
          browser — without downloading or printing the file.
        </p>

        {access === "checking" && <p className="viz-status" role="status">Checking your access…</p>}
        {access === "signin" && (
          <div className="viz-notice" role="alert">
            <strong>Please sign in again</strong>
            <p>Sharing needs a fresh sign-in on this device, so the server can confirm it's you.</p>
            <button className="btn-primary" onClick={onReauth}>Sign in again</button>
          </div>
        )}
        {access === "setup" && (
          <div className="viz-notice" role="alert">
            <strong>Sharing isn't set up on this site yet</strong>
            <p>{accessMsg} The steps are in the README under “Visualize Proposal”.</p>
          </div>
        )}
        {access === "offline" && (
          <div className="viz-notice" role="alert">
            <strong>Can't reach the sharing service</strong>
            <p>{accessMsg}</p>
            <button className="btn-ghost" onClick={() => location.reload()}>Try again</button>
          </div>
        )}

        {access === "ok" && (
          <div className="viz-grid">
            <UploadCard onCreated={(s) => setList((l) => [s, ...(l ?? [])])} onAuthError={handleErr} />
            <section className="viz-list" aria-labelledby="viz-list-title">
              <div className="viz-list-head">
                <h2 id="viz-list-title">Shared proposals</h2>
                <button className="link-btn" onClick={refresh}>Refresh</button>
              </div>
              {listErr && <p className="error" role="alert">{listErr}</p>}
              {!list ? (
                <p className="viz-status" role="status">Loading…</p>
              ) : list.length === 0 ? (
                <div className="empty-state">Nothing shared yet. Upload a proposal to create the first private link.</div>
              ) : (
                <ul className="viz-shares">
                  {list.map((s) => (
                    <ShareRow key={s.id} s={s} onDeleted={() => setList((l) => l?.filter((x) => x.id !== s.id) ?? null)} onError={handleErr} />
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function UploadCard({ onCreated, onAuthError }: { onCreated: (s: Share) => void; onAuthError: (e: unknown) => ApiError }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileErr, setFileErr] = useState("");
  const [client, setClient] = useState("");
  const [title, setTitle] = useState("");
  const [password, setPassword] = useState("");
  const [days, setDays] = useState(30);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ share: Share; password: string } | null>(null);

  function pick(f: File | undefined | null) {
    if (!f) return;
    const problem = checkFile(f);
    setFileErr(problem);
    setFile(problem ? null : f);
    if (!problem && !title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (!file) return setFileErr(fileErr || "Choose the proposal file to share.");
    if (!client.trim()) return setErr("Enter the client's name — it's shown on the proposal and in the watermark.");
    if (password.length < 8) return setErr("Use a password of at least 8 characters, or tap Generate.");
    const form = new FormData();
    form.set("file", file);
    form.set("client", client.trim());
    form.set("title", title.trim());
    form.set("password", password);
    form.set("expiryDays", String(days));
    setProgress(0);
    try {
      const r = await upload<{ share: Share }>("shares", form, setProgress);
      onCreated(r.share);
      setDone({ share: r.share, password });
    } catch (ex) {
      const e2 = ex as ApiError;
      if (e2.status === 401 || e2.status === 503) onAuthError(ex);
      setErr(e2.message);
    } finally {
      setProgress(null);
    }
  }

  function reset() {
    setDone(null);
    setFile(null);
    setClient("");
    setTitle("");
    setPassword("");
    setDays(30);
    if (fileRef.current) fileRef.current.value = "";
  }

  if (done) return <ShareResult share={done.share} password={done.password} actions={<button className="btn-primary" onClick={reset}>Share another proposal</button>} />;

  const busy = progress !== null;
  const isPdf = file?.name.toLowerCase().endsWith(".pdf");
  return (
    <form className="viz-card" onSubmit={submit} noValidate>
      <h2>New private link</h2>
      <label
        className={`viz-drop ${drag ? "is-drag" : ""} ${file ? "has-file" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files[0]);
        }}
      >
        <input ref={fileRef} type="file" accept=".pdf,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} disabled={busy} />
        {file ? (
          <>
            <span className={`export-ic ${isPdf ? "export-ic-pdf" : ""}`} aria-hidden>{isPdf ? "PDF" : "XLS"}</span>
            <span className="viz-drop-text">
              <strong>{file.name}</strong>
              <small>{mb(file.size)} · tap to choose a different file</small>
            </span>
          </>
        ) : (
          <span className="viz-drop-text">
            <strong>Drop the proposal here, or tap to choose</strong>
            <small>PDF or Excel (.xlsx), up to 4 MB · PDFs up to 30 pages</small>
          </span>
        )}
      </label>
      {fileErr && <p className="error" role="alert">{fileErr}</p>}

      <label className="field">
        <span>Client name</span>
        <input value={client} maxLength={120} onChange={(e) => setClient(e.target.value)} placeholder="e.g. Ms. Ananya Menon" disabled={busy} />
      </label>
      <label className="field">
        <span>Title shown to the client</span>
        <input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Wedding proposal — February 2027" disabled={busy} />
      </label>
      <PasswordField
        id="viz-password"
        label="Password for the client"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        after={
          <div className="viz-pw-tools">
            <button type="button" className="link-btn" onClick={() => setPassword(generatePassword())} disabled={busy}>Generate a strong password</button>
            <small>At least 8 characters · case-sensitive</small>
          </div>
        }
      />
      <fieldset className="viz-expiry">
        <legend>Link stays active for</legend>
        {EXPIRY.map((n) => (
          <label key={n} className={days === n ? "is-on" : ""}>
            <input type="radio" name="expiry" value={n} checked={days === n} onChange={() => setDays(n)} disabled={busy} />
            {n} days
          </label>
        ))}
      </fieldset>

      {err && <p className="error" role="alert">{err}</p>}
      <button type="submit" className="btn-primary viz-submit" disabled={busy}>
        {busy ? (progress! < 1 ? `Uploading… ${Math.round(progress! * 100)}%` : "Preparing the viewer…") : "Create private link"}
      </button>
      {busy && (
        <div className="viz-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress! * 100)}>
          <span style={{ width: `${Math.max(4, progress! * 100)}%` }} />
        </div>
      )}
    </form>
  );
}

function ShareRow({ s, onDeleted, onError }: { s: Share; onDeleted: () => void; onError: (e: unknown) => ApiError }) {
  const { copied, copy } = useCopy();
  const [busy, setBusy] = useState(false);
  async function revoke() {
    if (!confirm(`Revoke the link for ${s.client}? They lose access straight away, and the uploaded file is deleted.`)) return;
    setBusy(true);
    try {
      await api(`shares?id=${s.id}`, { method: "DELETE" });
      onDeleted();
    } catch (e) {
      alert(onError(e).message);
      setBusy(false);
    }
  }
  return (
    <li className={`viz-share ${s.expired ? "is-expired" : ""}`}>
      <span className={`export-ic ${s.kind === "pdf" ? "export-ic-pdf" : s.kind === "page" ? "export-ic-web" : ""}`} aria-hidden>{s.kind === "pdf" ? "PDF" : s.kind === "page" ? "WEB" : "XLS"}</span>
      <div className="viz-share-body">
        <strong>{s.client}</strong>
        <span className="viz-share-title">{s.title}</span>
        <span className="viz-share-meta">
          <span className={`viz-chip ${s.expired ? "is-off" : ""}`}>{s.expired ? "Expired" : `Active until ${when(s.expiresAt)}`}</span>
          {s.kind === "pdf" ? `${s.pages} page${s.pages === 1 ? "" : "s"}` : s.kind === "page" ? "Web page" : `${s.sheets} sheet${s.sheets === 1 ? "" : "s"}`} · {s.views} view{s.views === 1 ? "" : "s"}
          {s.lastViewedAt ? ` · last opened ${when(s.lastViewedAt)}` : " · not opened yet"}
        </span>
        {s.decision && <ClientAnswer d={s.decision} />}
      </div>
      <div className="viz-share-tools">
        {!s.expired && <button className="btn-ghost btn-sm" onClick={() => copy("link", shareLink(s.token))}>{copied ? "Copied ✓" : "Copy link"}</button>}
        <button className="link-btn link-danger" onClick={revoke} disabled={busy}>{busy ? "Revoking…" : "Revoke"}</button>
      </div>
    </li>
  );
}
