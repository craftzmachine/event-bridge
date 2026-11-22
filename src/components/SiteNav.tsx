import { useConfig } from "../config/context";
import { SITE } from "../site";
import AppearanceControls from "./AppearanceControls";

/**
 * The public landing page's header: the brand, appearance, and the way in: Team sign in, or Open dashboard when
 * signed in. There's no menu: inside, the Dashboard is the way into every app.
 */
export default function SiteNav({ account, onSignOut }: { account?: string; onSignOut?: () => void }) {
  const { brand } = useConfig();
  return (
    <header className="site-nav lp-nav">
      <a className="site-brand" href="#/" aria-label={`${SITE.name} home`}>
        <img src={`${import.meta.env.BASE_URL}${brand.logo}`} alt="" />
        <span className="site-brand-text">
          <strong>{SITE.name}</strong>
          <small>by {brand.company}</small>
        </span>
      </a>
      <div className="site-nav-actions">
        <AppearanceControls onDark />
        {account ? (
          <>
            <a className="btn-gold btn-sm" href="#/dashboard">Dashboard</a>
            <button className="btn-outline-light btn-sm lp-signout" onClick={onSignOut}>Sign out</button>
          </>
        ) : (
          <a className="btn-gold btn-sm" href="#/login">Team sign in</a>
        )}
      </div>
    </header>
  );
}
