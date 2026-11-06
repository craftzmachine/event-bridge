import { useConfig } from "../config/context";
import { SITE } from "../site";
import Ornament from "../components/Ornament";
import SiteNav from "../components/SiteNav";
import { computeTotals } from "../lib/totals";
import { formatINRShort } from "../lib/format";
import heroPhoto from "../assets/_JKN4027.webp";
import letterPhoto from "../assets/J_J09260.webp";

/**
 * Public entry point of Event Bridge: what the app is, and its feature apps — Proposal Studio first.
 * Feature links go to their own routes; App sends signed-out visitors through sign-in and back.
 */
export default function Landing({ account, onSignOut }: { account?: string; onSignOut: () => void }) {
  const { catalog, brand, venues, packages } = useConfig();
  const occasion = (eventType: string | null, style: string | null) =>
    [catalog.ceremonyStyles.find((x) => x.id === style)?.label, catalog.eventTypes.find((x) => x.id === eventType)?.label].filter(Boolean).join(" ");
  const logo = `${import.meta.env.BASE_URL}${brand.logo}`;
  const toApps = () => document.getElementById("landing-apps")?.scrollIntoView({ behavior: "smooth" });

  const studioPoints = [
    `${catalog.eventTypes.map((t) => t.label).join(", ")} in ${catalog.ceremonyStyles.map((s) => s.label).join(", ")} style, in any combination`,
    `${catalog.elements.length} curated décor, ceremony, artist and production elements, with rates, notes and upgrades`,
    "Live totals with co-ordination, round-off and additional options kept apart",
    "A branded estimate as an Excel workbook or a client-ready PDF, in one click",
  ];

  return (
    <div className="landing">
      <SiteNav current="home" account={account} onSignOut={onSignOut} />

      <section className="landing-hero">
        <img className="landing-hero-img" src={heroPhoto} alt="" />
        <div className="landing-hero-text">
          <h1>Where every celebration <em>comes together</em>.</h1>
          <Ornament />
          <p className="lede">
            The {brand.company} team's workspace for client briefs, venues and polished estimates, on any device.
          </p>
          <div className="hero-actions">
            <a className="btn-gold btn-lg" href="#/studio">Open Proposal Studio</a>
            <button type="button" className="btn-outline-light btn-lg" onClick={toApps}>Explore {SITE.name}</button>
          </div>
        </div>
      </section>

      <main className="landing-main">
        <section id="landing-apps" className="landing-apps" aria-labelledby="landing-apps-title">
          <header className="landing-apps-head">
            <h2 id="landing-apps-title">Apps for every step of the plan</h2>
            <p className="lede">Sign in once with your team account and move between them from the menu.</p>
          </header>

          <div className="landing-apps-grid">
            <article className="landing-app is-featured">
              <h3>Proposal Studio</h3>
              <p className="landing-app-text">
                Turn a client's wishes into a polished, itemised proposal: pick the occasion, curate the elements, review it as the
                client will see it, and send it.
              </p>
              <ul className="landing-app-points">
                {studioPoints.map((pt) => (
                  <li key={pt}>{pt}</li>
                ))}
              </ul>
              <a className="btn-gold btn-lg" href="#/studio">Open Proposal Studio</a>
            </article>

            <article className="landing-app">
              <h3>Venue Directory</h3>
              <p className="landing-app-text">
                {venues.venues.length} hotels, resorts, convention centres and wedding halls in and around Thiruvananthapuram —
                searchable by area and type, and one tap from a new proposal.
              </p>
              <a className="btn-ghost btn-lg" href="#/venues">Browse venues</a>
            </article>
          </div>
        </section>

        {packages.length > 0 && (
          <section className="landing-pkgs" aria-labelledby="landing-pkgs-title">
            <header className="landing-apps-head">
              <h2 id="landing-pkgs-title">Celebrations to start from</h2>
              <p className="lede">Each is a starting point: your planner shapes it around your day, your guests and your budget.</p>
            </header>
            <ul className="landing-pkg-list">
              {packages.map((pk) => (
                <li key={pk.id}>
                  <h3>{pk.name}</h3>
                  {occasion(pk.eventType, pk.style) && <p className="landing-pkg-occ">{occasion(pk.eventType, pk.style)}</p>}
                  {pk.description && <p>{pk.description}</p>}
                  <p className="landing-pkg-price">
                    from {formatINRShort(computeTotals({ lines: pk.lines, coordinationPct: pk.coordinationPct ?? brand.coordinationPct, grandTotal: null }, brand.gstPct).grandTotal)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="landing-viz" aria-labelledby="landing-viz-title">
          <figure className="landing-viz-photo">
            <img src={letterPhoto} alt="A hand holding a printed photo of a couple in front of a red post box marked Letters" loading="lazy" />
          </figure>
          <div className="landing-viz-text">
            <h2 id="landing-viz-title">Visualize Proposal</h2>
            <p>
              Your planner shares the finished proposal as a private link with a separate password. It opens here, view-only and
              watermarked with your name — nothing to download, and the link expires on its own.
            </p>
            <ul className="landing-app-points">
              <li>Password-protected, one link per client</li>
              <li>PDF pages and Excel estimates, read in the browser</li>
              <li>No downloads or printing; links expire and can be revoked</li>
            </ul>
          </div>
          <div className="landing-viz-actions">
            <a className="btn-gold btn-lg" href="#/view">Open a shared proposal</a>
            <a className="btn-outline-light btn-lg" href="#/visualize">Share a proposal</a>
          </div>
        </section>

        <section className="landing-cta">
          <h2>Part of the {brand.company} team?</h2>
          <p className="lede">Sign in to {SITE.name} to start a new proposal or pick up where you left off.</p>
          <a className="btn-primary btn-lg" href={account ? "#/studio" : "#/login"}>{account ? "Open Proposal Studio" : `Sign in to ${SITE.name}`}</a>
        </section>
      </main>

      <footer className="home-foot">
        <img src={logo} alt={brand.company} />
        <span className="home-foot-line">
          <span>{SITE.name}, {brand.legalName}</span>
          <a href={`tel:${brand.phone.replace(/[^+0-9]/g, "")}`}>{brand.phone}</a>
          <a href={`mailto:${brand.email}`}>{brand.email}</a>
        </span>
      </footer>
    </div>
  );
}
