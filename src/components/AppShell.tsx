import { useEffect, useState, type ReactNode } from "react";
import { useConfig } from "../config/context";
import { NAV_ITEMS, type NavId } from "../lib/nav";
import { SITE } from "../site";
import AppearanceControls from "./AppearanceControls";
import Icon from "./icons";

const COLLAPSED_KEY = "event-bridge.sidebar.v1";
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "collapsed";
  } catch {
    return false;
  }
};

/**
 * The signed-in app's frame: a sidebar of sections on wide screens (collapsible to icons, remembered on this
 * device) and a bottom tab bar on phones and tablets, with More for the rest. The Builder, sign-in, the landing
 * page and the client's view stay outside it.
 */
export default function AppShell({ current, account, onSignOut, children }: { current: NavId | null; account: string; onSignOut: () => void; children: ReactNode }) {
  const { brand } = useConfig();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [more, setMore] = useState(false);
  // Events arrives with the event workspace
  const items = NAV_ITEMS.filter((x) => x.id !== "events");

  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? "open" : "collapsed");
      } catch {
        /* storage blocked: the choice lasts for this visit */
      }
      return !c;
    });

  // the More sheet closes after navigating or on Escape
  useEffect(() => {
    if (!more) {
      return;
    }
    const close = () => setMore(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("hashchange", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("hashchange", close);
      window.removeEventListener("keydown", esc);
    };
  }, [more]);

  const inMore = items.some((x) => !x.tab && x.id === current);
  return (
    <div className={`shell${collapsed ? " is-collapsed" : ""}`}>
      <aside className="shell-side" aria-label="Sections">
        <a className="shell-brand" href="#/dashboard" title={SITE.name}>
          <img src={`${import.meta.env.BASE_URL}${brand.logo}`} alt="" />
          <span className="shell-label">
            <strong>{SITE.name}</strong>
            <small>{brand.company}</small>
          </span>
        </a>
        <nav className="shell-nav" aria-label="Main">
          {items.map((x) => (
            <a key={x.id} href={x.href} aria-current={x.id === current ? "page" : undefined} title={collapsed ? x.label : undefined}>
              <Icon name={x.icon} />
              <span className="shell-label">{x.label}</span>
            </a>
          ))}
        </nav>
        <div className="shell-foot">
          <div className="shell-label shell-appearance"><AppearanceControls /></div>
          <span className="shell-label shell-account" title={account}>{account}</span>
          <button type="button" className="shell-link" onClick={onSignOut} title={collapsed ? "Sign out" : undefined}>
            <Icon name="logout" />
            <span className="shell-label">Sign out</span>
          </button>
          <button type="button" className="shell-link shell-collapse" onClick={toggle} aria-pressed={collapsed} aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}>
            <Icon name={collapsed ? "expand" : "collapse"} />
            <span className="shell-label">Collapse</span>
          </button>
        </div>
      </aside>

      <div className="shell-main">{children}</div>

      <nav className="shell-tabs" aria-label="Main">
        {items.filter((x) => x.tab).map((x) => (
          <a key={x.id} href={x.href} aria-current={x.id === current ? "page" : undefined}>
            <Icon name={x.icon} />
            <span>{x.short}</span>
          </a>
        ))}
        <button type="button" aria-expanded={more} aria-controls="shell-more" className={inMore ? "is-current" : ""} onClick={() => setMore((m) => !m)}>
          <Icon name="more" />
          <span>More</span>
        </button>
      </nav>
      {more && (
        <>
          <button type="button" className="shell-scrim" aria-label="Close" onClick={() => setMore(false)} />
          <div id="shell-more" className="shell-sheet" role="dialog" aria-label="More">
            <nav aria-label="More sections">
              {items.filter((x) => !x.tab).map((x) => (
                <a key={x.id} href={x.href} aria-current={x.id === current ? "page" : undefined}>
                  <Icon name={x.icon} />
                  <span>{x.label}</span>
                </a>
              ))}
            </nav>
            <AppearanceControls />
            <div className="shell-sheet-account">
              <span title={account}>{account}</span>
              <button type="button" className="btn-ghost btn-sm" onClick={onSignOut}>Sign out</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
