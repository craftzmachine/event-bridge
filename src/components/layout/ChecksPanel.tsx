// The Checks panel: safety and clearance issues in the plan (src/lib/safety.ts). Clicking one selects and shows its
// items; Fix applies the suggested change as one undoable edit.
import type { Issue } from "../../lib/safety";
import { AISLE_MIN, ENTRANCE_CLEAR, STAGE_GAP_MIN, TABLE_GAP_MIN } from "../../lib/safety";

export default function ChecksPanel({ issues, onShow, onFix, onClose }: { issues: Issue[]; onShow: (i: Issue) => void; onFix: (i: Issue) => void; onClose: () => void }) {
  const warn = issues.filter((i) => i.level === "warn");
  return (
    <section className="rounded-lg border border-line bg-card p-4" aria-label="Safety and clearance checks">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="m-0 mr-auto text-sm font-medium text-ink-2">Checks <span className="text-xs text-stone">· {warn.length ? `${warn.length} to look at` : "all clear"}</span></h3>
        <button type="button" className="link-btn text-xs" onClick={onClose}>Hide</button>
      </div>
      {issues.length ? (
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {issues.map((i) => (
            <li key={i.id} className={`rounded-sm border border-solid px-2.5 py-2 text-xs ${i.level === "warn" ? "border-danger-line bg-danger-soft text-danger-ink" : "border-line bg-paper text-ink-2"}`}>
              <p className="m-0">{i.level === "warn" ? "⚠ " : "ℹ "}{i.text}</p>
              {(i.itemIds.length > 0 || i.fix) && (
                <div className="mt-1.5 flex gap-3">
                  {i.itemIds.length > 0 && <button type="button" className="link-btn text-xs" onClick={() => onShow(i)}>Show</button>}
                  {i.fix && <button type="button" className="link-btn text-xs" onClick={() => onFix(i)}>{i.fix.label}</button>}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-xs text-ink-2">Aisles, gaps between tables, space at the stage and entrance, and how crowded the room is all look fine.</p>
      )}
      <p className="m-0 mt-2 text-[11px] text-stone">
        Planning guidance (aisles {AISLE_MIN} m, {TABLE_GAP_MIN} m between chairs, {STAGE_GAP_MIN} m at the stage, {ENTRANCE_CLEAR} m at entrances), not a fire code. The venue's own rules come first.
      </p>
    </section>
  );
}
