import { useEffect, useState } from "react";
import { loadConfig, type Loaded } from "./config/load";
import { ConfigContext } from "./config/context";
import { newProposal, useProposals } from "./state/proposals";
import { AppearanceContext, useAppearanceState } from "./state/appearance";
import Home from "./pages/Home";
import Builder from "./pages/Builder";
import Login from "./pages/Login";
import Venues from "./pages/Venues";
import { endSession, readSession, startSession, type Session } from "./auth/auth";

export default function App() {
  const [config, setConfig] = useState<Loaded | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useState<"home" | "venues">("home");
  const [session, setSession] = useState<Session | null>(readSession);
  const appearance = useAppearanceState();
  const store = useProposals();
  const signOut = () => {
    endSession();
    setOpenId(null);
    setView("home");
    setSession(null);
  };

  useEffect(() => {
    loadConfig().then(setConfig);
  }, []);

  // braces matter: newer browsers return a Promise from scrollTo, which React would treat as a cleanup
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view, openId]);

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
        {!session ? (
          <Login onSignedIn={(email) => setSession(startSession(email))} />
        ) : open ? (
          <Builder key={open.id} proposal={open} onChange={store.save} onClose={() => setOpenId(null)} />
        ) : view === "venues" ? (
          <Venues onBack={() => setView("home")} onStartProposal={(v) => startProposal({ venue: v.name, location: v.area })} />
        ) : (
          <Home
            store={store}
            account={session.email}
            onSignOut={signOut}
            onOpen={setOpenId}
            onVenues={() => setView("venues")}
            onNew={() => startProposal()}
          />
        )}
      </ConfigContext.Provider>
    </AppearanceContext.Provider>
  );
}
