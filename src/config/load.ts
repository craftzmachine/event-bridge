import type { Brand, Catalog, ChecklistTemplate, ProposalPackage, QuestionnaireTemplate, VenueDirectory } from "../types";
import { validateQuestionnaires } from "../lib/questionnaires";
import { validateBrand, validateCatalog, validateChecklists, validatePackages, validateVenues } from "./validate";
import { validateVendors, type Vendor } from "../lib/vendors";
import { applySettings } from "../lib/settings";
import { readSettings } from "../state/settings";

/** `base`: brand.json and catalog.json as shipped, before this device's Settings; `settingsIgnored`: saved parts set aside */
export type Loaded = { catalog: Catalog; brand: Brand; venues: VenueDirectory; packages: ProposalPackage[]; base: { brand: Brand; catalog: Catalog }; settingsIgnored?: string[]; checklists?: ChecklistTemplate[]; teamVendors?: Vendor[]; teamQuestionnaires?: QuestionnaireTemplate[] } | { errors: string[] };

async function getJson(path: string): Promise<unknown> {
  // no-store so an edited config shows up on the next reload, no rebuild needed
  const res = await fetch(`${import.meta.env.BASE_URL}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status}).`);
  try {
    return await res.json();
  } catch (e) {
    throw new Error(`${path} is not valid JSON: ${(e as Error).message}`);
  }
}

/** packages.json is optional: a host without it simply has no team packages */
async function getOptionalJson(path: string, fallback: unknown): Promise<unknown> {
  const res = await fetch(`${import.meta.env.BASE_URL}${path}`, { cache: "no-store" });
  if (res.status === 404) return fallback;
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status}).`);
  // a host that answers every path with the app's page (the Vite dev server does) means the file isn't there
  if ((res.headers.get("content-type") ?? "").includes("text/html")) return fallback;
  try {
    return await res.json();
  } catch (e) {
    throw new Error(`${path} is not valid JSON: ${(e as Error).message}`);
  }
}

export async function loadConfig(): Promise<Loaded> {
  try {
    const [catalog, brand, venues, packages, checklists, vendors, questionnaires] = await Promise.all([
      getJson("config/catalog.json"),
      getJson("config/brand.json"),
      getJson("config/venues.json"),
      getOptionalJson("config/packages.json", { packages: [] }),
      // optional too: without it, checklists start from the built-in list
      getOptionalJson("config/checklists.json", null),
      // the team's shared vendor list, optional
      getOptionalJson("config/vendors.json", null),
      // the team's questionnaires; without it, the built-in one
      getOptionalJson("config/questionnaires.json", null),
    ]);
    const errors = [...validateCatalog(catalog), ...validateBrand(brand), ...validateVenues(venues)];
    if (!errors.length) errors.push(...validatePackages(packages, catalog as Catalog));
    if (checklists !== null) errors.push(...validateChecklists(checklists));
    if (vendors !== null) errors.push(...validateVendors(vendors));
    if (questionnaires !== null) errors.push(...validateQuestionnaires(questionnaires));
    if (errors.length) return { errors };
    const pkgs = (packages as { packages: ProposalPackage[] }).packages;
    // this device's Settings page, laid over the files; a saved part that no longer fits is set aside, not fatal
    const own = applySettings(brand as Brand, catalog as Catalog, pkgs, readSettings());
    return {
      catalog: own.catalog,
      brand: own.brand,
      base: { brand: brand as Brand, catalog: catalog as Catalog },
      ...(own.ignored.length ? { settingsIgnored: own.ignored } : {}),
      venues: venues as VenueDirectory,
      packages: pkgs,
      ...(checklists !== null ? { checklists: (checklists as { items: ChecklistTemplate[] }).items } : {}),
      ...(questionnaires !== null ? { teamQuestionnaires: (questionnaires as { questionnaires: QuestionnaireTemplate[] }).questionnaires } : {}),
      ...(vendors !== null ? { teamVendors: (vendors as { vendors: Vendor[] }).vendors.map((v) => ({ ...v, tags: v.tags ?? [], createdAt: "", updatedAt: "" })) } : {}),
    };
  } catch (e) {
    return { errors: [(e as Error).message] };
  }
}
