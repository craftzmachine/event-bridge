import { useEffect, useMemo, useRef, useState } from "react";
import type { Venue } from "../types";
import { useConfig } from "../config/context";
import { filterVenues, largestCapacity } from "../lib/venues";
import Img from "../components/Img";
import AppearanceControls from "../components/AppearanceControls";

const Stars = ({ n }: { n?: number }) =>
  n ? (
    <span className="stars" aria-label={`${n}-star`}>
      {"★".repeat(n)}
    </span>
  ) : null;

/** Stand-in for venues without a photo yet: the first letters of the main words, in the crest's gold. */
const Monogram = ({ name }: { name: string }) => {
  const words = name.replace(/^the\s+/i, "").split(/[\s,&]+/).filter((w) => /^[A-Za-z]/.test(w));
  return (
    <span className="venue-monogram" aria-hidden>
      {words.slice(0, 2).map((w) => w[0].toUpperCase()).join("")}
    </span>
  );
};

/** Alt text: what the photo shows; stock photos are decorative, so they get none. */
const photoAlt = (v: Venue) => (v.photoIsRepresentative ? "" : v.photoAlt || `Photo of ${v.name}`);

/**
 * Licence credit for a real venue photo, linking to its source page (e.g. Wikimedia Commons).
 * Inside a grid card (itself a button) it is plain text; the dialog carries the link.
 */
const Credit = ({ v, link = true }: { v: Venue; link?: boolean }) => {
  if (!v.photo || !v.photoCredit) return null;
  const text = `Photo: ${v.photoCredit.author} · ${v.photoCredit.license}`;
  return link ? (
    <a className="venue-credit" href={v.photoCredit.source} target="_blank" rel="noreferrer">{text}</a>
  ) : (
    <span className="venue-credit">{text}</span>
  );
};

/** The featured venue: a wide card above the grid, with the photo beside the details. */
function FeaturedVenue({ v, typeLabel, onOpen, onStart }: { v: Venue; typeLabel: string; onOpen: () => void; onStart: () => void }) {
  const cap = largestCapacity(v);
  return (
    <article className="venue-featured" aria-labelledby={`vf-${v.id}`}>
      <div className="venue-featured-photo">
        <Img src={v.photo} alt={photoAlt(v)} />
        {!v.photo && <Monogram name={v.name} />}
        <span className="venue-type">{typeLabel}</span>
        <Credit v={v} />
      </div>
      <div className="venue-featured-body">
        <p className="venue-featured-badge">Featured venue</p>
        <Stars n={v.stars} />
        <h2 id={`vf-${v.id}`}>{v.name}</h2>
        <p className="venue-area">{v.area}, {v.city}</p>
        {v.description && <p className="venue-featured-text">{v.description}</p>}
        {!!v.spaces.length && (
          <ul className="venue-spaces">
            {v.spaces.slice(0, 3).map((s) => (
              <li key={s.name}>
                <span>{s.name}</span>
                <em>{s.capacity ? `up to ${s.capacity.toLocaleString("en-IN")}` : s.size ?? "TBC"}</em>
              </li>
            ))}
          </ul>
        )}
        {cap && <p className="venue-cap">Largest space · up to {cap.toLocaleString("en-IN")} guests</p>}
        <div className="venue-featured-actions">
          <button className="btn-ghost" onClick={onOpen}>Details</button>
          <button className="btn-primary" onClick={onStart} aria-label={`Start a proposal at ${v.name}`}>Start proposal</button>
        </div>
      </div>
    </article>
  );
}

export default function Venues({ onBack, onStartProposal }: { onBack: () => void; onStartProposal: (v: Venue) => void }) {
  const { venues: dir, brand } = useConfig();
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [area, setArea] = useState("all");
  const [open, setOpen] = useState<Venue | null>(null);

  const areas = useMemo(() => [...new Set(dir.venues.map((v) => v.area))].sort(), [dir]);
  const shown = filterVenues(dir.venues, { q, type, area });
  const featured = shown.find((v) => v.featured);
  const rest = shown.filter((v) => v !== featured);
  const typeLabel = (id: string) => dir.venueTypes.find((t) => t.id === id)?.label ?? id;
  const count = (id: string) => dir.venues.filter((v) => id === "all" || v.type === id).length;
  const filtered = q || type !== "all" || area !== "all";

  return (
    <div className="venues-page">
      <header className="topbar">
        <button className="btn-ghost btn-sm" onClick={onBack} aria-label="Back to proposals">
          ←<span className="hide-phone"> Proposals</span>
        </button>
        <img className="topbar-logo" src={`${import.meta.env.BASE_URL}${brand.logo}`} alt={brand.company} />
        <div className="topbar-title">
          <span className="eyebrow">Directory</span>
          <strong>Venues</strong>
        </div>
        <AppearanceControls />
      </header>

      <main className="venues-main">
        <p className="eyebrow">Thiruvananthapuram &amp; around</p>
        <h1>Hotels, resorts &amp; venues</h1>
        {dir.note && <p className="venues-note">{dir.note}</p>}

        <div className="venue-filters">
          <input className="search" type="search" placeholder="Search by name, area or space…" aria-label="Search venues" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="area-select">
            <span className="sr-only">Area</span>
            <select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Filter by area">
              <option value="all">All areas</option>
              {areas.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="tabs" role="tablist" aria-label="Venue type">
          {[{ id: "all", label: "All" }, ...dir.venueTypes.map((t) => ({ ...t, label: `${t.label}s` }))].map((t) => (
            <button key={t.id} role="tab" aria-selected={type === t.id} className={type === t.id ? "is-on" : ""} onClick={() => setType(t.id)}>
              {t.label} <span className="tab-count">{count(t.id)}</span>
            </button>
          ))}
        </div>

        <p className="venue-count" aria-live="polite">
          {shown.length} venue{shown.length === 1 ? "" : "s"}
          {filtered && (
            <button className="link-btn" onClick={() => { setQ(""); setType("all"); setArea("all"); }}>Clear filters</button>
          )}
        </p>

        {shown.length === 0 ? (
          <div className="empty-state">
            {type === "venue" && !q && area === "all"
              ? "No other event venues in the directory yet. Add them to public/config/venues.json."
              : "No venues match. Try a different search or clear the filters."}
          </div>
        ) : (
          <>
          {featured && (
            <FeaturedVenue v={featured} typeLabel={typeLabel(featured.type)} onOpen={() => setOpen(featured)} onStart={() => onStartProposal(featured)} />
          )}
          <ul className="venue-grid">
            {rest.map((v) => {
              const cap = largestCapacity(v);
              return (
                <li key={v.id} className="venue-card">
                  <button className="venue-open" onClick={() => setOpen(v)} aria-label={`Details for ${v.name}`}>
                    <div className="venue-photo">
                      <Img src={v.photo} alt={photoAlt(v)} />
                      {!v.photo && <Monogram name={v.name} />}
                      <span className="venue-type">{typeLabel(v.type)}</span>
                      {v.photoIsRepresentative && <span className="venue-photo-note">Representative photo</span>}
                      <Credit v={v} link={false} />
                    </div>
                    <div className="venue-body">
                      <Stars n={v.stars} />
                      <h3>{v.name}</h3>
                      <p className="venue-area">{v.area}, {v.city}</p>
                      {v.description && <p className="venue-desc">{v.description}</p>}
                      {!v.spaces.length && <p className="venue-tbc">Spaces and capacity to be confirmed</p>}
                      <ul className="venue-spaces">
                        {v.spaces.slice(0, 3).map((s) => (
                          <li key={s.name}>
                            <span>{s.name}</span>
                            <em>{s.capacity ? `up to ${s.capacity.toLocaleString("en-IN")}` : s.size ?? "TBC"}</em>
                          </li>
                        ))}
                      </ul>
                      {cap && <p className="venue-cap">Largest space · up to {cap.toLocaleString("en-IN")} guests</p>}
                    </div>
                  </button>
                  <div className="venue-actions">
                    <button className="btn-ghost btn-sm" onClick={() => setOpen(v)}>Details</button>
                    <button className="btn-primary btn-sm" onClick={() => onStartProposal(v)} aria-label={`Start a proposal at ${v.name}`}>Start proposal</button>
                  </div>
                </li>
              );
            })}
          </ul>
          </>
        )}
      </main>
      {open && <VenueDialog v={open} typeLabel={typeLabel(open.type)} onClose={() => setOpen(null)} onStart={() => onStartProposal(open)} />}
    </div>
  );
}

function VenueDialog({ v, typeLabel, onClose, onStart }: { v: Venue; typeLabel: string; onClose: () => void; onStart: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  // no close() on cleanup: it would fire onClose (and React's dev double-run of effects would
  // immediately dismiss the dialog); removing the element from the page closes it anyway
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} className="venue-dialog" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-labelledby="venue-dialog-title">
      <div className="vd-photo">
        <Img src={v.photo} alt={photoAlt(v)} />
        {!v.photo && <Monogram name={v.name} />}
        {v.photoIsRepresentative && <span className="venue-photo-note">Representative photo</span>}
        <Credit v={v} />
        <button className="vd-close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="vd-body">
        <p className="eyebrow">{v.featured ? "Featured · " : ""}{typeLabel}{v.stars ? ` · ${v.stars}-star` : ""}</p>
        <h2 id="venue-dialog-title">{v.name}</h2>
        {v.aka && <p className="vd-aka">Also known as {v.aka}</p>}
        {v.description && <p className="vd-desc">{v.description}</p>}
        <dl className="vd-facts">
          <div><dt>Area</dt><dd>{v.area}, {v.city}</dd></div>
          {v.address && <div><dt>Address</dt><dd>{v.address}</dd></div>}
          {v.phone && <div><dt>Phone</dt><dd><a href={`tel:${v.phone.replace(/\s/g, "")}`}>{v.phone}</a></dd></div>}
          {v.website && <div><dt>Website</dt><dd><a href={v.website} target="_blank" rel="noreferrer">{new URL(v.website).hostname}</a></dd></div>}
          {v.gallery && <div><dt>Photos</dt><dd><a href={v.gallery} target="_blank" rel="noreferrer">Official gallery ↗</a></dd></div>}
        </dl>

        <h3 className="vd-h">Event spaces</h3>
        {v.spaces.length ? (
          <table className="vd-spaces">
            <thead><tr><th>Space</th><th>Size</th><th>Guests</th></tr></thead>
            <tbody>
              {v.spaces.map((s) => (
                <tr key={s.name}>
                  <td>{s.name}{s.note && <small>{s.note}</small>}</td>
                  <td>{s.size ?? "—"}</td>
                  <td>{s.capacity ? `up to ${s.capacity.toLocaleString("en-IN")}` : "TBC"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty">No event spaces listed yet.</p>
        )}

        {!!v.features?.length && (
          <>
            <h3 className="vd-h">Highlights</h3>
            <ul className="vd-features">{v.features.map((f) => <li key={f}>{f}</li>)}</ul>
          </>
        )}

        {(v.verification || v.sources?.length) && (
          <div className="vd-verify">
            <strong>Verify before quoting.</strong> {v.verification}
            {!!v.sources?.length && (
              <span className="vd-sources">
                Sources:{" "}
                {v.sources.map((s, i) => (
                  <a key={s} href={s} target="_blank" rel="noreferrer">{new URL(s).hostname.replace(/^www\./, "")}{i < v.sources!.length - 1 ? ", " : ""}</a>
                ))}
              </span>
            )}
          </div>
        )}

        <div className="vd-actions">
          <button className="btn-ghost" onClick={onClose}>Close</button>
          <button className="btn-primary" onClick={onStart}>Start a proposal here</button>
        </div>
      </div>
    </dialog>
  );
}
