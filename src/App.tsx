import { useEffect, useState } from "react";
import { loadConfig, type Loaded } from "./config/load";
import { ConfigContext } from "./config/context";
import { newProposal, useProposals } from "./state/proposals";
import { proposalFromPackage } from "./state/packages";
import { AppearanceContext, useAppearanceState } from "./state/appearance";
import Home from "./pages/Home";
import Builder from "./pages/Builder";
import Login from "./pages/Login";
import Venues from "./pages/Venues";
import Landing from "./pages/Landing";
import Visualize from "./pages/Visualize";
import ClientView from "./pages/ClientView";
import { endSession, readSession, SERVER_SIGNIN, startSession, type Session } from "./auth/auth";
import { ApiError, api } from "./lib/api";

/**
 * Event Bridge's top-level pages live in the URL hash so they can be linked to directly on any static host:
 * #/ (landing), #/login, the signed-in feature apps #/studio (Proposal Studio), #/venues (Venue Directory) and
 * #/visualize (Visualize Proposal), and the public #/view/<token> where a client opens a shared proposal.
 */
type Route = "landing" | "login" | "studio" | "venues" | "visualize" | "view";
type AppRoute = "studio" | "venues" | "visualize";
const APP_ROUTES: Route[] = ["studio", "venues", "visualize"];
const readRoute = (hash: string): Route => {
  const h = hash.replace(/^#\/?/, "").split("/")[0].toLowerCase();
  return h === "login" || h === "view" || APP_ROUTES.includes(h as Route) ? (h as Route) : "landing";
};
// the link token stays in the hash, so it never reaches servers or referrers
const viewToken = (hash: string) => hash.replace(/^#\/?/, "").split("/")[1] || undefined;
const go = (r: Exclude<Route, "view">) => {
  window.location.hash = r === "landing" ? "/" : `/${r}`;
};
// where to land after signing in, when sign-in interrupted the way to a feature app
let returnTo: AppRoute = "studio";

export default function App() {
  const [config, setConfig] = useState<Loaded | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(readSession);
  const [hash, setHash] = useState(() => window.location.hash);
  const route = readRoute(hash);
  const appearance = useAppearanceState();
  const store = useProposals();
  const signOut = () => {
    api("staff/logout", { method: "POST" }).catch(() => {});
    endSession();
    setOpenId(null);
    setSession(null);
    go("login");
  };

  useEffect(() => {
    loadConfig().then(setConfig);
  }, []);

  // with server-only sign-in the server decides who is signed in: a saved session it no longer knows ends here
  // (when it can't be reached, the saved session stays, so drafts on this device remain usable offline)
  const signedInAs = session?.email;
  useEffect(() => {
    if (!SERVER_SIGNIN || !signedInAs) {
      return;
    }
    api("staff/me").catch((e: ApiError) => {
      if (e.status === 401) {
        endSession();
        setSession(null);
      }
    });
  }, [signedInAs]);

  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // keep the address bar honest: the studio needs a session, and a signed-in visitor has no use for the sign-in page
  // the reset happens only once the target is reached: the login → app redirect below races onSignedIn
  useEffect(() => {
    if (APP_ROUTES.includes(route) && !session) {
      returnTo = route as AppRoute;
      go("login");
    } else if (route === "login" && session) go(returnTo);
    else if (session && route === returnTo) returnTo = "studio";
  }, [route, session]);

  // braces matter: newer browsers return a Promise from scrollTo, which React would treat as a cleanup
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [hash, openId]);

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
  // the server's sharing session ended: sign in again, then come back here
  const reauth = (back: AppRoute) => {
    endSession();
    setSession(null);
    returnTo = back;
    go("login");
  };
  return (
    <AppearanceContext.Provider value={appearance}>
      <ConfigContext.Provider value={config}>
        {route === "view" ? (
          <ClientView key={viewToken(hash) ?? ""} token={viewToken(hash)} />
        ) : route === "landing" ? (
          <Landing account={session?.email} onSignOut={signOut} />
        ) : !session ? (
          <Login
            onSignedIn={(email) => {
              setSession(startSession(email));
              go(returnTo);
            }}
          />
        ) : route === "visualize" ? (
          <Visualize
            onBack={() => go("studio")}
            onReauth={() => reauth("visualize")}
          />
        ) : open ? (
          // the open proposal survives the sign-in, so it reopens afterwards
          <Builder key={open.id} proposal={open} onChange={store.save} onClose={() => setOpenId(null)} onReauth={() => reauth(route === "venues" ? "venues" : "studio")} />
        ) : route === "venues" ? (
          <Venues onBack={() => go("studio")} onStartProposal={(v) => startProposal({ venue: v.name, location: v.area })} />
        ) : (
          <Home
            store={store}
            account={session.email}
            onSignOut={signOut}
            onOpen={setOpenId}
            onVenues={() => go("venues")}
            onVisualize={() => go("visualize")}
            onNew={() => startProposal()}
            onNewFrom={(pk) => {
              const p = proposalFromPackage(pk, config.brand, store.refs);
              store.save(p);
              setOpenId(p.id);
            }}
          />
        )}
      </ConfigContext.Provider>
    </AppearanceContext.Provider>
  );
}
