import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import Icon from "../components/icons";
import TopicView, { Marked } from "../components/help/TopicView";
import { GROUPS, ORDERED, neighbours, searchHits, type HelpHit } from "../lib/help";

const KIND: Record<HelpHit["kind"], string> = { topic: "Topic", step: "Step", tip: "Good to know", faq: "Question", shortcut: "Shortcut" };

/** where a search result goes: the topic, at the step when it's a step */
const hitHref = (h: HelpHit) => `#/help/${h.topic.id}${h.kind === "step" ? `/${h.index + 1}` : ""}`;

/**
 * #/help: an overview of every topic, grouped, with a search that points at the exact step.
 * #/help/<topic>[/<step>]: one topic, at that step.
 */
export default function Help({ path }: { path: string[] }) {
  const [q, setQ] = useState("");
  const target = path[0]?.toLowerCase();
  const step = Number(path[1]) || undefined;
  const { topic, prev, next } = neighbours(ORDERED, target ?? "");
  const hits = useMemo(() => searchHits(ORDERED, q), [q]);
  const searching = q.trim() !== "";

  // a new topic (or step) clears the search and starts at the top unless a step is asked for
  useEffect(() => {
    setQ("");
    if (!step) {
      window.scrollTo({ top: 0 });
    }
  }, [target, step]);

  const index = (
    <nav className="hp-index" aria-label="Help topics">
      {GROUPS.map((g) => (
        <div key={g.id} className="hp-index-group">
          <p>{g.label}</p>
          {ORDERED.filter((t) => t.group === g.id).map((t) => (
            <a key={t.id} href={`#/help/${t.id}`} className={target === t.id ? "is-on" : ""} aria-current={target === t.id ? "page" : undefined}>
              <Icon name={t.icon} size={18} />
              <span>{t.title}</span>
            </a>
          ))}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="hp-page">
      <PageHeader crumbs={[{ label: "Dashboard", href: "#/dashboard" }, { label: "Help", href: topic ? "#/help" : undefined }, ...(topic ? [{ label: topic.title }] : [])]} title={topic ? topic.title : "Help"}
        subtitle={topic ? topic.summary : "How to use Event Bridge, step by step. Every app also has a ? button next to its title."} />
      <main className="hp-main">
        <aside className="hp-side">
          <select className="hp-picker" aria-label="Help topic" value={topic?.id ?? ""} onChange={(e) => { location.hash = e.target.value ? `#/help/${e.target.value}` : "#/help"; }}>
            <option value="">All topics</option>
            {GROUPS.map((g) => (
              <optgroup key={g.id} label={g.label}>
                {ORDERED.filter((t) => t.group === g.id).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </optgroup>
            ))}
          </select>
          {index}
        </aside>
        <div className="hp-body">
          <input type="search" className="hp-search" placeholder="Search help, e.g. backup, handover, password, aisle" aria-label="Search help" value={q} onChange={(e) => setQ(e.target.value)} />
          {searching ? (
            <section aria-live="polite" aria-label="Search results">
              <p className="hint" role="status">{hits.length ? `${hits.length === 40 ? "40+" : hits.length} result${hits.length === 1 ? "" : "s"} for “${q.trim()}”.` : `Nothing matches “${q.trim()}”. Try another word.`}</p>
              <ol className="hp-hits">
                {hits.map((h) => (
                  <li key={`${h.topic.id}-${h.kind}-${h.index}`}>
                    <a href={hitHref(h)} onClick={() => setQ("")}>
                      <span className="hp-hit-where"><Icon name={h.topic.icon} size={16} /> {h.topic.title} · {KIND[h.kind]}{h.kind === "step" ? ` ${h.index + 1}` : ""}</span>
                      <span className="hp-hit-text"><Marked text={h.text} query={q} /></span>
                    </a>
                  </li>
                ))}
              </ol>
            </section>
          ) : topic ? (
            <>
              <TopicView topic={topic} titled={false} focus={step} related={(r) => <a href={`#/help/${r.id}`}>{r.title}</a>} />
              <nav className="hp-pager" aria-label="Previous and next topic">
                {prev ? <a href={`#/help/${prev.id}`}>← {prev.title}</a> : <span />}
                {next ? <a href={`#/help/${next.id}`}>{next.title} →</a> : <span />}
              </nav>
            </>
          ) : (
            GROUPS.map((g) => (
              <section key={g.id} className="hp-group" aria-labelledby={`hp-g-${g.id}`}>
                <h2 id={`hp-g-${g.id}`}>{g.label}</h2>
                <div className="hp-cards">
                  {ORDERED.filter((t) => t.group === g.id).map((t) => (
                    <a key={t.id} className="hp-card" href={`#/help/${t.id}`}>
                      <span className="hp-card-head"><Icon name={t.icon} size={20} /> {t.title}</span>
                      <span className="hp-card-text">{t.summary}</span>
                      <span className="hp-card-meta">{t.steps.length} steps{t.faqs?.length ? ` · ${t.faqs.length} questions` : ""}{t.figure ? " · illustrated" : ""}</span>
                    </a>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
