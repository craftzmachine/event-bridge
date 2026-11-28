// One help topic: summary, drawing, numbered steps, good to know, shortcuts, questions and related topics. Shared by
// the Help page and the in-app help panel. `focus` (a step number from 1) scrolls to that step and highlights it.
import { useEffect, type ReactNode } from "react";
import Icon from "../icons";
import { HELP, type HelpTopic } from "../../lib/help";
import Figure from "./figures";

/** the words of the query marked in a text */
export function Marked({ text, query }: { text: string; query?: string }) {
  const terms = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return <>{text}</>;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return <>{text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part))}</>;
}

export default function TopicView({ topic: t, focus, query, compact = false, titled = true, related }: {
  topic: HelpTopic;
  focus?: number;
  query?: string;
  /** the help panel: a smaller heading and no "Open" button */
  compact?: boolean;
  /** false when the page already shows the title and summary (the Help page's header) */
  titled?: boolean;
  /** how a related topic is linked: an href on the Help page, a button in the panel */
  related?: (t: HelpTopic) => ReactNode;
}) {
  const sid = (n: number) => `help-${t.id}-step-${n}`;
  useEffect(() => {
    if (!focus) return;
    // wait a frame so the step exists after a lazy load
    const id = requestAnimationFrame(() => {
      document.getElementById(sid(focus))?.scrollIntoView({ block: "center" });
    });
    return () => {
      cancelAnimationFrame(id);
    };
  }, [t.id, focus]);
  const rel = (t.related ?? []).map((id) => HELP.find((x) => x.id === id)).filter((x): x is HelpTopic => !!x);

  return (
    <article className={`hp-topic${compact ? " is-compact" : ""}`} aria-labelledby={`help-${t.id}-h`}>
      <header className="hp-topic-head">
        {titled ? <Icon name={t.icon} size={compact ? 20 : 24} /> : null}
        <h2 id={`help-${t.id}-h`} className={titled ? undefined : "sr-only"}>{t.title}</h2>
        {!compact && t.href && (
          <a className="btn-ghost hp-open" href={t.href}>
            Open {t.title}
          </a>
        )}
      </header>
      {titled && <p className="hp-summary">{t.summary}</p>}
      {t.figure && (
        <figure className="hp-figure">
          <Figure id={t.figure} />
          <figcaption>The numbers match the steps below.</figcaption>
        </figure>
      )}
      <h3 className="hp-sub" id={`help-${t.id}-steps`}>Step by step</h3>
      <ol className="hp-steps">
        {t.steps.map((s, i) => (
          <li key={i} id={sid(i + 1)} className={focus === i + 1 ? "is-hit" : undefined}>
            <Marked text={s} query={focus === i + 1 ? query : undefined} />
          </li>
        ))}
      </ol>
      {t.tips && t.tips.length > 0 && (
        <section className="hp-tips" aria-labelledby={`help-${t.id}-tips`}>
          <h3 className="hp-sub" id={`help-${t.id}-tips`}>Good to know</h3>
          <ul>
            {t.tips.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}
      {t.shortcuts && t.shortcuts.length > 0 && (
        <section className="hp-keys" aria-labelledby={`help-${t.id}-keys`}>
          <h3 className="hp-sub" id={`help-${t.id}-keys`}>Keyboard shortcuts</h3>
          <table>
            <tbody>
              {t.shortcuts.map((k) => (
                <tr key={k.keys}>
                  <th scope="row">{k.keys.split(" / ").map((part, i) => <span key={i}>{i > 0 && " / "}<kbd>{part}</kbd></span>)}</th>
                  <td>{k.does}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {t.faqs && t.faqs.length > 0 && (
        <section className="hp-faqs" aria-labelledby={`help-${t.id}-faqs`}>
          <h3 className="hp-sub" id={`help-${t.id}-faqs`}>Questions</h3>
          {t.faqs.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </section>
      )}
      {rel.length > 0 && related && (
        <nav className="hp-related" aria-label="Related topics">
          <span>Related:</span>
          {rel.map((r) => <span key={r.id}>{related(r)}</span>)}
        </nav>
      )}
    </article>
  );
}
