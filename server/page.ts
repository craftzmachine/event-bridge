// "Web page" shares: a snapshot of the proposal that the client's browser renders as a themed page, instead of
// page images of a PDF. The snapshot is built by src/lib/proposalPage.ts; this file can't import it (see CLAUDE.md),
// so it checks the shape it needs and drops anything it doesn't recognise.

export const PAGE_MAX_BYTES = 256 * 1024;
/** keep in step with THEMES in src/state/appearance.ts */
export const PAGE_THEMES = ["parinay", "solarized-light", "solarized-dark", "nord", "dark", "white"] as const;
const MAX_LINES = 400;
const MAX_TERMS = 60;

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === "object" && !Array.isArray(x);
const str = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const numOrNull = (x: unknown) => (x === null ? null : num(x));
/** catalogue photos: a site-relative image path or an https URL, nothing else (no javascript:, data: and so on) */
const imageUrl = (x: unknown) => {
  const s = str(x, 600);
  return /^https:\/\/[^\s"'<>]+$/.test(s) || /^images\/[A-Za-z0-9_./-]+$/.test(s) ? s : "";
};

/** The cleaned snapshot, or why it can't be shared. */
export function validatePage(text: string): { page: Obj; client: string } | { error: string } {
  if (Buffer.byteLength(text) > PAGE_MAX_BYTES) return { error: "This proposal is too large to share as a web page. Share it as a PDF instead." };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "The proposal page didn't arrive complete. Please try again." };
  }
  if (!isObj(raw) || raw.v !== 1 || !isObj(raw.proposal) || !isObj(raw.catalog)) return { error: "The proposal page isn't in a format this site can show." };
  const theme = PAGE_THEMES.find((t) => t === raw.theme);
  if (!theme) return { error: "Choose one of the site's themes for the page." };

  const p = raw.proposal;
  const c = isObj(p.client) ? p.client : {};
  const lines = (Array.isArray(p.lines) ? p.lines : []).slice(0, MAX_LINES).filter(isObj).map((l, i) => ({
    uid: str(l.uid, 40) || `l${i}`,
    elementId: null,
    name: str(l.name, 300),
    category: str(l.category, 80),
    unit: str(l.unit, 60),
    qty: num(l.qty),
    rate: numOrNull(l.rate),
    notes: str(l.notes, 2000),
    optional: l.optional === true,
    upgrades: (Array.isArray(l.upgrades) ? l.upgrades : []).filter(isObj).slice(0, 20)
      // only what the client may see: included and offered upgrades
      .filter((u) => u.mode === "include" || u.mode === "offer")
      .map((u, j) => ({ id: str(u.id, 60) || `u${j}`, name: str(u.name, 300), price: num(u.price), mode: u.mode as "include" | "offer" })),
  }));
  const choice = (list: unknown) =>
    (Array.isArray(list) ? list : []).filter(isObj).slice(0, 1).map((x) => ({ id: str(x.id, 60), label: str(x.label, 120), blurb: "", image: imageUrl(x.image) }));
  const categories = (Array.isArray(raw.catalog.categories) ? raw.catalog.categories : []).filter(isObj).slice(0, 60)
    .map((x) => ({ id: str(x.id, 80), label: str(x.label, 120), order: num(x.order) }));

  const client = str(c.name, 120);
  const page = {
    v: 1,
    theme,
    dated: /^\d{4}-\d{2}-\d{2}$/.test(str(raw.dated, 10)) ? str(raw.dated, 10) : "",
    proposal: {
      client: {
        name: client,
        contact: str(c.contact, 200),
        date: str(c.date, 10),
        dates: (Array.isArray(c.dates) ? c.dates : []).map((d) => str(d, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 30),
        venue: str(c.venue, 200),
        location: str(c.location, 200),
      },
      ref: str(p.ref, 40),
      eventType: str(p.eventType, 60) || null,
      style: str(p.style, 60) || null,
      lines,
      coordinationPct: num(p.coordinationPct),
      grandTotal: numOrNull(p.grandTotal ?? null),
      terms: (Array.isArray(p.terms) ? p.terms : []).map((t) => str(t, 2000)).filter(Boolean).slice(0, MAX_TERMS),
      notes: str(p.notes, 4000),
    },
    catalog: { eventTypes: choice(raw.catalog.eventTypes), ceremonyStyles: choice(raw.catalog.ceremonyStyles), categories },
  };
  return { page, client };
}
