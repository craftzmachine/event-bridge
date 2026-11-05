import { useEffect, useState } from "react";
import { useConfig } from "../config/context";
import { SITE } from "../site";
import AppearanceControls from "./AppearanceControls";

export type NavItem = "home" | "studio" | "venues" | "visualize";

const ITEMS: { id: NavItem; label: string; href: string }[] = [
  { id: "home", label: "Home", href: "#/" },
  { id: "studio", label: "Proposal Studio", href: "#/studio" },
  { id: "venues", label: "Venue Directory", href: "#/venues" },
  { id: "visualize", label: "Visualize Proposal", href: "#/visualize" },
];

/** Event Bridge's main menu, laid over the dark hero of the landing page and the Proposal Studio home. */
export default function SiteNav({ current, account, onSignOut }: { current: NavItem; account?: string; onSignOut?: () => void }) {
  const { brand } = useConfig();
  const [open, setOpen] = useState(false);

  // close the phone menu after navigating or pressing Escape
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("hashchange", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("hashchange", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const links = ITEMS.map((it) => (
    <a key={it.id} href={it.href} aria-current={it.id === current ? "page" : undefined} onClick={() => setOpen(false)}>
      {it.label}
    </a>
  ));
  const access = account ? (
    <>
      <span className="site-account" title={account}>{account}</span>
      <button className="btn-outline-light btn-sm" onClick={onSignOut}>Sign out</button>
    </>
  ) : (
    <a className="btn-gold btn-sm" href="#/login">Team sign in</a>
  );

  return (
    <header className={`site-nav ${open ? "is-open" : ""}`}>
      <a className="site-brand" href="#/" aria-label={`${SITE.name} home`}>
        <img src={`${import.meta.env.BASE_URL}${brand.logo}`} alt="" />
        <span className="site-brand-text">
          <strong>{SITE.name}</strong>
          <small>by {brand.company}</small>
        </span>
      </a>
      <nav className="site-menu" aria-label="Main">{links}</nav>
      <div className="site-nav-actions">
        <AppearanceControls onDark />
        <div className="site-access">{access}</div>
        <button
          type="button"
          className="site-menu-toggle"
          aria-expanded={open}
          aria-controls="site-menu-panel"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
        >
          <span aria-hidden />
        </button>
      </div>
      {open && (
        <div id="site-menu-panel" className="site-menu-panel">
          <nav aria-label="Main">{links}</nav>
          <div className="site-menu-panel-access">{access}</div>
        </div>
      )}
    </header>
  );
}
