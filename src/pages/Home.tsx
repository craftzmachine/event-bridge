import { useEffect, useRef, useState } from "react";
import type { Proposal, ProposalPackage, ProposalStatus } from "../types";
import { usePackages } from "../state/packages";
import PackagePicker from "../components/PackagePicker";
import { useConfig } from "../config/context";
import { downloadJson, isProposal, readBackupState, writeBackupState, type useProposals } from "../state/proposals";
import { backedUp, backupAge, backupDue, snoozed, type BackupState } from "../lib/backup";
import { computeTotals } from "../lib/totals";
import { formatDate, formatDates, formatINRShort, safeFilePart, todayISO } from "../lib/format";
import { eventDates, proposalTitle } from "../lib/proposal";
import { matchesSearch, pipelineSummary, proposalStatus, statusLabel, statusPatch, STATUSES } from "../lib/status";
import { clientAnswers, type Share } from "../lib/shares";
import { api } from "../lib/api";
import ClientAnswer from "../components/ClientAnswer";
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
  onNewFrom,
}: {
  store: Store;
  account: string;
  onSignOut: () => void;
  onOpen: (id: string) => void;
  onVenues: () => void;
  onVisualize: () => void;
  onNew: () => void;
  /** start a proposal from a package */
  onNewFrom: (pk: ProposalPackage) => void;
}) {
  const packages = usePackages();
  const [picking, setPicking] = useState(false);
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

  const [filter, setFilter] = useState<ProposalStatus | "all">("all");
  const [query, setQuery] = useState("");
  const sorted = [...store.list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const counts = Object.fromEntries(STATUSES.map((s) => [s.id, store.list.filter((p) => proposalStatus(p) === s.id).length]));
  const shown = sorted.filter((p) => (filter === "all" || proposalStatus(p) === filter) && matchesSearch(p, query));
  const now = new Date();
  const summary = pipelineSummary(store.list, brand.gstPct, now);
  const month = now.toLocaleString("en-GB", { month: "long" });

  const [backup, setBackup] = useState<BackupState>(readBackupState);
  const updateBackup = (s: BackupState) => {
    writeBackupState(s);
    setBackup(s);
  };
  const backUpAll = () => {
    downloadJson(`Proposals_backup_${todayISO()}.json`, store.list);
    updateBackup(backedUp(Date.now()));
  };
  const remind = backupDue(backup, store.list.length, now.getTime());

  // clients' answers on links made with "Share with client"; without the sharing service the cards just don't show them
  const [shares, setShares] = useState<Share[]>([]);
  const linked = store.list.some((p) => p.shareId);
  useEffect(() => {
    if (!linked) {
      return;
    }
    api<{ shares: Share[] }>("shares")
      .then((r) => setShares(r.shares))
      .catch(() => {});
  }, [linked]);
  const answers = clientAnswers(store.list, shares);

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
            <button className="btn-outline-light btn-lg" onClick={() => setPicking(true)}>Start from a package</button>
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
            <button className="btn-ghost" disabled={!store.list.length} onClick={backUpAll}>
              Back up all
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json,.xlsx,.xls" multiple hidden onChange={(e) => onImport(e.target.files)} />
          </div>
        </div>
        {remind && (
          <aside className="backup-note" aria-label="Backup reminder">
            <p>
              <strong>Your proposals are saved only in this browser.</strong> {backupAge(backup, now.getTime())}. Back them up so a cleared
              browser or a new phone doesn't lose them.
            </p>
            <div className="backup-note-actions">
              <button className="btn-gold" onClick={backUpAll}>Back up now</button>
              <button className="link-btn" onClick={() => updateBackup(snoozed(backup, Date.now()))}>Remind me later</button>
            </div>
          </aside>
        )}
        {msg && <p className="toast" role="status">{msg}</p>}
        {picking && (
          <PackagePicker
            mine={packages.mine}
            onRemove={packages.remove}
            onClose={() => setPicking(false)}
            onUse={(pk) => {
              setPicking(false);
              onNewFrom(pk);
            }}
          />
        )}
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
        {sorted.length > 0 && (
          <>
            <dl className="pipeline" aria-label={`${month} at a glance`}>
              <div>
                <dt>Sent in {month}</dt>
                <dd>{formatINRShort(summary.sent.value)} <small>{summary.sent.count} proposal{summary.sent.count === 1 ? "" : "s"}</small></dd>
              </div>
              <div>
                <dt>Accepted in {month}</dt>
                <dd>{formatINRShort(summary.accepted.value)} <small>{summary.accepted.count} proposal{summary.accepted.count === 1 ? "" : "s"}</small></dd>
              </div>
              <div>
                <dt>Win rate</dt>
                <dd>{summary.winRate === null ? "—" : `${Math.round(summary.winRate * 100)}%`} <small>{summary.winRate === null ? "once one is accepted or lost" : "accepted of those decided"}</small></dd>
              </div>
            </dl>
            <div className="home-filters">
              <div className="seg" role="group" aria-label="Show proposals">
                {([{ id: "all", label: "All" }, ...STATUSES] as const).map((s) => (
                  <button key={s.id} type="button" className={filter === s.id ? "is-on" : ""} aria-pressed={filter === s.id} onClick={() => setFilter(s.id)}>
                    {s.label} <span className="seg-count">{s.id === "all" ? store.list.length : counts[s.id]}</span>
                  </button>
                ))}
              </div>
              <label className="home-search">
                <span className="sr-only">Search proposals</span>
                <input type="search" placeholder="Search client, reference or venue" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
            </div>
          </>
        )}
        {sorted.length === 0 ? (
          <div className="empty-state">
            <p>No proposals yet. Start one above — drafts are saved on this device as you work.</p>
          </div>
        ) : shown.length === 0 ? (
          <div className="empty-state">
            <p>No {filter === "all" ? "" : `${statusLabel(filter).toLowerCase()} `}proposals{query.trim() ? ` match “${query.trim()}”` : " yet"}.</p>
            <button className="btn-ghost" onClick={() => { setFilter("all"); setQuery(""); }}>Show all proposals</button>
          </div>
        ) : (
          <ul className="cards">
            {shown.map((p) => {
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
                      <span className={`pcard-status is-${proposalStatus(p)}`}>
                        {statusLabel(proposalStatus(p))}
                        {p.statusAt && proposalStatus(p) !== "draft" && ` ${formatDate(todayISO(new Date(p.statusAt)))}`}
                      </span>
                      {answers.get(p.id) && <ClientAnswer d={answers.get(p.id)!} />}
                    </span>
                  </button>
                  <div className="pcard-tools">
                    {answers.get(p.id)?.kind === "approved" && proposalStatus(p) === "sent" && (
                      <button className="link-btn" onClick={() => store.save({ ...p, ...statusPatch(p, "accepted") })}>Mark accepted</button>
                    )}
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
