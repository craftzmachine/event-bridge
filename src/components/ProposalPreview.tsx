import type { Line, Proposal } from "../types";
import { useConfig } from "../config/context";
import { computeTotals, lineAmount } from "../lib/totals";
import { formatDate, formatINR } from "../lib/format";
import { groupLines, proposalTitle } from "../lib/proposal";
import Img from "./Img";
import TotalsPanel from "./TotalsPanel";

function Row({ l, i }: { l: Line; i: number }) {
  const inc = l.upgrades.filter((u) => u.mode === "include");
  return (
    <>
      <tr>
        <td className="pv-sl">{String(i + 1).padStart(2, "0")}</td>
        <td>
          {l.name}
          {l.notes && <span className="pv-note">{l.notes}</span>}
          {inc.map((u) => (
            <span className="pv-up" key={u.id}>+ {u.name}</span>
          ))}
        </td>
        <td className="pv-qty">{l.qty} {l.unit}</td>
        <td className="pv-amt">{l.rate === null ? <em>As per actuals</em> : formatINR(lineAmount(l))}</td>
      </tr>
    </>
  );
}

export default function ProposalPreview({ p }: { p: Proposal }) {
  const { catalog, brand } = useConfig();
  const t = computeTotals(p, brand.gstPct);
  const type = catalog.eventTypes.find((x) => x.id === p.eventType);
  const style = catalog.ceremonyStyles.find((x) => x.id === p.style);
  const groups = groupLines(p.lines.filter((l) => !l.optional), catalog);
  const options = [
    ...p.lines.filter((l) => l.optional).map((l) => ({ key: l.uid, name: l.name, note: l.notes, amount: l.rate === null ? null : lineAmount(l) })),
    ...p.lines.flatMap((l) => l.upgrades.filter((u) => u.mode === "offer").map((u) => ({ key: l.uid + u.id, name: `Upgrade: ${u.name}`, note: `For “${l.name}”`, amount: u.price }))),
  ];
  const letters = "ABCDEFGHIJ";

  return (
    <article className="preview" aria-label="Proposal preview">
      <header className="pv-cover">
        <Img src={style?.image ?? type?.image} alt="" className="pv-hero" />
        <div className="pv-cover-text">
          <img className="pv-logo" src={`${import.meta.env.BASE_URL}${brand.logo}`} alt={brand.company} />
          <p className="eyebrow">A proposal for</p>
          <h2>{proposalTitle(p, catalog)}</h2>
          <p className="pv-tag">{brand.tagline}</p>
        </div>
      </header>
      <section className="pv-card">
        <div><span>Client</span><strong>{p.client.name || "—"}</strong><small>{p.client.contact || "Contact: To Be Confirmed"}</small></div>
        <div><span>Event date</span><strong>{formatDate(p.client.date)}</strong></div>
        <div><span>Venue</span><strong>{p.client.venue || "To Be Confirmed"}</strong><small>{p.client.location}</small></div>
      </section>
      <p className="pv-ref">Quotation ref: {p.ref || "To Be Assigned"} · Dated {formatDate(new Date().toISOString().slice(0, 10))}</p>

      <p className="eyebrow">Scope of work</p>
      <h3 className="pv-h">Elements &amp; Investment</h3>
      {groups.length === 0 && <p className="empty">No elements selected yet.</p>}
      {groups.map((g, gi) => (
        <table className="pv-table" key={g.id}>
          <thead>
            <tr><th className="pv-sl">{letters[gi]}</th><th colSpan={3}>{g.label}</th></tr>
          </thead>
          <tbody>{g.lines.map((l, i) => <Row key={l.uid} l={l} i={i} />)}</tbody>
        </table>
      ))}
      <TotalsPanel t={t} pct={p.coordinationPct} />
      {t.asPerActuals.length > 0 && (
        <p className="pv-small">{t.asPerActuals.map((l) => l.name).join("; ")} will be billed as per actuals and {t.asPerActuals.length > 1 ? "are" : "is"} not included in the Grand Total.</p>
      )}
      {p.notes.trim() && <p className="pv-small">{p.notes}</p>}

      {options.length > 0 && (
        <>
          <p className="eyebrow">Optional — not included in the Grand Total</p>
          <h3 className="pv-h">Additional Options</h3>
          <table className="pv-table">
            <tbody>
              {options.map((o, i) => (
                <tr key={o.key}>
                  <td className="pv-sl">{String(i + 1).padStart(2, "0")}</td>
                  <td>{o.name}{o.note && <span className="pv-note">{o.note}</span>}</td>
                  <td />
                  <td className="pv-amt">{o.amount === null ? <em>As per actuals</em> : formatINR(o.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <p className="eyebrow">Terms &amp; conditions</p>
      <ul className="pv-terms">{p.terms.filter((x) => x.trim()).map((x, i) => <li key={i}>{x}</li>)}</ul>
      <footer className="pv-contact">
        <div>
          <p className="eyebrow">Your point of contact</p>
          <strong>{brand.contact.name}</strong>
          <span>{brand.contact.role}</span>
          <span>{brand.contact.phone} · {brand.contact.email}</span>
        </div>
        <small>{brand.legalName} · {brand.address} · GSTIN {brand.gstin}</small>
      </footer>
    </article>
  );
}
