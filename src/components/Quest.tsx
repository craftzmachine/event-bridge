import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Proposal } from "../types";
import { listExpenses } from "../state/expenses";
import { readList } from "../state/local";
import { readLeads } from "../state/crm";
import { readTeamTasks } from "../state/tasks";
import { VENDORS_KEY } from "../state/vendors";
import { isVendor } from "../lib/vendors";
import { navCurrent } from "../lib/nav";
import { LEVELS, newlyDone, QUESTS, questStatus, readQuestStore, TOTAL_XP, TOUR, writeQuestStore, type QuestFacts, type QuestStore } from "../lib/quest";
import Icon from "./icons";

const BACKUP_KEY = "event-bridge.last-backup.v1";
const hasKey = (k: string) => {
  try {
    return !!localStorage.getItem(k);
  } catch {
    return false;
  }
};

/**
 * Wedding Quest: a playful guide to Event Bridge. A floating button opens the quest log (missions that tick
 * themselves off as you really use each app, XP and a title), a welcome card offers the spotlight tour on the first
 * visit, and finishing a quest gets a little confetti.
 */
export default function Quest({ proposals, hash }: { proposals: Proposal[]; hash: string }) {
  const [store, setStore] = useState<QuestStore>(readQuestStore);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<number | null>(null);
  const [expenses, setExpenses] = useState(0);
  const [cheer, setCheer] = useState<{ title: string; xp: number; level?: string } | null>(null);
  const save = useCallback((fn: (s: QuestStore) => QuestStore) => {
    setStore((cur) => {
      const next = fn(cur);
      writeQuestStore(next);
      return next;
    });
  }, []);

  // remember which apps have been opened (for "Scout the venues")
  const route = navCurrent(hash);
  useEffect(() => {
    if (route && !store.visited.includes(route)) save((s) => ({ ...s, visited: [...s.visited, route] }));
  }, [route, store.visited, save]);

  useEffect(() => {
    listExpenses()
      .then((l) => setExpenses(l.filter((e) => !e.removed).length))
      .catch(() => {});
  }, [hash]);

  const facts: QuestFacts = useMemo(
    () => ({
      proposals: proposals.length,
      builtProposal: proposals.some((p) => p.eventType && p.lines.length > 0),
      accepted: proposals.filter((p) => p.status === "accepted").length,
      shared: proposals.some((p) => p.shareId),
      checklists: proposals.filter((p) => p.checklist?.length).length,
      checklistDone: proposals.some((p) => p.checklist?.some((i) => i.state === "done")),
      questionnairesSent: proposals.reduce((t, p) => t + (p.questionnaires?.length ?? 0), 0),
      portals: proposals.filter((p) => p.portalShareId).length,
      leads: readLeads().length,
      vendors: readList(VENDORS_KEY, isVendor).length,
      teamTasks: readTeamTasks().filter((t) => t.state === "done").length,
      expenses,
      backedUp: hasKey(BACKUP_KEY),
      visited: store.visited,
      tourDone: store.tourDone,
    }),
    // re-read the other apps' lists whenever the page changes
    [proposals, expenses, store.visited, store.tourDone, hash],
  );
  const status = questStatus(facts);

  // celebrate quests finished since last time (quietly catch up before the welcome card is answered)
  const doneKey = [...status.done].sort().join(",");
  useEffect(() => {
    const fresh = newlyDone(status.done, store.celebrated);
    if (!fresh.length) return;
    if (store.welcomed) {
      const q = QUESTS.find((x) => x.id === fresh[fresh.length - 1])!;
      const before = status.xp - fresh.reduce((t, id) => t + (QUESTS.find((x) => x.id === id)?.xp ?? 0), 0);
      const levelUp = LEVELS.filter((l) => l.xp > before && l.xp <= status.xp).at(-1);
      setCheer({ title: fresh.length > 1 ? `${fresh.length} quests complete!` : q.title, xp: fresh.reduce((t, id) => t + (QUESTS.find((x) => x.id === id)?.xp ?? 0), 0), level: levelUp?.title });
      setTimeout(() => setCheer(null), 4200);
    }
    save((s) => ({ ...s, celebrated: [...new Set([...s.celebrated, ...fresh])] }));
  }, [doneKey, store.welcomed]);

  const startTour = () => {
    save((s) => ({ ...s, welcomed: true }));
    setOpen(false);
    setStep(0);
  };
  const endTour = (finished: boolean) => {
    setStep(null);
    if (finished) save((s) => ({ ...s, tourDone: true, welcomed: true }));
  };

  const pct = Math.round((status.xp / TOTAL_XP) * 100);
  const welcome = !store.welcomed && route === "dashboard" && step === null;

  return (
    <>
      <button type="button" className="qx-fab" data-tour="quest" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="qx-log">
        <span className="qx-ring" style={{ ["--p" as string]: `${pct}%` }} aria-hidden="true"><Icon name="heart" size={18} /></span>
        <span className="qx-fab-text">
          <strong>Wedding Quest</strong>
          <small>{status.level.title} · {status.xp} XP</small>
        </span>
      </button>

      {open && createPortal(<QuestLog status={status} onClose={() => setOpen(false)} onTour={startTour} />, document.body)}

      {welcome &&
        createPortal(
          <div className="qx-scrim">
            <div className="qx-welcome" role="dialog" aria-modal="true" aria-labelledby="qx-welcome-title">
              <span className="qx-emoji" aria-hidden="true">💍</span>
              <h2 id="qx-welcome-title">Welcome to Wedding Quest!</h2>
              <p>
                You're a <strong>Fresh Garland</strong>. Complete quests by actually using Event Bridge (start a proposal, catch an
                enquiry, befriend a vendor) and rise all the way to <strong>Muhurtham Legend</strong>.
              </p>
              <p className="qx-small">First stop: a two-minute tour. Shorter than a baraat, more useful than a horoscope.</p>
              <div className="qx-actions">
                <button type="button" className="btn-ghost" onClick={() => save((s) => ({ ...s, welcomed: true }))}>Maybe later</button>
                <button type="button" className="btn-primary" onClick={startTour}>Start the tour</button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {step !== null && <Tour step={step} onStep={setStep} onEnd={endTour} />}

      {cheer &&
        createPortal(
          <div className="qx-cheer" role="status">
            <div className="qx-confetti" aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ ["--i" as string]: i }} />)}</div>
            <strong>Quest complete! +{cheer.xp} XP</strong>
            <span>{cheer.title}</span>
            {cheer.level && <span className="qx-levelup">Level up: you're now a {cheer.level}!</span>}
          </div>,
          document.body,
        )}
    </>
  );
}

function QuestLog({ status, onClose, onTour }: { status: ReturnType<typeof questStatus>; onClose: () => void; onTour: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", esc);
    window.addEventListener("hashchange", onClose);
    return () => {
      window.removeEventListener("keydown", esc);
      window.removeEventListener("hashchange", onClose);
    };
  }, [onClose]);
  const toNext = status.next ? status.next.xp - status.xp : 0;
  return (
    <>
      <button type="button" className="qx-scrim qx-scrim-btn" aria-label="Close the quest log" onClick={onClose} />
      <aside id="qx-log" className="qx-log" role="dialog" aria-labelledby="qx-log-title">
        <header className="qx-log-head">
          <div>
            <h2 id="qx-log-title">Wedding Quest</h2>
            <p>
              <strong>{status.level.title}</strong> · {status.xp} of {TOTAL_XP} XP
            </p>
          </div>
          <button type="button" className="vd-close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <span className="qx-bar" aria-hidden="true"><b style={{ width: `${Math.round((status.xp / TOTAL_XP) * 100)}%` }} /></span>
        <p className="qx-small">
          {status.next ? `${toNext} XP to ${status.next.title}.` : "Maximum level. The mandap bows to you."}{" "}
          {status.done.size} of {QUESTS.length} quests done.
        </p>
        <ol className="qx-list">
          {QUESTS.map((q) => {
            const done = status.done.has(q.id);
            return (
              <li key={q.id} className={done ? "is-done" : q.id === status.nextQuest?.id ? "is-next" : ""}>
                <span className="qx-check" aria-hidden="true">{done ? "✓" : ""}</span>
                <span className="qx-q">
                  <strong>{q.title}</strong>
                  <small>{q.blurb}</small>
                </span>
                <span className="qx-xp">
                  +{q.xp} XP
                  {!done && (q.id === "tour" ? <button type="button" className="link-btn" onClick={onTour}>Start</button> : <a className="link-btn" href={q.href}>Show me</a>)}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="qx-actions">
          <button type="button" className="btn-ghost btn-sm" onClick={onTour}>{status.done.has("tour") ? "Replay the tour" : "Take the tour"}</button>
        </div>
      </aside>
    </>
  );
}

/** The spotlight tour: goes to each stop's page, lights up its [data-tour] element and says something about it. */
function Tour({ step, onStep, onEnd }: { step: number; onStep: (n: number) => void; onEnd: (finished: boolean) => void }) {
  const s = TOUR[step];
  const [rect, setRect] = useState<DOMRect | null>(null);
  const last = step === TOUR.length - 1;

  useEffect(() => {
    if (location.hash !== s.hash) location.hash = s.hash.slice(1);
  }, [s.hash]);

  // find the element (pages load lazily, so keep looking for a moment), bring it into view, and follow it
  useLayoutEffect(() => {
    setRect(null);
    if (!s.target) return;
    let tries = 0;
    let el: Element | null = null;
    const measure = () => {
      if (el) setRect(el.getBoundingClientRect());
    };
    const find = window.setInterval(() => {
      el = document.querySelector(`[data-tour="${s.target}"]`);
      if (el || ++tries > 40) {
        window.clearInterval(find);
        if (el) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
          // again once the smooth scroll has settled (it takes longer on phones)
          window.setTimeout(measure, 380);
          window.setTimeout(measure, 900);
        }
      }
    }, 75);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearInterval(find);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [s.target, s.hash]);

  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEnd(false);
      if (e.key === "ArrowRight") (last ? onEnd(true) : onStep(step + 1));
      if (e.key === "ArrowLeft" && step > 0) onStep(step - 1);
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [step, last, onStep, onEnd]);

  const pad = 8;
  const vh = window.innerHeight;
  // the hole, clamped to the screen, and the card below it (or above when there's no room)
  const hole = rect && { top: Math.max(rect.top - pad, 8), left: Math.max(rect.left - pad, 8), width: Math.min(rect.width + pad * 2, window.innerWidth - 16), height: Math.min(rect.height + pad * 2, vh - 16) };
  const below = hole ? hole.top + hole.height + 220 < vh : true;
  const cardStyle = hole
    ? { top: below ? hole.top + hole.height + 14 : undefined, bottom: below ? undefined : vh - hole.top + 14, left: Math.min(Math.max(hole.left, 12), window.innerWidth - Math.min(380, window.innerWidth - 24) - 12) }
    : undefined;

  return createPortal(
    <div className={`qx-tour${hole ? "" : " is-centred"}`} role="dialog" aria-modal="true" aria-labelledby="qx-tour-title">
      {hole ? <div className="qx-hole" style={hole} /> : <div className="qx-dim" />}
      <div className="qx-card" style={cardStyle}>
        <small className="qx-stepno">Stop {step + 1} of {TOUR.length}</small>
        <h2 id="qx-tour-title">{s.title}</h2>
        <p>{s.text}</p>
        <div className="qx-actions">
          <button type="button" className="link-btn" onClick={() => onEnd(false)}>Skip tour</button>
          {step > 0 && <button type="button" className="btn-ghost btn-sm" onClick={() => onStep(step - 1)}>Back</button>}
          <button type="button" className="btn-primary btn-sm" onClick={() => (last ? onEnd(true) : onStep(step + 1))}>{last ? "Finish (+20 XP)" : "Next"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
