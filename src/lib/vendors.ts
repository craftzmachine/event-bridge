// The vendor rolodex: florists, caterers, photographers and the rest, saved once and found again by category, area
// or name, with what's been paid to each across events. Pure, so it's tested in Node.
import type { Expense } from "./expenses";

export const VENDOR_CATEGORIES = [
  { id: "florist", label: "Florist" },
  { id: "catering", label: "Catering" },
  { id: "photography", label: "Photography & video" },
  { id: "makeup", label: "Makeup & hair" },
  { id: "music", label: "Music & nadaswaram" },
  { id: "decor", label: "Décor & stage" },
  { id: "lighting", label: "Lighting & sound" },
  { id: "transport", label: "Transport" },
  { id: "priest", label: "Priest & rituals" },
  { id: "venue", label: "Venue" },
  { id: "other", label: "Other" },
];

export interface Vendor {
  id: string;
  name: string;
  category: string;
  contact?: string;
  phone?: string;
  email?: string;
  /** shown masked to others */
  upi?: string;
  area?: string;
  /** "₹45,000 for 500 guests, veg" */
  priceNote?: string;
  /** 1–5 */
  rating?: number;
  tags: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
  /** from public/config/vendors.json: shared with the team, read-only here */
  team?: boolean;
}

const norm = (s: string | undefined) => (s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export const isVendor = (x: unknown): x is Vendor => {
  const v = x as Vendor;
  return !!v && typeof v === "object" && typeof v.id === "string" && typeof v.name === "string" && typeof v.category === "string" && Array.isArray(v.tags);
};

export const categoryLabel = (id: string) => VENDOR_CATEGORIES.find((c) => c.id === id)?.label ?? id;

/** A vendor as saved: trimmed, tags de-duplicated, rating kept to 1–5. */
export function cleanVendor(v: Vendor): Vendor {
  const t = (s: string | undefined) => s?.trim() || undefined;
  return {
    ...v,
    name: v.name.trim(),
    contact: t(v.contact),
    phone: t(v.phone),
    email: t(v.email),
    upi: t(v.upi),
    area: t(v.area),
    priceNote: t(v.priceNote),
    notes: t(v.notes),
    rating: v.rating && v.rating >= 1 && v.rating <= 5 ? Math.round(v.rating) : undefined,
    tags: [...new Set(v.tags.map((x) => x.trim().toLowerCase()).filter(Boolean))],
  };
}

/** The team's vendors first (read-only), then this device's; a device copy with the same id wins. */
export function mergeVendors(team: Vendor[], mine: Vendor[]): Vendor[] {
  const ids = new Set(mine.map((v) => v.id));
  return [...team.filter((v) => !ids.has(v.id)).map((v) => ({ ...v, team: true })), ...mine];
}

export interface VendorFilter {
  q?: string;
  category?: string;
  area?: string;
}

/** Search across name, contact, area, tags and notes; best rated first, then by name. */
export function searchVendors(list: Vendor[], f: VendorFilter): Vendor[] {
  const q = norm(f.q);
  return list
    .filter((v) => !f.category || v.category === f.category)
    .filter((v) => !f.area || norm(v.area) === norm(f.area))
    .filter((v) => !q || [v.name, v.contact, v.area, v.priceNote, v.notes, ...v.tags, categoryLabel(v.category)].some((x) => norm(x).includes(q)))
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.name.localeCompare(b.name));
}

export const areasOf = (list: Vendor[]) => [...new Set(list.map((v) => v.area?.trim()).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));

/** What's been paid to each vendor across events, matched by name (ignoring case and punctuation). */
export function spendByVendor(vendors: Vendor[], expenses: Expense[]): Map<string, { total: number; count: number; events: number }> {
  const out = new Map<string, { total: number; count: number; events: number }>();
  for (const v of vendors) {
    const key = norm(v.name);
    const mine = expenses.filter((e) => !e.removed && key && norm(e.vendor) === key);
    if (mine.length)
      out.set(v.id, {
        total: Math.round(mine.reduce((t, e) => t + e.amount, 0) * 100) / 100,
        count: mine.length,
        events: new Set(mine.map((e) => e.eventId)).size,
      });
  }
  return out;
}

/** vendors.json: { "vendors": [Vendor without createdAt/updatedAt] } */
export function validateVendors(x: unknown): string[] {
  const list = (x as { vendors?: unknown })?.vendors;
  if (!x || typeof x !== "object" || !Array.isArray(list)) return [`vendors.json needs a "vendors" list.`];
  const errs: string[] = [];
  const ids = new Set<string>();
  (list as Partial<Vendor>[]).forEach((v, i) => {
    const at = v?.id ? `Vendor "${v.id}"` : `Vendor #${i + 1}`;
    if (!v?.id) errs.push(`${at} has no "id".`);
    else if (ids.has(v.id)) errs.push(`Vendor id "${v.id}" is used twice.`);
    else ids.add(v.id);
    if (!v?.name) errs.push(`${at} has no "name".`);
    if (!VENDOR_CATEGORIES.some((c) => c.id === v?.category)) errs.push(`${at} needs a "category": ${VENDOR_CATEGORIES.map((c) => c.id).join(", ")}.`);
    if (v?.tags !== undefined && !Array.isArray(v.tags)) errs.push(`${at} "tags" must be a list.`);
    if (v?.rating !== undefined && !(typeof v.rating === "number" && v.rating >= 1 && v.rating <= 5)) errs.push(`${at} "rating" must be 1 to 5.`);
  });
  return errs;
}
