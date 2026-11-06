import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useConfig } from "../config/context";
import { SITE } from "../site";
import { ApiError, api, formatRetry, pageBitmap } from "../lib/api";
import { capturePlatform, isCaptureShortcut } from "../lib/capture";
import PasswordField from "../components/PasswordField";
import AppearanceControls from "../components/AppearanceControls";
import { shortDate, type ShareDecision } from "../lib/shares";

const COMMENT_MAX = 1000; // the server keeps the first 1,000 characters

interface GridCell { v: string; b?: 1; i?: 1; fg?: string; bg?: string; al?: "left" | "center" | "right"; cs?: number; rs?: number; w?: 1 }
interface GridSheet { name: string; cols: number[]; rows: { h?: number; cells: (GridCell | null)[] }[]; truncated?: 1 }
interface Doc {
  client: string;
  title: string;
  kind: "pdf" | "xlsx";
  expiresAt: number;
  sessionEndsAt: number;
  pages?: { w: number; h: number }[];
  grid?: { sheets: GridSheet[] };
  /** the client's earlier answer, if any */
  decision?: ShareDecision | null;
}

type Phase = "link" | "gate" | "loading" | "view" | "gone" | "offline";

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const idKey = (token: string) => `pb.view.${token}`;
const readId = (token: string) => {
  try {
    return sessionStorage.getItem(idKey(token));
  } catch {
    return null;
  }
};
const writeId = (token: string, id: string | null) => {
  try {
    if (id) sessionStorage.setItem(idKey(token), id);
    else sessionStorage.removeItem(idKey(token));
  } catch {
    /* private mode: the client enters the password again after a reload */
  }
};

/** Public route #/view/<token>: password gate, then a view-only render of the shared proposal. */
export default function ClientView({ token }: { token?: string }) {
  const { brand } = useConfig();
  const valid = !!token && TOKEN.test(token);
  const [phase, setPhase] = useState<Phase>(valid ? "loading" : "link");
  const [doc, setDoc] = useState<Doc | null>(null);
  const [id, setId] = useState<string | null>(valid ? readId(token) : null);
  const [notice, setNotice] = useState(token && !valid ? "That link looks incomplete. Copy the whole link from your message and try again." : "");

  const ended = useCallback(
    (msg: string) => {
      if (token) writeId(token, null);
      setId(null);
      setDoc(null);
      setNotice(msg);
      setPhase("gate");
    },
    [token],
  );

  const fail = useCallback(
    (e: unknown) => {
      const err = e as ApiError;
      if (err.status === 401) ended(err.message);
      else {
        setNotice(err.message);
        setPhase(err.status === 410 || err.status === 404 ? "gone" : "offline");
      }
    },
    [ended],
  );

  useEffect(() => {
    if (!valid) return;
    if (!id) {
      setPhase("gate");
      return;
    }
    setPhase("loading");
    api<Doc>(`view/doc?id=${id}`)
      .then((d) => {
        setDoc(d);
        setPhase("view");
      })
      .catch(fail);
  }, [valid, id, fail]);

  // the server ends the session after 2 hours; reflect that without waiting for the next request
  useEffect(() => {
    if (!doc) return;
    const t = setTimeout(() => ended("Your viewing session has ended. Enter the password again to continue."), Math.max(0, doc.sessionEndsAt - Date.now()));
    return () => clearTimeout(t);
  }, [doc, ended]);

  async function signOut() {
    try {
      await api("view/lock", { method: "POST" });
    } catch {
      /* the session expires on the server anyway */
    }
    ended("You've signed out. Enter the password to open the proposal again.");
  }

  const logo = `${import.meta.env.BASE_URL}${brand.logo}`;
  if (phase === "view" && doc && id) return <Viewer doc={doc} id={id} logo={logo} company={brand.company} onSignOut={signOut} onFail={fail} />;

  return (
    <div className="cv-gate-page">
      <header className="cv-gate-top">
        <a href="#/" className="cv-home" aria-label={`${SITE.name} home`}>
          <img src={logo} alt="" />
          <span>{SITE.name}</span>
        </a>
        <AppearanceControls />
      </header>
      <main className="cv-gate-main">
        {phase === "link" && <LinkForm notice={notice} />}
        {phase === "gate" && token && (
          <Gate
            token={token}
            notice={notice}
            onUnlocked={(newId) => {
              writeId(token, newId);
              setNotice("");
              setId(newId);
            }}
          />
        )}
        {phase === "loading" && (
          <div className="cv-card" role="status">
            <span className="cv-spinner" aria-hidden />
            <p>Opening your proposal…</p>
          </div>
        )}
        {phase === "gone" && (
          <div className="cv-card" role="alert">
            <p className="eyebrow">Access ended</p>
            <h1>This proposal isn't available</h1>
            <p className="login-sub">{notice}</p>
            <p className="hint">Contact {brand.contact.name} at <a href={`mailto:${brand.contact.email}`}>{brand.contact.email}</a> for a new link.</p>
          </div>
        )}
        {phase === "offline" && (
          <div className="cv-card" role="alert">
            <p className="eyebrow">Connection problem</p>
            <h1>We couldn't open the proposal</h1>
            <p className="login-sub">{notice}</p>
            <button className="btn-primary" onClick={() => location.reload()}>Try again</button>
          </div>
        )}
      </main>
      <p className="login-foot">© {new Date().getFullYear()} {SITE.name} · {brand.legalName} · {brand.company}</p>
    </div>
  );
}

function LinkForm({ notice }: { notice: string }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState(notice);
  function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim().match(/#\/view\/([A-Za-z0-9_-]{43})/)?.[1] ?? (TOKEN.test(text.trim()) ? text.trim() : "");
    if (!t) return setErr("Paste the full link you received — it ends with a long code after “#/view/”.");
    location.hash = `/view/${t}`;
  }
  return (
    <form className="cv-card" onSubmit={submit} noValidate>
      <p className="eyebrow">Visualize Proposal</p>
      <h1>Open a shared proposal</h1>
      <p className="login-sub">Your planner sent you a private link and, separately, a password. Paste the link here to continue.</p>
      {err && <div className="login-error" role="alert"><span aria-hidden>!</span><p>{err}</p></div>}
      <label className="field">
        <span>Proposal link</span>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="https://…/#/view/…" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus />
      </label>
      <button type="submit" className="btn-primary login-submit">Continue</button>
    </form>
  );
}

function Gate({ token, notice, onUnlocked }: { token: string; notice: string; onUnlocked: (id: string) => void }) {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [lockedFor, setLockedFor] = useState(0);

  useEffect(() => {
    if (lockedFor <= 0) return;
    const t = setTimeout(() => setLockedFor((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [lockedFor]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || lockedFor > 0) return;
    if (!password) return setErr("Enter the password you were given.");
    setBusy(true);
    setErr("");
    try {
      onUnlocked((await api<{ id: string }>("view/unlock", { json: { token, password } })).id);
    } catch (ex) {
      const e2 = ex as ApiError;
      setPassword("");
      if (e2.status === 429) setLockedFor(e2.retryAfter ?? 60);
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  const message = lockedFor > 0 ? `Too many incorrect passwords. Try again in ${formatRetry(lockedFor)}.` : err;
  return (
    <form className="cv-card" onSubmit={submit} noValidate>
      <p className="eyebrow">Private proposal</p>
      <h1>Enter your password</h1>
      <p className="login-sub">This proposal was shared with you privately. Enter the password your planner gave you to view it.</p>
      {notice && !message && <p className="toast" role="status">{notice}</p>}
      {message && (
        <div className="login-error" role="alert" id="cv-error">
          <span aria-hidden>!</span>
          <p>{message}</p>
        </div>
      )}
      <PasswordField id="cv-password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" invalid={!!message} describedBy={message ? "cv-error" : undefined} autoFocus />
      <button type="submit" className="btn-primary login-submit" disabled={busy || lockedFor > 0}>
        {busy ? "Checking…" : lockedFor > 0 ? `Try again in ${formatRetry(lockedFor)}` : "View proposal"}
      </button>
      <p className="login-help">Passwords are case-sensitive. The proposal can be viewed here but not downloaded or printed.</p>
    </form>
  );
}

/**
 * Best-effort view-only mode: blocks the context menu, dragging, selection/copy and the print and save
 * shortcuts, and blanks the page in print. Screenshot shortcuts the page can see (Print Screen, ⌘⇧3/4/5)
 * show the "Screen capture blocked" popup; when the window loses focus or the app is switched away — which
 * is what Snipping Tool and mobile app switching cause — the proposal is hidden until the client returns.
 * None of this can stop every screenshot or a phone camera (see src/lib/capture.ts).
 */
function useViewOnly(root: React.RefObject<HTMLElement>, onBlocked: (msg: string) => void, onCapture: () => void, onAway: (away: boolean) => void) {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("pb-view-only");
    const el = root.current;
    const stop = (e: Event) => e.preventDefault();
    const keys = (e: KeyboardEvent) => {
      if (isCaptureShortcut(e)) {
        e.preventDefault();
        onCapture();
        return;
      }
      const k = e.key.toLowerCase();
      if (e.type === "keydown" && (e.ctrlKey || e.metaKey) && (k === "p" || k === "s")) {
        e.preventDefault();
        e.stopPropagation();
        onBlocked(k === "p" ? "Printing is turned off for this proposal." : "Saving is turned off for this proposal.");
      }
    };
    const beforePrint = () => html.classList.add("pb-printing");
    const afterPrint = () => html.classList.remove("pb-printing");
    const away = () => onAway(true);
    const back = () => onAway(false);
    const visibility = () => onAway(document.visibilityState === "hidden");
    el?.addEventListener("contextmenu", stop);
    el?.addEventListener("dragstart", stop);
    el?.addEventListener("copy", stop);
    // Chrome and Edge on Windows only deliver Print Screen as a keyup
    window.addEventListener("keydown", keys, true);
    window.addEventListener("keyup", keys, true);
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    window.addEventListener("blur", away);
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      html.classList.remove("pb-view-only", "pb-printing");
      el?.removeEventListener("contextmenu", stop);
      el?.removeEventListener("dragstart", stop);
      el?.removeEventListener("copy", stop);
      window.removeEventListener("keydown", keys, true);
      window.removeEventListener("keyup", keys, true);
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
      window.removeEventListener("blur", away);
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [root, onBlocked, onCapture, onAway]);
}

function Viewer({ doc, id, logo, company, onSignOut, onFail }: { doc: Doc; id: string; logo: string; company: string; onSignOut: () => void; onFail: (e: unknown) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState("");
  const [zoom, setZoom] = useState(1);
  const [sheet, setSheet] = useState(0);
  const [captured, setCaptured] = useState(false);
  const [away, setAway] = useState(false);
  const mobile = useMemo(() => ["android", "ios"].includes(capturePlatform()), []);
  const blocked = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  }, []);
  const onCapture = useCallback(() => {
    // blank the page briefly and replace what Print Screen copied, then say so, WhatsApp-style
    setCaptured(true);
    setTimeout(() => setCaptured(false), 2200);
    navigator.clipboard?.writeText("Screen capture is blocked for this proposal.").catch(() => {});
  }, []);
  useViewOnly(root, blocked, onCapture, setAway);
  const [decision, setDecision] = useState<ShareDecision | null>(doc.decision ?? null);

  const endsAt = new Date(doc.sessionEndsAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return (
    <div className={`cv-viewer ${captured || away ? "is-shielded" : ""}`} ref={root}>
      <header className="cv-bar">
        <img className="cv-bar-logo" src={logo} alt={company} />
        <div className="cv-bar-title">
          <span className="eyebrow">Prepared for {doc.client}</span>
          <strong>{doc.title}</strong>
        </div>
        <div className="cv-bar-tools">
          {doc.kind === "pdf" && (
            <div className="cv-zoom" role="group" aria-label="Zoom">
              <button className="btn-ghost btn-sm" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))} aria-label="Zoom out" disabled={zoom <= 0.6}>−</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button className="btn-ghost btn-sm" onClick={() => setZoom((z) => Math.min(2, +(z + 0.2).toFixed(1)))} aria-label="Zoom in" disabled={zoom >= 2}>+</button>
            </div>
          )}
          <span className="cv-session hide-phone">View-only · session ends {endsAt}</span>
          <button className="btn-ghost btn-sm" onClick={() => document.getElementById("cv-respond")?.scrollIntoView({ behavior: "smooth", block: "end" })}>
            {decision?.kind === "approved" ? "Approved ✓" : "Respond"}
          </button>
          <button className="btn-primary btn-sm" onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      <main className="cv-stage">
        {doc.kind === "pdf" && doc.pages ? (
          <div className="cv-pages" style={{ ["--zoom" as string]: zoom }}>
            {doc.pages.map((p, n) => (
              <PageCanvas key={n} id={id} n={n} w={p.w} h={p.h} total={doc.pages!.length} onFail={onFail} />
            ))}
          </div>
        ) : doc.grid ? (
          <>
            {doc.grid.sheets.length > 1 && (
              <div className="tabs cv-sheet-tabs" role="tablist" aria-label="Sheets">
                {doc.grid.sheets.map((s, i) => (
                  <button key={s.name} role="tab" aria-selected={sheet === i} className={sheet === i ? "is-on" : ""} onClick={() => setSheet(i)}>{s.name}</button>
                ))}
              </div>
            )}
            <SheetView s={doc.grid.sheets[sheet]} />
          </>
        ) : null}
        <Watermark text={`${doc.client} · Confidential`} />
        <Respond id={id} decision={decision} onAnswered={setDecision} onFail={onFail} />
      </main>
      {toast && <p className="cv-toast" role="status">{toast}</p>}
      {captured && (
        <div className="cv-capture" role="alert">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.5-2h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
            <circle cx="12" cy="13" r="3.2" />
            <path d="M3 3l18 18" />
          </svg>
          <span>
            <strong>Screen capture blocked</strong>
            <small>Screenshots aren't allowed for this proposal.</small>
          </span>
        </div>
      )}
      {away && !captured && (
        <div className="cv-away" aria-live="polite">
          <strong>Proposal hidden</strong>
          <span>{mobile ? "It reappears when you return to this page." : "It reappears when this window is active again — click here to continue."}</span>
        </div>
      )}
      <div className="cv-print-block" aria-hidden>Printing is turned off for this proposal.</div>
    </div>
  );
}

/**
 * The end of the proposal: the client approves it or tells their planner what to change. The answer is saved
 * on the server (POST /api/view/respond) and shown to the team in Visualize Proposal and Proposal Studio.
 */
function Respond({ id, decision, onAnswered, onFail }: { id: string; decision: ShareDecision | null; onAnswered: (d: ShareDecision) => void; onFail: (e: unknown) => void }) {
  const [mode, setMode] = useState<"ask" | "changes">(decision?.kind === "changes" ? "changes" : "ask");
  const [comment, setComment] = useState(decision?.comment ?? "");
  const [editing, setEditing] = useState(!decision);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [thanks, setThanks] = useState(false);

  async function send(kind: ShareDecision["kind"]) {
    if (kind === "changes" && !comment.trim()) return setErr("Tell your planner what you'd like changed.");
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ decision: ShareDecision }>(`view/respond?id=${id}`, { json: { kind, comment: kind === "changes" ? comment.trim() : "" } });
      onAnswered(r.decision);
      setEditing(false);
      setThanks(true);
    } catch (ex) {
      const e2 = ex as ApiError;
      if (e2.status === 401 || e2.status === 410) onFail(ex);
      else setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="cv-respond" className="cv-respond" aria-labelledby="cv-respond-title">
      {!editing && decision ? (
        <div className="cv-respond-done" aria-live="polite">
          <h2 id="cv-respond-title">{decision.kind === "approved" ? "You approved this proposal" : "You asked for changes"}</h2>
          {thanks && <p>Thank you — your planner has been told.</p>}
          {decision.comment && <blockquote>{decision.comment}</blockquote>}
          <p className="hint">
            Sent {shortDate(decision.at)}.{" "}
            <button className="link-btn" onClick={() => { setEditing(true); setThanks(false); setMode(decision.kind === "changes" ? "changes" : "ask"); }}>
              Change your answer
            </button>
          </p>
        </div>
      ) : (
        <>
          <h2 id="cv-respond-title">Happy with the proposal?</h2>
          <p>Approve it, or tell your planner what you'd like changed. They'll be in touch either way.</p>
          {mode === "changes" && (
            <label className="field cv-respond-comment">
              <span>What would you like changed?</span>
              <textarea rows={4} maxLength={COMMENT_MAX} value={comment} onChange={(e) => setComment(e.target.value)} autoFocus disabled={busy} />
              <small className="hint">{comment.length}/{COMMENT_MAX}</small>
            </label>
          )}
          {err && <p className="error" role="alert">{err}</p>}
          <div className="cv-respond-actions">
            {mode === "ask" ? (
              <>
                <button className="btn-primary" onClick={() => send("approved")} disabled={busy}>{busy ? "Sending…" : "Approve proposal"}</button>
                <button className="btn-ghost" onClick={() => setMode("changes")} disabled={busy}>Request changes</button>
              </>
            ) : (
              <>
                <button className="btn-primary" onClick={() => send("changes")} disabled={busy}>{busy ? "Sending…" : "Send to my planner"}</button>
                <button className="btn-ghost" onClick={() => { setMode("ask"); setErr(""); }} disabled={busy}>Back</button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/** Draws the page image onto a canvas when it scrolls into view, so there's no <img> to save or drag. */
function PageCanvas({ id, n, w, h, total, onFail }: { id: string; n: number; w: number; h: number; total: number; onFail: (e: unknown) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    let cancelled = false;
    const io = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        setState("loading");
        try {
          const bmp = await pageBitmap(id, n);
          if (cancelled) return bmp.close();
          c.getContext("2d")?.drawImage(bmp, 0, 0, w, h);
          bmp.close();
          setState("done");
        } catch (e) {
          if (cancelled) return;
          setState("error");
          if ((e as ApiError).status === 401 || (e as ApiError).status === 410) onFail(e);
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(c);
    return () => {
      cancelled = true;
      io.disconnect();
      c.getContext("2d")?.clearRect(0, 0, w, h);
    };
  }, [id, n, w, h, onFail]);
  return (
    <figure className={`cv-page is-${state}`} style={{ aspectRatio: `${w} / ${h}` }} aria-label={`Page ${n + 1} of ${total}`}>
      <canvas ref={ref} width={w} height={h} />
      {state !== "done" && <span className="cv-page-state">{state === "error" ? "This page couldn't load. Scroll away and back to retry." : `Loading page ${n + 1}…`}</span>}
    </figure>
  );
}

function SheetView({ s }: { s: GridSheet }) {
  return (
    <div className="cv-sheet-wrap">
      <table className="cv-sheet">
        <colgroup>
          {s.cols.map((w, i) => (
            <col key={i} style={{ width: w ? `${w}px` : 0, display: w ? undefined : "none" }} />
          ))}
        </colgroup>
        <tbody>
          {s.rows.map((r, ri) => (
            <tr key={ri} style={r.h ? { height: `${r.h}px` } : undefined}>
              {r.cells.map((c, ci) =>
                c === null ? null : (
                  <td
                    key={ci}
                    colSpan={c.cs}
                    rowSpan={c.rs}
                    className={c.w ? "is-wrap" : undefined}
                    style={{ fontWeight: c.b ? 600 : undefined, fontStyle: c.i ? "italic" : undefined, color: c.fg, background: c.bg, textAlign: c.al, display: s.cols[ci] === 0 ? "none" : undefined }}
                  >
                    {c.v}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {s.truncated && <p className="hint">This sheet is larger than the preview shows. Ask your planner for the full details.</p>}
    </div>
  );
}

function Watermark({ text }: { text: string }) {
  return (
    <div className="cv-watermark" aria-hidden>
      {Array.from({ length: 40 }, (_, i) => (
        <span key={i}>{text}</span>
      ))}
    </div>
  );
}
