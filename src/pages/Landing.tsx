import { useConfig } from "../config/context";
import Ornament from "../components/Ornament";
import AppearanceControls from "../components/AppearanceControls";
import heroPhoto from "../assets/_JKN4027.webp";

/** Public entry point: introduces the studio and links to sign-in (#/login) or, when signed in, the studio (#/studio). */
export default function Landing({ signedIn }: { signedIn: boolean }) {
  const { catalog, brand, venues } = useConfig();
  const logo = `${import.meta.env.BASE_URL}${brand.logo}`;
  const enter = signedIn ? { href: "#/studio", label: "Open the studio" } : { href: "#/login", label: "Team sign in" };

  const features = [
    {
      title: "Every occasion",
      text: `${catalog.eventTypes.map((t) => t.label).join(", ")} — in ${catalog.ceremonyStyles.map((s) => s.label).join(", ")} style, in any combination.`,
    },
    {
      title: "A curated catalogue",
      text: `${catalog.elements.length} décor, ceremony, artist and production elements, with quantities, rates, notes and upgrades.`,
    },
    {
      title: "Excel & PDF, ready to send",
      text: "A branded estimate with totals, co-ordination and additional options, exported in one click.",
    },
    {
      title: "Venue directory",
      text: `${venues.venues.length} hotels, resorts and venues in and around Thiruvananthapuram, ready to drop into a proposal.`,
    },
  ];

  return (
    <div className="landing">
      <header className="landing-nav">
        <a className="landing-brand" href="#/" aria-label={`${brand.company} home`}>
          <img src={logo} alt={brand.company} />
        </a>
        <div className="landing-nav-actions">
          <AppearanceControls onDark />
          <a className="btn-gold btn-sm" href={enter.href}>{enter.label}</a>
        </div>
      </header>

      <section className="landing-hero">
        <img className="landing-hero-img" src={heroPhoto} alt="" />
        <div className="landing-hero-text">
          <p className="eyebrow">{brand.company} · Proposal studio</p>
          <h1>Tailored proposals for every <em>celebration</em>.</h1>
          <Ornament />
          <p className="lede">The studio where the {brand.company} team turns a client's wishes into a polished, itemised estimate — in minutes, on any device.</p>
          <div className="hero-actions">
            <a className="btn-gold btn-lg" href={enter.href}>{signedIn ? "Open the studio" : "Sign in to the studio"}</a>
            <button
              type="button"
              className="btn-outline-light btn-lg"
              onClick={() => document.getElementById("landing-features")?.scrollIntoView({ behavior: "smooth" })}
            >
              See what's inside
            </button>
          </div>
        </div>
      </section>

      <main className="landing-main">
        <section id="landing-features" className="landing-features" aria-label="What the studio does">
          {features.map((f, i) => (
            <article key={f.title} className="landing-feature">
              <span className="landing-feature-num">{String(i + 1).padStart(2, "0")}</span>
              <h2>{f.title}</h2>
              <p>{f.text}</p>
            </article>
          ))}
        </section>

        <section className="landing-cta">
          <p className="eyebrow">Team access</p>
          <h2>Part of the {brand.company} team?</h2>
          <p className="lede">Sign in with your team account to start or continue a proposal.</p>
          <a className="btn-primary btn-lg" href={enter.href}>{enter.label}</a>
        </section>
      </main>

      <footer className="home-foot">
        <img src={logo} alt={brand.company} />
        <span>{brand.legalName} · {brand.phone} · {brand.email}</span>
      </footer>
    </div>
  );
}
