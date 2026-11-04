import { useState, type ReactNode } from "react";

/** Password input with a Show/Hide toggle, matching the Event Bridge sign-in. */
export default function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete = "off",
  invalid = false,
  describedBy,
  autoFocus = false,
  after,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
  after?: ReactNode;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="pw-wrap">
        <input
          id={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          value={value}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="pw-toggle" aria-controls={id} aria-pressed={show} aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((s) => !s)}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
            {show && <path d="M4 4l16 16" />}
          </svg>
          <span>{show ? "Hide" : "Show"}</span>
        </button>
      </div>
      {after}
    </div>
  );
}
