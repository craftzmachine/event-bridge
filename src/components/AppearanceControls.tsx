import { useEffect, useRef, useState } from "react";
import { FONTS, THEMES, useAppearance } from "../state/appearance";

/** Theme menu + font button. `onDark` styles them for the espresso hero/login panels. */
export default function AppearanceControls({ onDark = false }: { onDark?: boolean }) {
  const { theme, font, nextFont, setTheme, cycleFont } = useAppearance();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const current = THEMES.find((t) => t.id === theme)!;
  const fontLabel = FONTS.find((f) => f.id === font)!.label;
  return (
    <div className={`appearance ${onDark ? "on-dark" : ""}`} ref={ref}>
      <button
        className="ap-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title="Theme"
      >
        <span className="ap-swatch" aria-hidden style={{ background: `linear-gradient(135deg, ${current.swatch[0]} 50%, ${current.swatch[1]} 50%)` }} />
        <span className="ap-label">{current.label}</span>
      </button>
      <button className="ap-btn" onClick={cycleFont} title={`Font: ${fontLabel} — switch to ${nextFont.label}`} aria-label={`Font: ${fontLabel}. Switch to ${nextFont.label}`}>
        <span className="ap-aa" aria-hidden>Aa</span>
        <span className="ap-label">{fontLabel}</span>
      </button>
      {open && (
        <div className="ap-menu" role="menu" aria-label="Theme">
          {THEMES.map((t) => (
            <button
              key={t.id}
              role="menuitemradio"
              aria-checked={t.id === theme}
              className={t.id === theme ? "is-on" : ""}
              onClick={() => {
                setTheme(t.id);
                setOpen(false);
              }}
            >
              <span className="ap-chips" aria-hidden>
                {t.swatch.map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
              </span>
              {t.label}
              {t.id === theme && <span className="ap-tick" aria-hidden>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
