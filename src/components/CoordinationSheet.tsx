import { useState } from "react";
import type { CoordinationKind, CoordinationSheet as Sheet, CoordPerson, Proposal } from "../types";
import { useConfig } from "../config/context";
import {
  blankCue,
  blankIssue,
  DETAIL_ROWS,
  ESCALATION,
  FUNCTION_DUTIES,
  HANDOVER,
  hasSheet,
  HOSTESS_NOTE,
  HOSTESS_STATIONS,
  KINDS,
  newSheet,
  OTHER_DUTIES,
  READINESS,
  REVIEW_ROWS,
  ROLES,
  SECTIONS,
  setSheet,
  SHEET_FOOTER,
  SHEET_INTRO,
  sheetFor,
  sheetFunctions,
  TIMELINE_NOTE,
} from "../lib/coordination";
import { proposalTitle } from "../lib/proposal";

type Update = (fn: (cur: Proposal) => Proposal) => void;

/**
 * The on-site coordination & responsibility sheet, one per function. The proposal fills in the client, function,
 * date, venue and guests; the coordinators fill in the rest and export it as a PDF. Every change builds on the
 * latest saved proposal.
 */
export default function CoordinationSheet({ p, onUpdate }: { p: Proposal; onUpdate: Update }) {
  const { catalog, brand } = useConfig();
  const fns = sheetFunctions(p, proposalTitle(p, catalog) || "Event");
  const [fnId, setFnId] = useState(fns[0].id);
  const fn = fns.find((f) => f.id === fnId) ?? fns[0];
  const s = sheetFor(p, fn);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const edit = (change: (s: Sheet) => Sheet) => onUpdate((cur) => setSheet(cur, change(sheetFor(cur, fn))));
  const text = (get: (s: Sheet) => string, put: (s: Sheet, v: string) => Sheet, aria: string, placeholder = "") => (
    <input aria-label={aria} placeholder={placeholder} value={get(s)} maxLength={300} onChange={(e) => { const v = e.target.value; edit((x) => put(x, v)); }} />
  );
  const personFields = (get: (s: Sheet) => CoordPerson, put: (s: Sheet, v: CoordPerson) => Sheet, aria: string) => (
    <div className="co-person">
      {text((x) => get(x).name, (x, v) => put(x, { ...get(x), name: v }), `${aria} name`, "Name")}
      <input aria-label={`${aria} phone`} placeholder="Phone" inputMode="tel" value={get(s).phone} maxLength={40} onChange={(e) => { const v = e.target.value; edit((x) => put(x, { ...get(x), phone: v })); }} />
    </div>
  );

  async function exportPdf(all: boolean) {
    setBusy(all ? "all" : "one");
    setErr("");
    try {
      const sheets = all ? fns.map((f) => sheetFor(p, f)) : [s];
      await (await import("../lib/exportCoordination")).downloadCoordination(p, sheets, catalog, brand);
    } catch (e) {
      setErr(`The PDF couldn't be made: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  }
  function reset() {
    if (confirm(`Clear the ${fn.label} sheet and start again from the proposal?`)) onUpdate((cur) => setSheet(cur, newSheet(cur, fn)));
  }

  return (
    <div className="co">
      <div className="co-head">
        <div>
          <h2>On-site coordination</h2>
          <p className="hint">{SHEET_INTRO}</p>
        </div>
        <div className="co-tools">
          <button type="button" className="btn-primary" disabled={!!busy} onClick={() => exportPdf(false)}>{busy === "one" ? "Making PDF…" : "Export PDF"}</button>
          {fns.length > 1 && <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => exportPdf(true)}>{busy === "all" ? "Making PDF…" : "Export all functions"}</button>}
        </div>
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="co-bar">
        {fns.length > 1 && (
          <label className="field">
            <span>Function</span>
            <select value={fn.id} onChange={(e) => setFnId(e.target.value)}>
              {fns.map((f) => <option key={f.id} value={f.id}>{f.label}{hasSheet(p, f.id) ? "" : " (not started)"}</option>)}
            </select>
          </label>
        )}
        <label className="field">
          <span>Responsibilities for</span>
          <select value={s.kind} onChange={(e) => { const k = e.target.value as CoordinationKind; edit((x) => ({ ...x, kind: k })); }}>
            {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </label>
        {hasSheet(p, fn.id) && <button type="button" className="link-btn link-danger" onClick={reset}>Start this sheet again</button>}
      </div>

      <section className="side-card co-card">
        <h3>1. {SECTIONS[0]}</h3>
        <div className="co-grid">
          <label className="field"><span>Client / couple</span>{text((x) => x.details.client, (x, v) => ({ ...x, details: { ...x.details, client: v } }), "Client / couple")}</label>
          <label className="field"><span>Function &amp; date</span>{text((x) => x.details.functionDate, (x, v) => ({ ...x, details: { ...x.details, functionDate: v } }), "Function & date")}</label>
          <label className="field"><span>Venue / spaces</span>{text((x) => x.details.spaces, (x, v) => ({ ...x, details: { ...x.details, spaces: v } }), "Venue / spaces")}</label>
          <label className="field"><span>Guest count</span>{text((x) => x.details.guests, (x, v) => ({ ...x, details: { ...x.details, guests: v } }), "Guest count")}</label>
          <label className="field field-wide"><span>Guest arrival / function start / finish</span>{text((x) => x.details.timings, (x, v) => ({ ...x, details: { ...x.details, timings: v } }), "Guest arrival, start and finish", "e.g. 9:30 am / 10:45 am / 1:30 pm")}</label>
          {DETAIL_ROWS.map((r) => (
            <div className="field" key={r.key}>
              <span>{r.label}</span>
              {personFields((x) => x.details[r.key], (x, v) => ({ ...x, details: { ...x.details, [r.key]: v } }), r.label)}
            </div>
          ))}
        </div>
      </section>

      <section className="side-card co-card">
        <h3>2. {SECTIONS[1]}</h3>
        <div className="co-rows">
          {ROLES.map((r) => (
            <div className="co-role" key={r.key}>
              <div><strong>{r.role}</strong><small>{r.duty}</small></div>
              {personFields((x) => x.team[r.key], (x, v) => ({ ...x, team: { ...x.team, [r.key]: v } }), r.role)}
            </div>
          ))}
        </div>
        <div className="co-grid co-grid-3">
          <label className="field"><span>Backup lead</span>{text((x) => x.team.backupLead, (x, v) => ({ ...x, team: { ...x.team, backupLead: v } }), "Backup lead")}</label>
          <label className="field"><span>Team communication channel</span>{text((x) => x.team.channel, (x, v) => ({ ...x, team: { ...x.team, channel: v } }), "Team communication channel", "e.g. WhatsApp group, walkie channel 3")}</label>
          <label className="field"><span>Briefing time / location</span>{text((x) => x.team.briefing, (x, v) => ({ ...x, team: { ...x.team, briefing: v } }), "Briefing time / location")}</label>
        </div>
      </section>

      <section className="side-card co-card">
        <h3>3. {SECTIONS[2]}</h3>
        <div className="co-table-wrap">
          <table className="co-table">
            <thead><tr><th>Staff</th><th>Station &amp; duties</th><th>Name</th><th>Reporting</th><th>Breaks</th><th>Relief</th></tr></thead>
            <tbody>
              {HOSTESS_STATIONS.map((h, k) => {
                const put = (field: "name" | "reporting" | "breaks" | "relief") => (x: Sheet, v: string) => ({ ...x, hostesses: x.hostesses.map((y, j) => (j === k ? { ...y, [field]: v } : y)) });
                return (
                  <tr key={h.staff}>
                    <th scope="row">{h.staff}</th>
                    <td><strong>{h.station}</strong><small>{h.duties}</small></td>
                    <td>{text((x) => x.hostesses[k].name, put("name"), `${h.staff} name`)}</td>
                    <td>{text((x) => x.hostesses[k].reporting, put("reporting"), `${h.staff} reporting time`)}</td>
                    <td>{text((x) => x.hostesses[k].breaks, put("breaks"), `${h.staff} breaks`)}</td>
                    <td>{text((x) => x.hostesses[k].relief, put("relief"), `${h.staff} relief`)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="hint">{HOSTESS_NOTE}</p>
      </section>

      <section className="side-card co-card">
        <h3>4. {SECTIONS[3]}</h3>
        <div className="co-table-wrap">
          <table className="co-table">
            <thead><tr><th>Time</th><th>Action / cue</th><th>Owner</th><th>Backup</th><th>Dependency</th><th>Status / actual</th><th><span className="sr-only">Remove</span></th></tr></thead>
            <tbody>
              {s.timeline.map((r) => {
                const put = (field: "time" | "action" | "owner" | "backup" | "dependency" | "actual") => (x: Sheet, v: string) => ({ ...x, timeline: x.timeline.map((y) => (y.id === r.id ? { ...y, [field]: v } : y)) });
                const get = (field: "time" | "action" | "owner" | "backup" | "dependency" | "actual") => (x: Sheet) => x.timeline.find((y) => y.id === r.id)?.[field] ?? "";
                return (
                  <tr key={r.id}>
                    <td className="co-narrow">{text(get("time"), put("time"), "Planned time")}</td>
                    <td className="co-wide">{text(get("action"), put("action"), "Action or cue")}</td>
                    <td className="co-narrow">{text(get("owner"), put("owner"), "Owner")}</td>
                    <td>{text(get("backup"), put("backup"), "Backup")}</td>
                    <td>{text(get("dependency"), put("dependency"), "Dependency")}</td>
                    <td className="co-narrow">{text(get("actual"), put("actual"), "Status or actual time")}</td>
                    <td><button type="button" className="icon-btn icon-danger" aria-label="Remove this cue" onClick={() => edit((x) => ({ ...x, timeline: x.timeline.filter((y) => y.id !== r.id) }))}>×</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="co-row-tools">
          <button type="button" className="btn-ghost btn-sm" onClick={() => edit((x) => ({ ...x, timeline: [...x.timeline, blankCue()] }))}>Add a cue</button>
        </div>
        <p className="hint">{TIMELINE_NOTE}</p>
      </section>

      <section className="side-card co-card">
        <h3>5. {SECTIONS[4]} <small>{KINDS.find((k) => k.id === s.kind)?.label}</small></h3>
        {s.kind === "other" ? (
          <p>{OTHER_DUTIES}</p>
        ) : (
          <dl className="co-duties">
            {FUNCTION_DUTIES[s.kind].map((r) => (
              <div key={r.owner}><dt>{r.owner}</dt><dd>{r.duties}</dd></div>
            ))}
          </dl>
        )}
      </section>

      <section className="side-card co-card">
        <h3>6. {SECTIONS[5]}</h3>
        <ul className="co-checks">
          {READINESS.map((t, k) => (
            <li key={t}><label><input type="checkbox" checked={!!s.readiness[k]} onChange={(e) => { const on = e.target.checked; edit((x) => ({ ...x, readiness: x.readiness.map((v, j) => (j === k ? on : v)) })); }} /> {t}</label></li>
          ))}
        </ul>
      </section>

      <section className="side-card co-card">
        <h3>7. {SECTIONS[6]}</h3>
        <ul className="co-rules">{ESCALATION.map((t) => <li key={t}>{t}</li>)}</ul>
      </section>

      <section className="side-card co-card">
        <h3>8. {SECTIONS[7]}</h3>
        <div className="co-table-wrap">
          <table className="co-table">
            <thead><tr><th>Time</th><th>Issue / impact</th><th>Owner / action</th><th>Approval / closed</th><th><span className="sr-only">Remove</span></th></tr></thead>
            <tbody>
              {s.issues.map((r) => {
                const put = (field: "time" | "issue" | "action" | "closed") => (x: Sheet, v: string) => ({ ...x, issues: x.issues.map((y) => (y.id === r.id ? { ...y, [field]: v } : y)) });
                const get = (field: "time" | "issue" | "action" | "closed") => (x: Sheet) => x.issues.find((y) => y.id === r.id)?.[field] ?? "";
                return (
                  <tr key={r.id}>
                    <td className="co-narrow">{text(get("time"), put("time"), "Time")}</td>
                    <td className="co-wide">{text(get("issue"), put("issue"), "Issue and impact")}</td>
                    <td className="co-wide">{text(get("action"), put("action"), "Owner and action")}</td>
                    <td>{text(get("closed"), put("closed"), "Approval or closed")}</td>
                    <td><button type="button" className="icon-btn icon-danger" aria-label="Remove this row" onClick={() => edit((x) => ({ ...x, issues: x.issues.filter((y) => y.id !== r.id) }))}>×</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="co-row-tools">
          <button type="button" className="btn-ghost btn-sm" onClick={() => edit((x) => ({ ...x, issues: [...x.issues, blankIssue()] }))}>Add a row</button>
        </div>
      </section>

      <section className="side-card co-card">
        <h3>9. {SECTIONS[8]}</h3>
        <ul className="co-checks co-checks-inline">
          {HANDOVER.map((t, k) => (
            <li key={t}><label><input type="checkbox" checked={!!s.handover[k]} onChange={(e) => { const on = e.target.checked; edit((x) => ({ ...x, handover: x.handover.map((v, j) => (j === k ? on : v)) })); }} /> {t}</label></li>
          ))}
        </ul>
        <div className="co-grid">
          {REVIEW_ROWS.map((r) => (
            <label className="field" key={r.key}>
              <span>{r.label}</span>
              <textarea rows={2} maxLength={1000} value={s.review[r.key]} onChange={(e) => { const v = e.target.value; edit((x) => ({ ...x, review: { ...x.review, [r.key]: v } })); }} />
            </label>
          ))}
        </div>
        <p className="hint">{SHEET_FOOTER}</p>
      </section>
    </div>
  );
}
