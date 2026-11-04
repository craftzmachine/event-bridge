import { useState } from "react";
import { formatDate } from "../lib/format";

/**
 * One or more event dates: pick a date and add it; each chosen date shows as a removable chip, sorted.
 * Picking the first date adds it straight away, so the common single-date case is still one step.
 */
export default function EventDatesField({ dates, onChange }: { dates: string[]; onChange: (dates: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = (iso: string) => {
    if (!iso) return;
    onChange([...new Set([...dates, iso])].sort());
    setDraft("");
  };
  return (
    <div className="field event-dates">
      <span className="field-label" id="event-dates-label">Event {dates.length > 1 ? "dates" : "date"}</span>
      {dates.length > 0 && (
        <ul className="date-chips" aria-labelledby="event-dates-label">
          {dates.map((iso) => (
            <li key={iso}>
              <span>{formatDate(iso)}</span>
              <button type="button" aria-label={`Remove ${formatDate(iso)}`} onClick={() => onChange(dates.filter((d) => d !== iso))}>×</button>
            </li>
          ))}
        </ul>
      )}
      <div className="date-add">
        <input
          type="date"
          aria-label={dates.length ? "Another event date" : "Event date"}
          value={draft}
          onChange={(e) => (dates.length ? setDraft(e.target.value) : add(e.target.value))}
        />
        {dates.length > 0 && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => add(draft)} disabled={!draft || dates.includes(draft)}>
            + Add date
          </button>
        )}
      </div>
      <small className="hint">{dates.length ? "Add more days for multi-day celebrations." : "Add one or more days."}</small>
    </div>
  );
}
