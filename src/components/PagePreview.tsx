import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import type { Proposal } from "../types";
import type { ThemeId } from "../state/appearance";
import { useConfig } from "../config/context";
import { pageSnapshot } from "../lib/proposalPage";
import ProposalPage from "./ProposalPage";
import ThemePicker from "./ThemePicker";

/**
 * Full-screen preview of the proposal as a web page, exactly as the client will see it after the password,
 * with the theme switchable before sharing.
 */
export default function PagePreview({
  p,
  theme,
  onTheme,
  onShare,
  onClose,
}: {
  p: Proposal;
  theme: ThemeId;
  onTheme: (t: ThemeId) => void;
  onShare: () => void;
  onClose: () => void;
}) {
  const { catalog } = useConfig();
  const ref = useRef<HTMLDialogElement>(null);
  const snapshot = useMemo(() => pageSnapshot(p, catalog, theme), [p, catalog, theme]);

  // no close() on cleanup: it fires onClose, and React's dev double-run would dismiss the dialog
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  return createPortal(
    <dialog ref={ref} className="venue-dialog page-preview" onClose={onClose} aria-labelledby="page-preview-title">
      <header className="xi-head page-preview-head">
        <div>
          <h2 id="page-preview-title">Web page preview</h2>
          <p>This is what {p.client.name || "your client"} sees after entering the password, watermarked with their name.</p>
        </div>
        <div className="page-preview-tools">
          <ThemePicker value={theme} onChange={onTheme} />
          <div className="page-preview-actions">
            <button className="btn-ghost" onClick={onClose}>Back to editing</button>
            <button className="btn-primary" onClick={onShare}>Create private link</button>
          </div>
        </div>
        <button className="vd-close" onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className="page-preview-body">
        <ProposalPage snapshot={snapshot} />
      </div>
    </dialog>,
    document.body,
  );
}
