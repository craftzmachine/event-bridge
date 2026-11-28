// The in-app help panel: one topic beside the page, with its drawing, steps, shortcuts and questions. Related topics
// open in the same panel; "Open in Help" goes to the full page. It renders into the fullscreen element when there is
// one (a fullscreen floor plan), so it stays visible. Esc, the scrim or ✕ closes it, and focus stays inside while open.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HELP } from "../../lib/help";
import TopicView from "./TopicView";

export default function HelpDrawer({ topic: first, onClose }: { topic: string; onClose: () => void }) {
  const [id, setId] = useState(first);
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const topic = HELP.find((t) => t.id === id) ?? HELP[0];

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      // keep Tab inside the panel
      const f = [...panel.current.querySelectorAll<HTMLElement>("a[href], button, summary, [tabindex]:not([tabindex='-1'])")].filter((el) => !el.hasAttribute("disabled"));
      if (!f.length) return;
      const [a, z] = [f[0], f[f.length - 1]];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("keydown", key, true);
      before?.focus?.();
    };
  }, [onClose]);

  useEffect(() => {
    panel.current?.querySelector(".hd-body")?.scrollTo({ top: 0 });
  }, [id]);

  return createPortal(
    <>
      <div className="hd-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={panel} className="hd-panel" role="dialog" aria-modal="true" aria-label={`Help: ${topic.title}`}>
        <div className="hd-bar">
          <strong>Help</strong>
          {id !== first && <button type="button" className="link-btn" onClick={() => setId(first)}>← Back</button>}
          <a href={`#/help/${topic.id}`} onClick={onClose}>Open in Help</a>
          <button ref={close} type="button" className="hb-btn" aria-label="Close help" onClick={onClose}>✕</button>
        </div>
        <div className="hd-body">
          <TopicView topic={topic} compact related={(r) => <button type="button" onClick={() => setId(r.id)}>{r.title}</button>} />
        </div>
      </div>
    </>,
    document.fullscreenElement ?? document.body,
  );
}
