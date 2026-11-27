import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import Icon from "../components/icons";
import { HELP, searchHelp } from "../lib/help";

/** #/help: how to use each app; #/help/<topic> opens at that topic. */
export default function Help({ path }: { path: string[] }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => searchHelp(HELP, q), [q]);
  const searching = q.trim() !== "";
  const target = path[0]?.toLowerCase();

  useEffect(() => {
    if (!target) return;
    // wait a frame so the section exists after a lazy load
    const id = requestAnimationFrame(() => {
      document.getElementById(`help-${target}`)?.scrollIntoView({ block: "start" });
    });
    return () => {
      cancelAnimationFrame(id);
    };
  }, [target]);

  return (
    <div className="hp-page">
      <PageHeader crumbs={[{ label: "Dashboard", href: "#/dashboard" }, { label: "Help" }]} title="Help" subtitle="How to use Event Bridge, step by step." />
      <main className="hp-main">
        <nav className="hp-index" aria-label="Help topics">
          {HELP.map((t) => (
            <a key={t.id} href={`#/help/${t.id}`} className={target === t.id ? "is-on" : ""} aria-current={target === t.id ? "location" : undefined}>
              <Icon name={t.icon} size={18} />
              <span>{t.title}</span>
            </a>
          ))}
        </nav>
        <div className="hp-body">
          <input type="search" className="hp-search" placeholder="Search help, e.g. backup, handover, password" aria-label="Search help" value={q} onChange={(e) => setQ(e.target.value)} />
          {searching && (
            <p className="hint" role="status">
              {shown.length ? `${shown.length} topic${shown.length === 1 ? "" : "s"} match “${q.trim()}”.` : `No help matches “${q.trim()}”. Try another word.`}
            </p>
          )}
          {shown.map((t) => (
            <section key={t.id} id={`help-${t.id}`} className="hp-topic" aria-labelledby={`help-${t.id}-h`}>
              <header className="hp-topic-head">
                <Icon name={t.icon} size={22} />
                <h2 id={`help-${t.id}-h`}>{t.title}</h2>
                {t.href && (
                  <a className="btn-ghost hp-open" href={t.href}>
                    Open {t.title}
                  </a>
                )}
              </header>
              <p className="hp-summary">{t.summary}</p>
              <ol className="hp-steps">
                {t.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              {t.tips && t.tips.length > 0 && (
                <div className="hp-tips">
                  <h3>Good to know</h3>
                  <ul>
                    {t.tips.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {t.faqs && t.faqs.length > 0 && (
                <div className="hp-faqs">
                  {t.faqs.map((f) => (
                    // reopen matching answers while searching
                    <details key={`${f.q}-${searching}`} open={searching || undefined}>
                      <summary>{f.q}</summary>
                      <p>{f.a}</p>
                    </details>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
