import type { ReactNode } from "react";
import { useConfig } from "../config/context";
import { SITE } from "../site";
import AppearanceControls from "./AppearanceControls";
import Icon from "./icons";
import Quest from "./Quest";
import type { Proposal } from "../types";

/**
 * The signed-in app's frame: a slim top bar (the crest back to the Dashboard, appearance, account, sign out) and
 * the page. There's no menu: the Dashboard is the only way into each app. The Builder, sign-in, the landing page
 * and the client's view stay outside it.
 */
export default function AppShell({ account, onSignOut, proposals, hash, children }: { account: string; onSignOut: () => void; proposals: Proposal[]; hash: string; children: ReactNode }) {
  const { brand } = useConfig();
  return (
    <div className="shell">
      <header className="shell-bar">
        <a className="shell-brand" href="#/dashboard" title={`${SITE.name}: Dashboard`}>
          <img src={`${import.meta.env.BASE_URL}${brand.logo}`} alt="" />
          <span className="shell-label">
            <strong>{SITE.name}</strong>
            <small>{brand.company}</small>
          </span>
        </a>
        <div className="shell-bar-tools">
          <AppearanceControls />
          <span className="shell-account" title={account}>{account}</span>
          <button type="button" className="shell-link" onClick={onSignOut} aria-label="Sign out">
            <Icon name="logout" />
            <span className="shell-label">Sign out</span>
          </button>
        </div>
      </header>
      <div className="shell-main">{children}</div>
      <Quest proposals={proposals} hash={hash} />
    </div>
  );
}
