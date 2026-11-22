import type { ReactNode } from "react";
import { useConfig } from "../config/context";
import { SITE } from "../site";
import Ornament from "../components/Ornament";
import SiteNav from "../components/SiteNav";
import Icon from "../components/icons";
import { APPS } from "../lib/nav";
import { computeTotals } from "../lib/totals";
import { formatINRShort } from "../lib/format";
import bridePhoto from "../assets/JK_05098.webp";
import canopyPhoto from "../assets/AMU02965.webp";
import mandapPhoto from "../assets/AMU02986.webp";
import couplePhoto from "../assets/_JKN4027.webp";

/** The five apps the landing page shows in more detail, each with a small picture of what it looks like. */
const FEATURES: { id: string; title: string; text: string; points: string[]; mock: ReactNode }[] = [
  {
    id: "crm",
    title: "Every enquiry, from first message to booking",
    text: "Instagram, WhatsApp, a referral or a walk-in: each enquiry keeps its date, guests, budget and venue, moves along as you talk, and becomes a proposal in one click.",
    points: ["A board from New to Won", "Follow-up dates that come back to you", "Every call and meeting in one log"],
    mock: (
      <div className="lp-mock lp-mock-board" aria-hidden="true">
        {["New", "Meeting", "Won"].map((c, i) => (
          <div key={c}>
            <small>{c}</small>
            {Array.from({ length: 3 - i }, (_, k) => <span key={k} className={k === 0 && i === 1 ? "is-due" : ""} />)}
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "tasks",
    title: "Tasks timed back from the muhurtham",
    text: "Each wedding starts with a checklist counted back from its date. Team tasks, the family's to-dos and every wedding's list come together as a list, a board or a calendar.",
    points: ["Overdue, this week and later at a glance", "The family's tasks kept apart", "Tick it once, it's ticked everywhere"],
    mock: (
      <div className="lp-mock lp-mock-list" aria-hidden="true">
        {["Venue booked", "Décor theme agreed", "Final guest count", "Vendors confirmed"].map((t, i) => (
          <span key={t} className={i < 2 ? "is-done" : ""}><i />{t}</span>
        ))}
      </div>
    ),
  },
  {
    id: "vendors",
    title: "A rolodex of the people who make it happen",
    text: "Florists at Chalai, the sadya caterers, the nadaswaram troupe: saved once with their numbers, rates and ratings, and what you've paid them across weddings.",
    points: ["WhatsApp and call in one tap", "Rates, ratings and notes", "Spend per vendor, from your expenses"],
    mock: (
      <div className="lp-mock lp-mock-card" aria-hidden="true">
        <small>Florist · ★★★★★</small>
        <strong>Jasmine & marigold</strong>
        <span>Chalai · rates on file</span>
        <span className="lp-mock-chips"><i>WhatsApp</i><i>Call</i></span>
      </div>
    ),
  },
  {
    id: "questionnaires",
    title: "Questionnaires instead of a hundred messages",
    text: "Ask the family about rituals, food, music and the muhurtham once, in a form they can fill in at their own pace. The answers land in the wedding's workspace.",
    points: ["Seven kinds of question", "Build once, send to every family", "See what's still unanswered"],
    mock: (
      <div className="lp-mock lp-mock-form" aria-hidden="true">
        <small>Food preference *</small>
        <span className="lp-mock-chips"><i>Vegetarian</i><i className="is-on">Both</i><i>Non-veg</i></span>
        <small>Traditional sadya?</small>
        <span className="lp-mock-chips"><i className="is-on">Yes</i><i>No</i></span>
      </div>
    ),
  },
  {
    id: "portal",
    title: "A private portal for every family",
    text: "Behind one password, the family sees their proposal to approve, the to-dos waiting on them, the payment schedule and their questionnaires, always up to date.",
    points: ["View-only and watermarked", "Approve or ask for changes", "Answers come straight back to you"],
    mock: (
      <div className="lp-mock lp-mock-portal" aria-hidden="true">
        <span className="lp-mock-tabs"><i className="is-on">Our proposal</i><i>To-dos</i><i>Payments</i></span>
        <strong>Your wedding, 14th February</strong>
        <span className="lp-mock-bar"><b style={{ width: "70%" }} /></span>
        <small>70% received · balance due 7th February</small>
      </div>
    ),
  },
];

/**
 * The public front door of Event Bridge: what it is, the team's photos, every app it brings together, and the way
 * in. Inside, the Dashboard is the only way into each app, so every link here leads to sign-in or the Dashboard.
 */
export default function Landing({ account, onSignOut }: { account?: string; onSignOut: () => void }) {
  const { catalog, brand, venues, packages } = useConfig();
  const occasion = (eventType: string | null, style: string | null) =>
    [catalog.ceremonyStyles.find((x) => x.id === style)?.label, catalog.eventTypes.find((x) => x.id === eventType)?.label].filter(Boolean).join(" ");
  const logo = `${import.meta.env.BASE_URL}${brand.logo}`;
  const way = account ? "#/dashboard" : "#/login";
  const toApps = () => document.getElementById("lp-apps")?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="lp">
      <SiteNav account={account} onSignOut={onSignOut} />

      <section className="lp-hero">
        <div className="lp-hero-text">
          <h1>Every wedding, <em>beautifully</em> run.</h1>
          <Ornament />
          <p className="lede">
            {SITE.name} is the {brand.company} team's workspace: enquiries, proposals, checklists, vendors, payments and a private portal
            for every family, together on any device.
          </p>
          <div className="lp-hero-actions">
            <a className="btn-gold btn-lg" href={way}>{account ? "Open your dashboard" : "Team sign in"}</a>
            <button type="button" className="btn-outline-light btn-lg" onClick={toApps}>See what's inside</button>
          </div>
          <p className="lp-hero-facts">
            {APPS.length} apps · {venues.venues.length} venues around Thiruvananthapuram · {catalog.elements.length} curated elements
          </p>
        </div>
        <figure className="lp-hero-photo">
          <img src={bridePhoto} alt="A bride in an ivory embroidered lehenga and a red dupatta, smiling at a stone doorway" fetchPriority="high" />
        </figure>
      </section>

      <section className="lp-gallery" aria-label="Weddings by the team">
        <figure className="lp-g-tall">
          <img src={canopyPhoto} alt="A bride and groom in garlands under a canopy of jasmine strings by the sea" loading="lazy" />
        </figure>
        <figure>
          <img src={mandapPhoto} alt="The groom kisses the bride's cheek on a carved seat in a gold seaside mandap" loading="lazy" />
        </figure>
        <figure>
          <img src={couplePhoto} alt="A couple by a still pool, she in a rust gown, he in a printed shirt and mundu" loading="lazy" />
        </figure>
      </section>

      <main className="lp-main">
        <section id="lp-apps" className="lp-apps" aria-labelledby="lp-apps-title">
          <header className="lp-head">
            <h2 id="lp-apps-title">Everything for the wedding, in one place</h2>
            <p className="lede">Sign in once and every app is a tile on your dashboard.</p>
          </header>
          <ul className="lp-app-grid">
            {APPS.map((a) => (
              <li key={a.id}>
                <a href={account ? a.href : "#/login"} className="lp-app">
                  <span className="lp-app-icon"><Icon name={a.icon} size={22} /></span>
                  <strong>{a.label}</strong>
                  <span>{a.description}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <div className="lp-features">
          {FEATURES.map((f, i) => (
            <section key={f.id} className={`lp-feature${i % 2 ? " is-flipped" : ""}`} aria-labelledby={`lp-f-${f.id}`}>
              <div className="lp-feature-text">
                <h2 id={`lp-f-${f.id}`}>{f.title}</h2>
                <p>{f.text}</p>
                <ul>
                  {f.points.map((pt) => <li key={pt}>{pt}</li>)}
                </ul>
              </div>
              {f.mock}
            </section>
          ))}
        </div>

        {packages.length > 0 && (
          <section className="lp-pkgs" aria-labelledby="lp-pkgs-title">
            <header className="lp-head">
              <h2 id="lp-pkgs-title">Celebrations to start from</h2>
              <p className="lede">Each is a starting point: your planner shapes it around your day, your guests and your budget.</p>
            </header>
            <ul className="lp-pkg-list">
              {packages.map((pk) => (
                <li key={pk.id}>
                  <h3>{pk.name}</h3>
                  {occasion(pk.eventType, pk.style) && <p className="lp-pkg-occ">{occasion(pk.eventType, pk.style)}</p>}
                  {pk.description && <p>{pk.description}</p>}
                  <p className="lp-pkg-price">
                    from {formatINRShort(computeTotals({ lines: pk.lines, coordinationPct: pk.coordinationPct ?? brand.coordinationPct, grandTotal: null }, brand.gstPct).grandTotal)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <section className="lp-cta">
        <img src={mandapPhoto} alt="" loading="lazy" />
        <div className="lp-cta-text">
          <h2>Part of the {brand.company} team?</h2>
          <Ornament />
          <p className="lede">{account ? "Pick up where you left off." : `Sign in to ${SITE.name} and everything is on your dashboard.`}</p>
          <div className="lp-hero-actions">
            <a className="btn-gold btn-lg" href={way}>{account ? "Open your dashboard" : "Team sign in"}</a>
            <a className="btn-outline-light btn-lg" href="#/view">Open a shared proposal</a>
          </div>
        </div>
      </section>

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
