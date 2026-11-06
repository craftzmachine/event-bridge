import { useRef, useState } from "react";
import type { Proposal } from "../types";
import { useConfig } from "../config/context";
import { downloadJson, isProposal, type useProposals } from "../state/proposals";
import { computeTotals } from "../lib/totals";
import { formatDates, formatINRShort, safeFilePart, todayISO } from "../lib/format";
import { eventDates, proposalTitle } from "../lib/proposal";
import Img from "../components/Img";
import Ornament from "../components/Ornament";
import SiteNav from "../components/SiteNav";
import ExcelImport from "../components/ExcelImport";
import { SITE } from "../site";
import heroPhoto from "../assets/AMU02986.webp";

type Store = ReturnType<typeof useProposals>;

export default function Home({
  store,
  account,
  onSignOut,
  onOpen,
  onVenues,
  onVisualize,
  onNew,
}: {
  store: Store;
  account: string;
  onSignOut: () => void;
  onOpen: (id: string) => void;
  onVenues: () => void;
  onVisualize: () => void;
  onNew: () => void;
}) {
  const { catalog, brand } = useConfig();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  // null = closed; { file: null } = open and asking for a file
  const [excel, setExcel] = useState<{ file: File | null } | null>(null);
  const isExcel = (f: File) => /.(xlsx|xls|xlsm)$/i.test(f.name);

  async function onImport(files: FileList | null) {
    if (!files?.length) return;
    // an Excel file goes through the Excel conversion, which asks questions and shows a preview
    const excelFile = Array.from(files).find(isExcel);
    if (excelFile) {
      setExcel({ file: excelFile });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
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
        <Img src={heroPhoto} alt="" className="home-hero-img" />
        <SiteNav current="studio" account={account} onSignOut={onSignOut} />
        <div className="home-hero-text">
          <img className="brand-logo" src={`${import.meta.env.BASE_URL}${brand.logo}`} alt={`${brand.company} — ${brand.tagline}`} />
          <h1>Craft a proposal worth saying <em>yes</em> to.</h1>
          <Ornament />
          <p className="lede">Choose the occasion, curate the elements and hand the client a polished estimate in minutes.</p>
          <div className="hero-actions">
            <button className="btn-gold btn-lg" onClick={onNew}>Start a new proposal</button>
            <button className="btn-outline-light btn-lg" onClick={onVenues}>Browse venues</button>
            <button className="btn-outline-light btn-lg" onClick={onVisualize}>Visualize Proposal</button>
          </div>
        </div>
      </header>

      <main className="home-main">
        <div className="home-bar">
          <h2>Your proposals</h2>
          <div className="home-actions">
            <button className="btn-ghost" onClick={() => setExcel({ file: null })}>From Excel</button>
            <button className="btn-ghost" onClick={() => fileRef.current?.click()}>Import</button>
            <button className="btn-ghost" disabled={!store.list.length}
              onClick={() => downloadJson(`Proposals_backup_${todayISO()}.json`, store.list)}>
              Back up all
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json,.xlsx,.xls" multiple hidden onChange={(e) => onImport(e.target.files)} />
          </div>
        </div>
        {msg && <p className="toast" role="status">{msg}</p>}
        {excel && (
          <ExcelImport
            file={excel.file}
            takenRefs={store.refs}
            onClose={() => setExcel(null)}
            onCreate={(p) => {
              // the same path as importing a JSON backup, so the proposal is stored like any other
              store.importMany([p]);
              setExcel(null);
              setMsg(`Created a proposal for ${p.client.name || "the client"} from Excel.`);
              onOpen(p.id);
            }}
          />
        )}
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
                      <span className="pcard-meta">{formatDates(eventDates(p))}{p.client.venue && ` · ${p.client.venue}`}</span>
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
        <span className="home-foot-line">
          <span>{SITE.name}, {brand.legalName}</span>
          <a href={`tel:${brand.phone.replace(/[^+0-9]/g, "")}`}>{brand.phone}</a>
          <a href={`mailto:${brand.email}`}>{brand.email}</a>
        </span>
      </footer>
    </div>
  );
}
