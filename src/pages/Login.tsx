import { useEffect, useRef, useState, type FormEvent } from "react";
import { useConfig } from "../config/context";
import { checkCredentials } from "../auth/auth";
import { SITE } from "../site";
import Img from "../components/Img";
import Ornament from "../components/Ornament";
import AppearanceControls from "../components/AppearanceControls";

const MAX_TRIES = 5;
const LOCK_SECONDS = 30;

export default function Login({ onSignedIn }: { onSignedIn: (email: string) => void }) {
  const { brand, catalog } = useConfig();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [fails, setFails] = useState(0);
  const [lockedFor, setLockedFor] = useState(0);
  const pwRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (lockedFor <= 0) return;
    const t = setTimeout(() => setLockedFor((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [lockedFor]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (lockedFor > 0) return;
    if (!email.trim() || !password) {
      setError("Enter your email address and password.");
      return;
    }
    const account = checkCredentials(email, password);
    if (account) {
      onSignedIn(account);
      return;
    }
    const n = fails + 1;
    setFails(n);
    setPassword("");
    pwRef.current?.focus();
    if (n >= MAX_TRIES) {
      setFails(0);
      setLockedFor(LOCK_SECONDS);
      setError(`Too many unsuccessful attempts. Please wait ${LOCK_SECONDS} seconds and try again.`);
    } else {
      setError("That email and password don't match an authorised account. Passwords are case-sensitive — tap Show to check what you typed.");
    }
  }

  const logo = `${import.meta.env.BASE_URL}${brand.logo}`;
  return (
    <div className="login">
      <aside className="login-art">
        <Img src={catalog.eventTypes[0]?.image} alt="" className="login-art-img" />
        <div className="login-art-text">
          <img className="login-logo" src={logo} alt={`${brand.company} — ${brand.tagline}`} />
          <Ornament />
          <p className="eyebrow">{SITE.name}</p>
          <p className="login-art-line">{SITE.tagline}</p>
        </div>
      </aside>

      <main className="login-main">
        <a className="login-back" href="#/">
          <span aria-hidden>←</span> Back to home
        </a>
        <div className="login-appearance">
          <AppearanceControls />
        </div>
        <form className="login-card" onSubmit={submit} noValidate>
          <img className="login-logo-sm" src={logo} alt={brand.company} />
          <p className="eyebrow">Team access</p>
          <h1>Sign in</h1>
          <p className="login-sub">Use your {brand.company} team account to open {SITE.name} and its apps, including Proposal Studio.</p>

          {error && (
            <div className="login-error" role="alert" id="login-error">
              <span aria-hidden>!</span>
              <p>{lockedFor > 0 ? `Too many unsuccessful attempts. Try again in ${lockedFor}s.` : error}</p>
            </div>
          )}

          <label className="field">
            <span>Email address</span>
            <input
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              value={email}
              aria-invalid={!!error}
              aria-describedby={error ? "login-error" : undefined}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </label>

          <div className="field">
            <label htmlFor="login-password">Password</label>
            <div className="pw-wrap">
              <input
                id="login-password"
                ref={pwRef}
                type={show ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                // when shown as plain text, phone keyboards would otherwise capitalise or autocorrect it
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={password}
                aria-invalid={!!error}
                aria-describedby={error ? "login-error" : undefined}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="pw-toggle"
                aria-controls="login-password"
                aria-pressed={show}
                aria-label={show ? "Hide password" : "Show password"}
                onClick={() => setShow((s) => !s)}
              >
                <EyeIcon off={show} />
                <span>{show ? "Hide" : "Show"}</span>
              </button>
            </div>
          </div>

          <button type="submit" className="btn-primary login-submit" disabled={lockedFor > 0}>
            {lockedFor > 0 ? `Try again in ${lockedFor}s` : "Sign in"}
          </button>

          <p className="login-help">
            {/* Access is limited to authorised team members. Need help? Contact {brand.contact.name} at{" "} */}
            <a href={`mailto:${brand.contact.email}`}>{brand.contact.email}</a>.
          </p>
        </form>
        <p className="login-foot">© {new Date().getFullYear()} {SITE.name} · {brand.legalName} · {brand.company}</p>
      </main>
    </div>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}
