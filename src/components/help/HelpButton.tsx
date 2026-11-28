// The "?" next to a page's title: opens that app's guide in a side panel without leaving the page. Tiny on purpose:
// the panel, the help text and the drawings load only when it's pressed.
import { lazy, Suspense, useState } from "react";

const HelpDrawer = lazy(() => import("./HelpDrawer"));

export default function HelpButton({ topic, className = "" }: { topic: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`hb-btn ${className}`} aria-label="Help for this page" title="Help for this page" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        ?
      </button>
      {open && (
        <Suspense fallback={null}>
          <HelpDrawer topic={topic} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
