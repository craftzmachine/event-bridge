import { useRef, useState } from "react";
import type { Proposal } from "../types";
import { useConfig } from "../config/context";
import { downloadJson, isProposal, type useProposals } from "../state/proposals";
import { computeTotals } from "../lib/totals";
import { formatDate, formatINRShort, safeFilePart } from "../lib/format";
import { proposalTitle } from "../lib/proposal";
import Img from "../components/Img";
import Ornament from "../components/Ornament";
import AppearanceControls from "../components/AppearanceControls";

type Store = ReturnType<typeof useProposals>;

export default function Home({
  store,
  account,
  onSignOut,
  onOpen,
  onVenues,
  onNew,
}: {
  store: Store;
  account: string;
  onSignOut: () => void;
  onOpen: (id: string) => void;
  onVenues: () => void;
  onNew: () => void;
}) {
  const { catalog, brand } = useConfig();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const hero = catalog.eventTypes[0]?.image;

  async function onImport(files: FileList | null) {
    if (!files?.length) return;
    try {
      const items: Proposal[] = [];
      for (const f of Array.from(files)) {
        const data = JSON.parse(await f.text());
        (Array.isArray(data) ? data : [data]).forEach((x) => isProposal(x) && items.push(x));
      }
      if (!items.length) throw new Error("no proposals found");
      store.importMany(items);
      setMsg(`Imported ${items.length} proposal${items.length > 1 ? "s" : ""}.`);
    } catch (e) {
      setMsg(`Could not import: ${(e as Error).message}.`);
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  const sorted = [...store.list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="home">
      <header className="home-hero">
        <Img src={hero} alt="" className="home-hero-img" />
        <div className="home-account">
          <AppearanceControls onDark />
          <span className="home-account-email" title={account}>{account}</span>
          <button className="btn-outline-light btn-sm" onClick={onSignOut}>Sign out</button>
        </div>
        <div className="home-hero-text">
          <img className="brand-logo" src={`${import.meta.env.BASE_URL}${brand.logo}`} alt={`${brand.company} — ${brand.tagline}`} />
          <p className="eyebrow">Proposal studio</p>
          <h1>Craft a proposal worth saying <em>yes</em> to.</h1>
          <Ornament />
          <p className="lede">Choose the occasion, curate the elements and hand the client a polished estimate in minutes.</p>
          <div className="hero-actions">
            <button className="btn-gold btn-lg" onClick={onNew}>Start a new proposal</button>
            <button className="btn-outline-light btn-lg" onClick={onVenues}>Browse venues</button>
          </div>
        </div>
      </header>

      <main className="home-main">
        <div className="home-bar">
          <h2>Your proposals</h2>
          <div className="home-actions">
            <button className="btn-ghost" onClick={() => fileRef.current?.click()}>Import</button>
            <button className="btn-ghost" disabled={!store.list.length}
              onClick={() => downloadJson(`Proposals_backup_${new Date().toISOString().slice(0, 10)}.json`, store.list)}>
              Back up all
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" multiple hidden onChange={(e) => onImport(e.target.files)} />
          </div>
        </div>
        {msg && <p className="toast" role="status">{msg}</p>}
        {sorted.length === 0 ? (
          <div className="empty-state">
            <p>No proposals yet. Start one above — drafts are saved on this device as you work.</p>
          </div>
        ) : (
          <ul className="cards">
            {sorted.map((p) => {
              const t = computeTotals(p, brand.gstPct);
              const style = catalog.ceremonyStyles.find((s) => s.id === p.style);
              return (
                <li key={p.id} className="pcard">
                  <button className="pcard-open" onClick={() => onOpen(p.id)}>
                    <Img src={style?.image} alt="" className="pcard-img" />
                    <span className="pcard-body">
                      <span className="eyebrow">{p.eventType ? proposalTitle(p, catalog) : "Occasion not chosen"}</span>
                      <span className="pcard-name">{p.client.name || "Untitled client"}</span>
                      <span className="pcard-ref">{p.ref}</span>
                      <span className="pcard-meta">{formatDate(p.client.date)}{p.client.venue && ` · ${p.client.venue}`}</span>
                      <span className="pcard-total">{formatINRShort(t.grandTotal)} <small>· {p.lines.length} element{p.lines.length === 1 ? "" : "s"}</small></span>
                    </span>
                  </button>
                  <div className="pcard-tools">
                    <button className="link-btn" onClick={() => onOpen(store.duplicate(p).id)}>Duplicate</button>
                    <button className="link-btn" onClick={() => downloadJson(`Proposal_${safeFilePart(p.client.name)}.json`, p)}>Save file</button>
                    <button className="link-btn link-danger"
                      onClick={() => confirm(`Delete the proposal for ${p.client.name || "this client"}? This cannot be undone.`) && store.remove(p.id)}>
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <footer className="home-foot">
        <img src={`${import.meta.env.BASE_URL}${brand.logo}`} alt={brand.company} />
        <span>{brand.legalName} · {brand.phone} · {brand.email}</span>
      </footer>
    </div>
  );
}
