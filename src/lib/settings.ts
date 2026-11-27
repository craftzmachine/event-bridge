// Company settings edited in the app (Settings page). They're saved on this device and laid over the files in
// public/config: a field set here wins over brand.json, and a saved catalogue replaces catalog.json. Pure, so it's tested.
import type { Brand, Catalog, CatalogElement, Category, ProposalPackage } from "../types";
import { validateBrand, validateCatalog, validatePackages } from "../config/validate";

/** the brand fields the Settings page edits; everything else (colours, plans, categories…) stays with brand.json */
export const BRAND_FIELDS = ["company", "tagline", "legalName", "logo", "address", "phone", "email", "gstin", "contact", "coordinationPct", "coordinationLabel", "gstPct", "terms", "balanceDueDays"] as const;
export type BrandField = (typeof BRAND_FIELDS)[number];
export type BrandOverrides = Partial<Pick<Brand, BrandField>>;

export interface CompanySettings {
  brand?: BrandOverrides;
  catalog?: Catalog;
  savedAt?: string;
}

export const SETTINGS_FORMAT = "event-bridge.settings";
/** a logo stored in settings is a data: URL; cap it so localStorage (≈5 MB) stays healthy */
export const LOGO_MAX_BYTES = 400_000;

/** keep only the known brand fields, so an imported file can't smuggle in anything else */
export function cleanBrandOverrides(x: unknown): BrandOverrides {
  if (!x || typeof x !== "object") return {};
  const src = x as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of BRAND_FIELDS) if (src[k] !== undefined) out[k] = src[k];
  return out as BrandOverrides;
}

/** brand.json with the saved fields on top */
export function mergeBrand(base: Brand, o: BrandOverrides | undefined): Brand {
  if (!o) return base;
  const clean = cleanBrandOverrides(o);
  return { ...base, ...clean, contact: { ...base.contact, ...(clean.contact ?? {}) } };
}

/** The config to run with, and why any saved part was set aside (a saved part that no longer validates is ignored). */
export function applySettings(brand: Brand, catalog: Catalog, packages: ProposalPackage[], s: CompanySettings): { brand: Brand; catalog: Catalog; ignored: string[] } {
  const ignored: string[] = [];
  let b = brand;
  let c = catalog;
  if (s.brand) {
    const merged = mergeBrand(brand, s.brand);
    const errs = validateBrand(merged);
    if (errs.length) ignored.push(`Saved company details were ignored: ${errs[0]}`);
    else b = merged;
  }
  if (s.catalog) {
    const errs = [...validateCatalog(s.catalog), ...validatePackages({ packages }, s.catalog)];
    if (errs.length) ignored.push(`The saved catalogue was ignored: ${errs[0]}`);
    else c = s.catalog;
  }
  return { brand: b, catalog: c, ignored };
}

/** Everything wrong with settings about to be saved, in the wording the Settings page shows. */
export function checkSettings(base: Brand, s: CompanySettings, packages: ProposalPackage[]): string[] {
  const errs: string[] = [];
  const reword = (e: string) => e.replace(/^(brand|catalog)\.json /, "").replace(/^"(\w+)"/, "$1");
  if (s.brand) {
    const b = mergeBrand(base, s.brand);
    errs.push(...validateBrand(b).map(reword));
    if (b.coordinationPct < 0 || b.coordinationPct > 100) errs.push("Co-ordination % must be between 0 and 100.");
    if (b.gstPct < 0 || b.gstPct > 100) errs.push("GST % must be between 0 and 100.");
    if (b.logo.startsWith("data:") && b.logo.length > LOGO_MAX_BYTES * 1.37) errs.push("The logo is too large. Use an image under 400 KB.");
  }
  if (s.catalog) {
    errs.push(...validateCatalog(s.catalog).map(reword));
    s.catalog.elements.forEach((e) => {
      if (!e.name.trim()) errs.push(`An element in "${categoryLabel(s.catalog!.categories, e.category)}" has no name.`);
    });
    errs.push(...validatePackages({ packages }, s.catalog).map((e) => `${e} (a team package uses it, so it can't be removed)`));
  }
  return [...new Set(errs)];
}

const categoryLabel = (cats: Category[], id: string) => cats.find((c) => c.id === id)?.label ?? id;

export function slug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    // NFKD splits "é" into "e" + a combining accent; drop the accent so "décor" becomes "decor"
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "item";
}

/** an id from the name that isn't already taken */
export function uniqueId(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = slug(name);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

export function newElement(catalog: Catalog, category: string): CatalogElement {
  return {
    id: uniqueId("new-element", catalog.elements.map((e) => e.id)),
    name: "",
    category,
    unit: "lump sum",
    defaultQty: 1,
    defaultPrice: 0,
    eventTypes: ["*"],
    ceremonyStyles: ["*"],
  };
}

/** The settings as a file for Export, and back again; anything unexpected is dropped on the way in. */
export function settingsFile(s: CompanySettings) {
  return { format: SETTINGS_FORMAT, version: 1, ...s };
}

export function readSettingsFile(x: unknown): CompanySettings | { error: string } {
  const f = x as { format?: string; brand?: unknown; catalog?: unknown } | null;
  if (!f || typeof f !== "object" || f.format !== SETTINGS_FORMAT) return { error: "That isn't an Event Bridge settings file." };
  const out: CompanySettings = {};
  if (f.brand) out.brand = cleanBrandOverrides(f.brand);
  if (f.catalog) {
    const errs = validateCatalog(f.catalog);
    if (errs.length) return { error: `The catalogue in that file has a problem: ${errs[0]}` };
    out.catalog = f.catalog as Catalog;
  }
  return out;
}
