import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { Proposal } from "../types";
import { useConfig } from "../config/context";
import type { useProposals } from "../state/proposals";
import { THEMES, useAppearance, type ThemeId } from "../state/appearance";
import { api, ApiError, upload } from "../lib/api";
import { EXPIRY_DAYS, generatePassword, shareLink, shortDate, type Share } from "../lib/shares";
import { mergePortalAnswers, portalBytes, portalSnapshot, PORTAL_MAX_BYTES } from "../lib/portal";
import { completeness } from "../lib/questionnaires";
import { eventsFor } from "../lib/events";
import { formatDates, todayISO } from "../lib/format";
import { eventDates, proposalTitle } from "../lib/proposal";
import PageHeader from "../components/PageHeader";
import PasswordField from "../components/PasswordField";
import ShareResult, { useCopy } from "../components/ShareResult";
import ClientAnswer from "../components/ClientAnswer";

type Store = ReturnType<typeof useProposals>;

/** the theme the planner chose for this proposal's shared page, else the planner's own */
const themeFor = (p: Proposal, fallback: ThemeId): ThemeId => (THEMES.some((t) => t.id === p.pageTheme) ? (p.pageTheme as ThemeId) : fallback);
type Access = "checking" | "ok" | "signin" | "setup" | "offline";

/** The family's portal share: the one recorded on the proposal, or the newest portal made from it. */
const portalOf = (p: Proposal, shares: Share[]) =>
  (p.portalShareId ? shares.find((s) => s.id === p.portalShareId) : undefined) ??
  shares.filter((s) => s.kind === "portal" && s.proposalId === p.id).sort((a, b) => b.createdAt - a.createdAt)[0];

/** Brings answers the families gave in their portals into the proposals' questionnaires. */
export function syncPortalAnswers(store: Store, shares: Share[]) {
  for (const p of store.list) {
    const s = portalOf(p, shares);
    if (s?.answers && mergePortalAnswers(p, s.answers)) store.update(p.id, (cur) => mergePortalAnswers(cur, s.answers) ?? cur);
  }
}

/**
 * #/portal: every family's client portal. One private, password-protected page per wedding with their proposal
 * (to approve or ask for changes), their to-dos, the payment schedule and their questionnaires. Refresh sends the
 * latest of all of these to the same link and password; the families' answers come back into Event Bridge.
 */
export default function Portal({ store, onReauth }: { store: Store; onReauth: () => void }) {
  const [access, setAccess] = useState<Access>("checking");
  const [shares, setShares] = useState<Share[]>([]);
  const [creating, setCreating] = useState<Proposal | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const { catalog, brand } = useConfig();
  const { theme } = useAppearance();
  const { copied, copy } = useCopy();
  const today = todayISO();
  const events = eventsFor(store.list, "all", today).filter((p) => p.status !== "lost");

  const fail = useCallback((e: unknown) => {
    const err = e as ApiError;
    if (err.status === 401) setAccess("signin");
    else if (err.status === 503) setAccess("setup");
    else if (err.status === 0) setAccess("offline");
    else setMsg(err.message || "Something went wrong.");
  }, []);

  const refresh = useCallback(() => {
    api<{ shares: Share[] }>("shares")
      .then((r) => {
        setShares(r.shares);
        setAccess("ok");
      })
      .catch(fail);
  }, [fail]);
  useEffect(refresh, [refresh]);

  // the families' answers come back into the proposals
  useEffect(() => {
    if (shares.length) syncPortalAnswers(store, shares);
  }, [shares]);

  async function update(p: Proposal, s: Share) {
    const snapshot = portalSnapshot(p, catalog, brand, themeFor(p, theme), today);
    if (portalBytes(snapshot) > PORTAL_MAX_BYTES) return setMsg("This portal is too large to share. Remove some questionnaires or tasks and try again.");
    setBusy(s.id);
    setMsg("");
    try {
      const form = new FormData();
      form.set("portal", JSON.stringify(snapshot));
      await upload<{ share: Share }>(`shares?id=${s.id}`, form, () => {}, "PUT");
      setMsg(`${p.client.name || "The family"}'s portal now shows the latest proposal, to-dos, payments and questionnaires.`);
      refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
    }
  }

  async function revoke(p: Proposal, s: Share) {
    if (!confirm(`Turn off ${p.client.name || "this family"}'s portal? The link stops working straight away.`)) return;
    try {
      await api(`shares?id=${s.id}`, { method: "DELETE" });
      store.update(p.id, (cur) => ({ ...cur, portalShareId: undefined }));
      refresh();
    } catch (e) {
      fail(e);
    }
  }

  return (
    <div className="ev-page">
      <PageHeader help="portal"
        crumbs={[{ label: "Dashboard", href: "#/dashboard" }, { label: "Client Portal" }]}
        title="Client portals"
        subtitle="One private page per family: their proposal to approve, their to-dos, payments and questionnaires."
      />
      <main className="ev-main">
        {access === "checking" && <p className="hint" role="status">Checking your access…</p>}
        {access === "signin" && (
          <div className="viz-notice" role="alert">
            <strong>Please sign in again</strong>
            <p>Portals need a fresh sign-in on this device, so the server can confirm it's you.</p>
            <button className="btn-primary" onClick={onReauth}>Sign in again</button>
          </div>
        )}
        {access === "setup" && (
          <div className="viz-notice" role="alert">
            <strong>Sharing isn't set up on this site yet</strong>
            <p>Client portals use the same secure links as Visualize Proposal. The steps are in the README under “Visualize Proposal”.</p>
          </div>
        )}
        {access === "offline" && (
          <div className="viz-notice" role="alert">
            <strong>Can't reach the sharing service</strong>
            <p>Check the connection and try again.</p>
            <button className="btn-ghost" onClick={refresh}>Try again</button>
          </div>
        )}
        {msg && <p className="toast" role="status">{msg}</p>}

        {access === "ok" &&
          (events.length === 0 ? (
            <div className="empty-state"><p>No weddings yet. Accepted and dated proposals appear here.</p></div>
          ) : (
            <ul className="pt-list">
              {events.map((p) => {
                const s = portalOf(p, shares);
                const live = s && !s.expired;
                const qs = p.questionnaires ?? [];
                const answered = qs.filter((q) => completeness(q).answered > 0).length;
                return (
                  <li key={p.id} className="dash-card pt-card">
                    <div className="dash-section-head">
                      <div>
                        <h2>{p.client.name || "Untitled client"}</h2>
                        <p className="hint">{[proposalTitle(p, catalog), eventDates(p).length ? formatDates(eventDates(p)) : "date to be confirmed"].filter(Boolean).join(" · ")}</p>
                      </div>
                      <div className="dash-section-tools">
                        {live ? (
                          <>
                            <button type="button" className="btn-ghost btn-sm" onClick={() => copy(s.id, shareLink(s.token))}>{copied === s.id ? "Copied" : "Copy link"}</button>
                            <button type="button" className="btn-ghost btn-sm" disabled={busy === s.id} onClick={() => update(p, s)}>{busy === s.id ? "Updating…" : "Update portal"}</button>
                            <button type="button" className="link-btn link-danger" onClick={() => revoke(p, s)}>Turn off</button>
                          </>
                        ) : (
                          <button type="button" className="btn-primary btn-sm" onClick={() => setCreating(p)}>{s ? "Create a new portal" : "Create portal"}</button>
                        )}
                      </div>
                    </div>
                    {s && (
                      <p className="pt-status">
                        {s.expired ? "Expired" : `Active until ${shortDate(s.expiresAt)}`} · opened {s.views} time{s.views === 1 ? "" : "s"}
                        {s.lastViewedAt ? `, last ${shortDate(s.lastViewedAt)}` : ""}
                        {s.updatedAt ? ` · updated ${shortDate(s.updatedAt)}` : ""}
                        {qs.length ? ` · ${answered} of ${qs.length} questionnaire${qs.length === 1 ? "" : "s"} answered` : ""}
                      </p>
                    )}
                    {s?.decision && <ClientAnswer d={s.decision} />}
                    <p className="pt-has">
                      Shows: the proposal · {(p.checklist ?? []).filter((i) => i.owner === "client").length} family to-dos · payment schedule · {qs.length} questionnaire{qs.length === 1 ? "" : "s"}
                      {" · "}
                      <a className="link-btn" href={`#/events/${p.id}`}>Open the event</a>
                    </p>
                  </li>
                );
              })}
            </ul>
          ))}
      </main>
      {creating && (
        <CreatePortal
          p={creating}
          onCreated={(s) => {
            store.update(creating.id, (cur) => ({ ...cur, portalShareId: s.id }));
            refresh();
          }}
          onReauth={onReauth}
          onClose={() => setCreating(null)}
        />
      )}
    </div>
  );
}

function CreatePortal({ p, onCreated, onReauth, onClose }: { p: Proposal; onCreated: (s: Share) => void; onReauth: () => void; onClose: () => void }) {
  const { catalog, brand } = useConfig();
  const { theme } = useAppearance();
  const ref = useRef<HTMLDialogElement>(null);
  const [client, setClient] = useState(p.client.name);
  const [password, setPassword] = useState(generatePassword);
  const [days, setDays] = useState<number>(90);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ share: Share; password: string } | null>(null);
  const [err, setErr] = useState<{ text: string; signIn?: boolean } | null>(null);
  // no close() on cleanup: it fires onClose, and React's dev double-run would dismiss the dialog
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!client.trim()) return setErr({ text: "Enter the family's name: it's shown on their portal and in the watermark." });
    if (password.length < 8) return setErr({ text: "Use a password of at least 8 characters, or generate one." });
    const snapshot = portalSnapshot(p, catalog, brand, themeFor(p, theme));
    if (portalBytes(snapshot) > PORTAL_MAX_BYTES) return setErr({ text: "This portal is too large to share. Remove some questionnaires or tasks and try again." });
    setBusy(true);
    try {
      const form = new FormData();
      form.set("portal", JSON.stringify(snapshot));
      form.set("client", client.trim());
      form.set("title", `${proposalTitle(p, catalog) || "Your wedding"}: your portal`);
      form.set("password", password);
      form.set("expiryDays", String(days));
      form.set("proposalId", p.id);
      const r = await upload<{ share: Share }>("shares", form, () => {});
      onCreated(r.share);
      setDone({ share: r.share, password });
    } catch (ex) {
      const e2 = ex as ApiError;
      if (e2.status === 401) setErr({ text: "Portals need a fresh sign-in on this device.", signIn: true });
      else if (e2.status === 503) setErr({ text: "Sharing isn't set up on this site yet. The steps are in the README under “Visualize Proposal”." });
      else if (e2.status === 0) setErr({ text: "Can't reach the sharing service. Check the connection and try again." });
      else setErr({ text: e2.message || "The portal couldn't be created." });
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <dialog ref={ref} className="venue-dialog xi share-dialog" onClose={onClose} onCancel={(e) => busy && e.preventDefault()} aria-labelledby="portal-title">
      <header className="xi-head">
        <h2 id="portal-title">{done ? "Ready to send" : `Create ${p.client.name || "the family"}'s portal`}</h2>
        <button className="vd-close" onClick={onClose} aria-label="Close" disabled={busy}>×</button>
      </header>
      {done ? (
        <div className="xi-body">
          <ShareResult share={done.share} password={done.password} contact={p.client.contact} actions={<button className="btn-primary" onClick={onClose}>Done</button>} />
        </div>
      ) : (
        <form className="xi-body" onSubmit={submit} noValidate>
          <p className="xi-lede">
            The family opens the link, enters the password, and sees their proposal (to approve or ask for changes), the to-dos from the
            checklist marked for the family, the payment schedule and any questionnaires. Their answers come back here. Use “Update portal”
            later to send them the latest, with the same link and password.
          </p>
          <label className="field">
            <span>Family name</span>
            <input value={client} maxLength={120} onChange={(e) => setClient(e.target.value)} disabled={busy} />
          </label>
          <PasswordField
            id="portal-password"
            label="Password for the family"
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
            <legend>Portal stays open for</legend>
            {EXPIRY_DAYS.map((n) => (
              <label key={n} className={days === n ? "is-on" : ""}>
                <input type="radio" name="portal-expiry" value={n} checked={days === n} onChange={() => setDays(n)} disabled={busy} />
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
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Create portal"}</button>
          </div>
        </form>
      )}
    </dialog>,
    document.body,
  );
}
