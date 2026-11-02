import { useEffect, useState } from "react";
import { loadConfig, type Loaded } from "./config/load";
import { ConfigContext } from "./config/context";
import { newProposal, useProposals } from "./state/proposals";
import Home from "./pages/Home";
import Builder from "./pages/Builder";

export default function App() {
  const [config, setConfig] = useState<Loaded | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const store = useProposals();

  useEffect(() => {
    loadConfig().then(setConfig);
  }, []);

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

  const open = store.list.find((p) => p.id === openId);
  return (
    <ConfigContext.Provider value={config}>
      {open ? (
        <Builder key={open.id} proposal={open} onChange={store.save} onClose={() => setOpenId(null)} />
      ) : (
        <Home
          store={store}
          onOpen={setOpenId}
          onNew={() => {
            const p = newProposal(config.brand);
            store.save(p);
            setOpenId(p.id);
          }}
        />
      )}
    </ConfigContext.Provider>
  );
}
