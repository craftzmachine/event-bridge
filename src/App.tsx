import { useEffect, useState } from "react";
import { loadConfig, type Loaded } from "./config/load";
import { ConfigContext } from "./config/context";
import { newProposal, useProposals } from "./state/proposals";
import { AppearanceContext, useAppearanceState } from "./state/appearance";
import Home from "./pages/Home";
import Builder from "./pages/Builder";
import Login from "./pages/Login";
import Venues from "./pages/Venues";
import Landing from "./pages/Landing";
import { endSession, readSession, startSession, type Session } from "./auth/auth";

/**
 * Event Bridge's top-level pages live in the URL hash so they can be linked to directly on any static host:
 * #/ (landing), #/login, and the signed-in feature apps #/studio (Proposal Studio) and #/venues (Venue Directory).
 */
type Route = "landing" | "login" | "studio" | "venues";
type AppRoute = "studio" | "venues";
const readRoute = (): Route => {
  const h = window.location.hash.replace(/^#\/?/, "").toLowerCase();
  return h === "login" || h === "studio" || h === "venues" ? h : "landing";
};
const go = (r: Route) => {
  window.location.hash = r === "landing" ? "/" : `/${r}`;
};
// where to land after signing in, when sign-in interrupted the way to a feature app
let returnTo: AppRoute = "studio";

export default function App() {
  const [config, setConfig] = useState<Loaded | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(readSession);
  const [route, setRoute] = useState<Route>(readRoute);
  const appearance = useAppearanceState();
  const store = useProposals();
  const signOut = () => {
    endSession();
    setOpenId(null);
    setSession(null);
    go("login");
  };

  useEffect(() => {
    loadConfig().then(setConfig);
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // keep the address bar honest: the studio needs a session, and a signed-in visitor has no use for the sign-in page
  // the reset happens only once the target is reached: the login → app redirect below races onSignedIn
  useEffect(() => {
    if ((route === "studio" || route === "venues") && !session) {
      returnTo = route;
      go("login");
    } else if (route === "login" && session) go(returnTo);
    else if (session && route === returnTo) returnTo = "studio";
  }, [route, session]);

  // braces matter: newer browsers return a Promise from scrollTo, which React would treat as a cleanup
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route, openId]);

  if (!config) return <div className="boot">Loading…</div>;
  if ("errors" in config)
    return (
      <div className="config-error">
        <p className="eyebrow">Configuration problem</p>
        <h1>The proposal catalogue could not be loaded</h1>
        <p>Fix the following in <code>public/config/</code> and reload the page:</p>
        <ul>
          {config.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </div>
    );

  const startProposal = (venue?: { venue: string; location: string }) => {
    const p = newProposal(config.brand, store.refs, venue);
    store.save(p);
    setOpenId(p.id);
  };

  const open = store.list.find((p) => p.id === openId);
  return (
    <AppearanceContext.Provider value={appearance}>
      <ConfigContext.Provider value={config}>
        {route === "landing" ? (
          <Landing account={session?.email} onSignOut={signOut} />
        ) : !session ? (
          <Login
            onSignedIn={(email) => {
              setSession(startSession(email));
              go(returnTo);
            }}
          />
        ) : open ? (
          <Builder key={open.id} proposal={open} onChange={store.save} onClose={() => setOpenId(null)} />
        ) : route === "venues" ? (
          <Venues onBack={() => go("studio")} onStartProposal={(v) => startProposal({ venue: v.name, location: v.area })} />
        ) : (
          <Home
            store={store}
            account={session.email}
            onSignOut={signOut}
            onOpen={setOpenId}
            onVenues={() => go("venues")}
            onNew={() => startProposal()}
          />
        )}
      </ConfigContext.Provider>
    </AppearanceContext.Provider>
  );
}
