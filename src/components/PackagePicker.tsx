import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ProposalPackage } from "../types";
import { useConfig } from "../config/context";
import { computeTotals } from "../lib/totals";
import { formatINRShort } from "../lib/format";
import { downloadJson } from "../state/proposals";

/** "Start from a package": the team's packages, then the planner's own, each with its occasion and price. */
export default function PackagePicker({
  mine,
  onUse,
  onRemove,
  onClose,
}: {
  mine: ProposalPackage[];
  onUse: (pk: ProposalPackage) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const { catalog, brand, packages: team } = useConfig();
  const ref = useRef<HTMLDialogElement>(null);
  // no close() on cleanup: it fires onClose, and React's dev double-run would dismiss the dialog
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const occasion = (pk: ProposalPackage) =>
    [catalog.ceremonyStyles.find((s) => s.id === pk.style)?.label, catalog.eventTypes.find((t) => t.id === pk.eventType)?.label].filter(Boolean).join(" ") || "Any occasion";
  const total = (pk: ProposalPackage) => computeTotals({ lines: pk.lines, coordinationPct: pk.coordinationPct ?? brand.coordinationPct, grandTotal: null }, brand.gstPct).grandTotal;

  const row = (pk: ProposalPackage, own: boolean) => (
    <li key={pk.id} className="pkg">
      <div className="pkg-text">
        <strong>{pk.name}</strong>
        <span>
          {occasion(pk)} · {pk.lines.filter((l) => !l.optional).length} elements
          {pk.functions?.length ? ` · ${pk.functions.map((f) => f.label).join(", ")}` : ""}
        </span>
        {pk.description && <small>{pk.description}</small>}
      </div>
      <span className="pkg-price">from {formatINRShort(total(pk))}</span>
      <div className="pkg-tools">
        <button className="btn-primary btn-sm" onClick={() => onUse(pk)}>Use</button>
        {own && (
          <>
            {/* the file to add to public/config/packages.json, so the whole team gets it */}
            <button className="link-btn" onClick={() => downloadJson(`Package_${pk.name.replace(/[^\w-]+/g, "_")}.json`, pk)}>Save file</button>
            <button className="link-btn link-danger" onClick={() => confirm(`Delete the package “${pk.name}”?`) && onRemove(pk.id)}>Delete</button>
          </>
        )}
      </div>
    </li>
  );

  return createPortal(
    <dialog ref={ref} className="venue-dialog xi pkg-dialog" onClose={onClose} aria-labelledby="pkg-title">
      <header className="xi-head">
        <h2 id="pkg-title">Start from a package</h2>
        <button className="vd-close" onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className="xi-body">
        <p className="xi-lede">A new proposal with the package's occasion, elements and terms. Add the client and dates, then adjust anything.</p>
        {team.length > 0 && (
          <section>
            <h3 className="pkg-h">Team packages</h3>
            <ul className="pkg-list">{team.map((pk) => row(pk, false))}</ul>
          </section>
        )}
        <section>
          <h3 className="pkg-h">Your packages</h3>
          {mine.length ? (
            <ul className="pkg-list">{mine.map((pk) => row(pk, true))}</ul>
          ) : (
            <p className="hint">None yet. On a proposal's Review step, use “Save as a package” to reuse its elements next time.</p>
          )}
        </section>
      </div>
    </dialog>,
    document.body,
  );
}
