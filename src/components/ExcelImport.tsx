import { useEffect, useRef, useState } from "react";
import type { Proposal } from "../types";
import { useConfig } from "../config/context";
import { convertWorkbook, SKIP, type Answers, type ImportReport, type Question, type WorkbookGrid } from "../lib/excelImport";
import { computeTotals, lineAmount } from "../lib/totals";
import { formatDates, formatINR } from "../lib/format";
import { eventDates, groupLines, proposalTitle } from "../lib/proposal";
import { downloadJson } from "../state/proposals";
import EventDatesField from "./EventDatesField";

type Phase =
  | { at: "pick" }
  | { at: "reading"; name: string }
  | { at: "error"; message: string }
  | { at: "questions"; questions: Question[] }
  | { at: "preview"; proposal: Proposal; report: ImportReport };

/**
 * Create a proposal from an Excel file: read it, ask about anything missing or unclear,
 * show what will be created, then hand the proposal to the same import used for JSON backups.
 */
export default function ExcelImport({
  file,
  takenRefs,
  onCreate,
  onClose,
}: {
  /** a file already chosen (e.g. from the Import button); otherwise the dialog asks for one */
  file: File | null;
  takenRefs: string[];
  onCreate: (p: Proposal) => void;
  onClose: () => void;
}) {
  const { catalog, brand } = useConfig();
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ at: "pick" });
  const [book, setBook] = useState<WorkbookGrid | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [asked, setAsked] = useState<Question[]>([]); // every question so far, so answers can be changed
  const [drag, setDrag] = useState(false);

  // no close() on cleanup: it fires onClose, and React's dev double-run would dismiss the dialog
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  useEffect(() => {
    if (file) void read(file);
  }, [file]);

  function run(b: WorkbookGrid, a: Answers) {
    const r = convertWorkbook(b, { catalog, brand, takenRefs }, a);
    if (r.status === "error") setPhase({ at: "error", message: r.message });
    else if (r.status === "questions") {
      setAsked((prev) => [...prev.filter((q) => !r.questions.some((n) => n.id === q.id)), ...r.questions]);
      setPhase({ at: "questions", questions: r.questions });
    } else setPhase({ at: "preview", proposal: r.proposal, report: r.report });
  }

  async function read(f: File) {
    setPhase({ at: "reading", name: f.name });
    setAnswers({});
    setAsked([]);
    try {
      const { readWorkbook } = await import("../lib/readWorkbook");
      const b = await readWorkbook(f.name, await f.arrayBuffer());
      setBook(b);
      run(b, {});
    } catch (e) {
      const err = e as Error;
      setPhase({ at: "error", message: err.name === "ReadError" ? err.message : `“${f.name}” couldn't be read. It may be damaged; try opening it in Excel and saving it again.` });
    }
  }

  function submit(next: Answers) {
    const merged = { ...answers, ...next };
    setAnswers(merged);
    if (book) run(book, merged);
  }

  /** go back to every question asked so far, with the answers given */
  function changeAnswers() {
    setPhase({ at: "questions", questions: asked });
  }

  const title =
    phase.at === "questions" ? "A few questions" : phase.at === "preview" ? "Check before creating" : phase.at === "error" ? "This file can't be used" : "Create a proposal from Excel";

  return (
    <dialog ref={ref} className="venue-dialog xi" onClose={onClose} aria-labelledby="xi-title">
      <header className="xi-head">
        <h2 id="xi-title">{title}</h2>
        <button className="vd-close" onClick={onClose} aria-label="Close">×</button>
      </header>

      {phase.at === "pick" && (
        <div className="xi-body">
          <p className="xi-lede">
            Upload the estimate as an Excel file. Its client details and items become a new proposal; you'll be asked about anything
            missing or unclear, and see everything before it's created.
          </p>
          <label
            className={`viz-drop ${drag ? "is-drag" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files[0];
              if (f) void read(f);
            }}
          >
            <span className="export-ic" aria-hidden>XLS</span>
            <span className="viz-drop-text">
              <strong>Choose an Excel file or drop it here</strong>
              <small>.xlsx (or .xls saved as .xlsx), up to 10 MB</small>
            </span>
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void read(f);
                e.target.value = "";
              }}
            />
          </label>
          <details className="xi-help">
            <summary>What the sheet should look like</summary>
            <ul>
              <li>A header row with an item column (Element, Item, Description or Particulars) and Qty, Rate and/or Amount. Unit, Notes and Category columns are used when present.</li>
              <li>Client details above the table as label and value: Client, Contact, Event (e.g. “Hindu Wedding”), Event date(s), Venue.</li>
              <li>Section rows (a heading with no figures) set the category of the items under them.</li>
              <li>Excel files exported from Proposal Studio convert back without changes.</li>
            </ul>
          </details>
        </div>
      )}

      {phase.at === "reading" && (
        <div className="xi-body">
          <p className="viz-status" role="status">Reading “{phase.name}”…</p>
        </div>
      )}

      {phase.at === "error" && (
        <div className="xi-body">
          <div className="viz-notice xi-error" role="alert">
            <p>{phase.message}</p>
          </div>
          <div className="xi-actions">
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={() => { setPhase({ at: "pick" }); setTimeout(() => inputRef.current?.click(), 0); }}>
              Choose another file
            </button>
          </div>
        </div>
      )}

      {phase.at === "questions" && (
        <Questions
          key={phase.questions.map((q) => q.id).join("|")}
          questions={phase.questions}
          answers={answers}
          fileName={book?.fileName ?? ""}
          onBack={() => setPhase({ at: "pick" })}
          onSubmit={submit}
        />
      )}

      {phase.at === "preview" && (
        <Preview
          proposal={phase.proposal}
          report={phase.report}
          canChange={asked.length > 0}
          onChange={changeAnswers}
          onSaveJson={() => downloadJson(phase.report.fileName.replace(/\.[a-z]+$/i, "") + ".json", [phase.proposal])}
          onCreate={() => onCreate(phase.proposal)}
          catalogTitle={proposalTitle(phase.proposal, catalog)}
          gstPct={brand.gstPct}
          coordinationLabel={brand.coordinationLabel}
        />
      )}
    </dialog>
  );
}

/* ---------------------------------------------------------------- questions */

/** stands in for a "decide later" choice (whose real answer is "") while the form is being filled in */
const NONE = "\u0000none";

function Questions({
  questions,
  answers,
  fileName,
  onBack,
  onSubmit,
}: {
  questions: Question[];
  answers: Answers;
  fileName: string;
  onBack: () => void;
  onSubmit: (a: Answers) => void;
}) {
  const [draft, setDraft] = useState<Answers>(() =>
    Object.fromEntries(questions.map((q) => [q.id, q.kind === "choice" && answers[q.id] === "" ? NONE : answers[q.id] ?? ""])),
  );
  const [tried, setTried] = useState(false);
  const set = (id: string, v: string) => setDraft((d) => ({ ...d, [id]: v }));
  const problem = (q: Question): string | null => {
    const v = (draft[q.id] ?? "").trim();
    if (!v) return q.kind === "dates" ? "Add a date, or choose “No date yet”." : "Please answer this.";
    if ((q.kind === "number" || q.kind === "amount") && v !== "actuals" && !(Number(v) >= 0 && /^\d+(\.\d+)?$/.test(v))) return "Enter a number, e.g. 2 or 1500.";
    if (q.kind === "number" && q.id.startsWith("qty:") && Number(v) === 0) return "The quantity must be more than 0.";
    return null;
  };
  const open = questions.filter((q) => problem(q));

  return (
    <form
      className="xi-body"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (!open.length) onSubmit(Object.fromEntries(questions.map((q) => [q.id, draft[q.id] === NONE ? "" : draft[q.id].trim()])));
      }}
    >
      <p className="xi-lede">
        {questions.length === 1 ? "One thing" : `${questions.length} things`} in “{fileName}” need{questions.length === 1 ? "s" : ""} an answer before the
        proposal can be created. Nothing is filled in for you.
      </p>
      <ol className="xi-questions">
        {questions.map((q) => {
          const err = tried ? problem(q) : null;
          const id = `xi-q-${q.id.replace(/[^a-z0-9]/gi, "-")}`;
          return (
            <li key={q.id} className="xi-q" aria-invalid={!!err}>
              <p className="xi-q-prompt" id={id}>{q.prompt}</p>
              {q.help && <p className="hint">{q.help}</p>}
              <Answer q={q} value={draft[q.id] ?? ""} onChange={(v) => set(q.id, v)} labelledBy={id} />
              {err && <p className="error" role="alert">{err}</p>}
            </li>
          );
        })}
      </ol>
      <div className="xi-actions">
        <button type="button" className="btn-ghost" onClick={onBack}>Choose another file</button>
        <button type="submit" className="btn-primary">Continue</button>
      </div>
    </form>
  );
}

function Answer({ q, value, onChange, labelledBy }: { q: Question; value: string; onChange: (v: string) => void; labelledBy: string }) {
  switch (q.kind) {
    case "choice":
      return (
        <div className="xi-options" role="radiogroup" aria-labelledby={labelledBy}>
          {q.options.map((o) => (
            <label key={o.value} className={`xi-option ${(o.value === "" ? value === NONE : value === o.value) ? "is-on" : ""}`}>
              <input
                type="radio"
                name={q.id}
                checked={o.value === "" ? value === NONE : value === o.value}
                onChange={() => onChange(o.value === "" ? NONE : o.value)}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      );
    case "text": {
      const skipped = value === SKIP;
      return (
        <div className="xi-inline">
          <input
            type="text"
            className="xi-input"
            aria-labelledby={labelledBy}
            placeholder={q.placeholder}
            value={skipped ? "" : value}
            disabled={skipped}
            onChange={(e) => onChange(e.target.value)}
          />
          {q.skipLabel && (
            <label className="check">
              <input type="checkbox" checked={skipped} onChange={(e) => onChange(e.target.checked ? SKIP : "")} /> {q.skipLabel}
            </label>
          )}
        </div>
      );
    }
    case "number":
    case "amount": {
      const actuals = value === "actuals";
      return (
        <div className="xi-inline">
          <span className="money">
            {q.kind === "amount" && <span aria-hidden>₹</span>}
            <input
              type="text"
              inputMode="decimal"
              aria-labelledby={labelledBy}
              value={actuals ? "" : value}
              disabled={actuals}
              onChange={(e) => onChange(e.target.value.replace(/[,\s₹]/g, ""))}
            />
            {q.kind === "number" && q.suffix && <span aria-hidden>{q.suffix}</span>}
          </span>
          {q.kind === "number" &&
            q.presets?.map((p) => (
              <button key={p.value} type="button" className={`chip ${value === p.value ? "is-on" : "chip-muted"}`} onClick={() => onChange(p.value)}>
                {p.label}
              </button>
            ))}
          {q.kind === "amount" && q.allowActuals && (
            <label className="check">
              <input type="checkbox" checked={actuals} onChange={(e) => onChange(e.target.checked ? "actuals" : "")} /> As per actuals
            </label>
          )}
        </div>
      );
    }
    case "dates": {
      const none = value === "none";
      const dates = none || !value ? [] : value.split(",");
      return (
        <div className="xi-dates">
          {!none && <EventDatesField dates={dates} onChange={(d) => onChange(d.join(","))} />}
          <label className="check">
            <input type="checkbox" checked={none} onChange={(e) => onChange(e.target.checked ? "none" : "")} /> No date yet
          </label>
        </div>
      );
    }
  }
}

/* ---------------------------------------------------------------- preview */

function Preview({
  proposal: p,
  report,
  canChange,
  onChange,
  onSaveJson,
  onCreate,
  catalogTitle,
  gstPct,
  coordinationLabel,
}: {
  proposal: Proposal;
  report: ImportReport;
  canChange: boolean;
  onChange: () => void;
  onSaveJson: () => void;
  onCreate: () => void;
  catalogTitle: string;
  gstPct: number;
  coordinationLabel: string;
}) {
  const { catalog } = useConfig();
  const t = computeTotals(p, gstPct);
  const included = groupLines(p.lines.filter((l) => !l.optional), catalog);
  const options = p.lines.filter((l) => l.optional);
  const offered = p.lines.flatMap((l) => l.upgrades.filter((u) => u.mode === "offer").map((u) => ({ ...u, for: l.name })));
  const money = (n: number) => formatINR(n);
  const dates = eventDates(p);

  return (
    <div className="xi-body">
      <p className="xi-lede">
        From “{report.fileName}”. Each value shows where it came from. Nothing has been saved yet.
      </p>

      <section className="xi-section" aria-labelledby="xi-client">
        <h3 id="xi-client">{p.client.name || "Client"} · {catalogTitle || "Occasion not chosen"}</h3>
        <dl className="xi-facts">
          {report.sources.filter((s) => s.label !== "Notes").map((s) => (
            <div key={s.label}>
              <dt>{s.label}</dt>
              <dd>
                {s.label.startsWith("Event date") ? formatDates(dates) : s.value}
                {s.source && <small>{s.source}</small>}
              </dd>
            </div>
          ))}
          <div>
            <dt>Quotation ref</dt>
            <dd>{p.ref}</dd>
          </div>
        </dl>
        {report.notInFile.length > 0 && (
          <p className="hint">Not in the file, left empty to fill in later: {report.notInFile.join(", ")}.</p>
        )}
      </section>

      <section className="xi-section" aria-labelledby="xi-items">
        <h3 id="xi-items">Items ({p.lines.filter((l) => !l.optional).length})</h3>
        <div className="xi-table-wrap">
          <table className="xi-table">
            <thead>
              <tr>
                <th scope="col">Element</th>
                <th scope="col" className="num">Qty</th>
                <th scope="col">Unit</th>
                <th scope="col" className="num">Rate</th>
                <th scope="col" className="num">Amount</th>
              </tr>
            </thead>
            {included.map((g) => (
              <tbody key={g.id}>
                <tr className="xi-group">
                  <th colSpan={5} scope="colgroup">{g.label}</th>
                </tr>
                {g.lines.map((l) => (
                  <tr key={l.uid}>
                    <td>
                      {l.name}
                      {l.notes && <small>{l.notes}</small>}
                      {l.upgrades.filter((u) => u.mode === "include").map((u) => (
                        <small key={u.id}>+ {u.name} ({money(u.price)})</small>
                      ))}
                      {!l.elementId && <small className="xi-tag">Not a catalogue element</small>}
                    </td>
                    <td className="num">{l.qty}</td>
                    <td>{l.unit}</td>
                    <td className="num">{l.rate === null ? "As per actuals" : money(l.rate)}</td>
                    <td className="num">{l.rate === null ? "—" : money(lineAmount(l))}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
        <dl className="xi-totals">
          <div><dt>Sub Total</dt><dd>{money(t.subTotal)}</dd></div>
          <div><dt>{coordinationLabel} ({p.coordinationPct}%)</dt><dd>{money(t.coordination)}</dd></div>
          {t.roundOff !== 0 && <div><dt>Rounded Off</dt><dd>{money(t.roundOff)}</dd></div>}
          <div className="is-grand"><dt>Grand Total</dt><dd>{money(t.grandTotal)}</dd></div>
        </dl>
      </section>

      {(options.length > 0 || offered.length > 0) && (
        <section className="xi-section" aria-labelledby="xi-options">
          <h3 id="xi-options">Additional options (not in the Grand Total)</h3>
          <ul className="xi-list">
            {options.map((l) => (
              <li key={l.uid}>{l.name}: {l.rate === null ? "as per actuals" : `${l.qty} × ${money(l.rate)}`}</li>
            ))}
            {offered.map((u) => (
              <li key={`${u.for}-${u.id}`}>Upgrade for {u.for}: {u.name}, {money(u.price)}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="xi-section" aria-labelledby="xi-more">
        <h3 id="xi-more">Terms, notes and things to check</h3>
        <p className="hint">{p.terms.length ? `${p.terms.length} terms and conditions.` : "No terms and conditions."}</p>
        {p.notes && <p className="xi-notes">{p.notes}</p>}
        {report.notes.length > 0 && (
          <ul className="xi-list">
            {report.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        )}
        {report.skipped.length > 0 && (
          <>
            <p className="hint">Left out:</p>
            <ul className="xi-list">
              {report.skipped.map((s) => (
                <li key={s.where}>{s.where}: {s.text} ({s.why})</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="xi-actions">
        {canChange && <button className="btn-ghost" onClick={onChange}>Change answers</button>}
        <button className="btn-ghost" onClick={onSaveJson}>Save as JSON</button>
        <button className="btn-primary" onClick={onCreate}>Create proposal</button>
      </div>
    </div>
  );
}
