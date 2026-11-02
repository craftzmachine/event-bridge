import type { Brand, Catalog, VenueDirectory } from "../types";
import { validateBrand, validateCatalog, validateVenues } from "./validate";

export type Loaded = { catalog: Catalog; brand: Brand; venues: VenueDirectory } | { errors: string[] };

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

export async function loadConfig(): Promise<Loaded> {
  try {
    const [catalog, brand, venues] = await Promise.all([
      getJson("config/catalog.json"),
      getJson("config/brand.json"),
      getJson("config/venues.json"),
    ]);
    const errors = [...validateCatalog(catalog), ...validateBrand(brand), ...validateVenues(venues)];
    if (errors.length) return { errors };
    return { catalog: catalog as Catalog, brand: brand as Brand, venues: venues as VenueDirectory };
  } catch (e) {
    return { errors: [(e as Error).message] };
  }
}
