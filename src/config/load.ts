import type { Brand, Catalog, ChecklistTemplate, ProposalPackage, VenueDirectory } from "../types";
import { validateBrand, validateCatalog, validateChecklists, validatePackages, validateVenues } from "./validate";

export type Loaded = { catalog: Catalog; brand: Brand; venues: VenueDirectory; packages: ProposalPackage[]; checklists?: ChecklistTemplate[] } | { errors: string[] };

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
  try {
    return await res.json();
  } catch (e) {
    throw new Error(`${path} is not valid JSON: ${(e as Error).message}`);
  }
}

export async function loadConfig(): Promise<Loaded> {
  try {
    const [catalog, brand, venues, packages, checklists] = await Promise.all([
      getJson("config/catalog.json"),
      getJson("config/brand.json"),
      getJson("config/venues.json"),
      getOptionalJson("config/packages.json", { packages: [] }),
      // optional too: without it, checklists start from the built-in list
      getOptionalJson("config/checklists.json", null),
    ]);
    const errors = [...validateCatalog(catalog), ...validateBrand(brand), ...validateVenues(venues)];
    if (!errors.length) errors.push(...validatePackages(packages, catalog as Catalog));
    if (checklists !== null) errors.push(...validateChecklists(checklists));
    if (errors.length) return { errors };
    return {
      catalog: catalog as Catalog,
      brand: brand as Brand,
      venues: venues as VenueDirectory,
      packages: (packages as { packages: ProposalPackage[] }).packages,
      ...(checklists !== null ? { checklists: (checklists as { items: ChecklistTemplate[] }).items } : {}),
    };
  } catch (e) {
    return { errors: [(e as Error).message] };
  }
}
