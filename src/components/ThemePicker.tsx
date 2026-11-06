import { useId } from "react";
import { THEMES, type ThemeId } from "../state/appearance";

/** The site's themes as a row of swatches, for choosing how a shared web page looks. */
export default function ThemePicker({ value, onChange, label = "Page theme", disabled = false }: { value: ThemeId; onChange: (t: ThemeId) => void; label?: string; disabled?: boolean }) {
  // each picker is its own radio group, even when the preview's picker sits over the Review step's
  const name = useId();
  return (
    <fieldset className="theme-pick" disabled={disabled}>
      <legend>{label}</legend>
      {THEMES.map((t) => (
        <label key={t.id} className={t.id === value ? "is-on" : ""}>
          <input type="radio" name={name} value={t.id} checked={t.id === value} onChange={() => onChange(t.id)} />
          <span className="theme-pick-chips" aria-hidden>
            {t.swatch.map((c) => (
              <i key={c} style={{ background: c }} />
            ))}
          </span>
          {t.label}
        </label>
      ))}
    </fieldset>
  );
}
