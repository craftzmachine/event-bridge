import type { Brand, Catalog, VenueDirectory } from "../types";

/** Returns readable problems with an edited catalog.json; empty when it is fine. */
export function validateCatalog(c: unknown): string[] {
  const errs: string[] = [];
  const cat = c as Catalog;
  if (!cat || typeof cat !== "object") return ["catalog.json is not a JSON object."];
  for (const key of ["eventTypes", "ceremonyStyles", "categories", "elements"] as const) {
    if (!Array.isArray(cat[key])) errs.push(`catalog.json is missing the "${key}" list.`);
  }
  if (errs.length) return errs;

  const dupes = (list: { id: string }[], what: string) => {
    const seen = new Set<string>();
    list.forEach((x, i) => {
      if (!x || typeof x.id !== "string" || !x.id) errs.push(`${what} #${i + 1} has no "id".`);
      else if (seen.has(x.id)) errs.push(`${what} id "${x.id}" is used twice.`);
      else seen.add(x.id);
    });
    return seen;
  };
  const types = dupes(cat.eventTypes, "Event type");
  const styles = dupes(cat.ceremonyStyles, "Ceremony style");
  const cats = dupes(cat.categories, "Category");
  dupes(cat.elements, "Element");

  [...cat.eventTypes, ...cat.ceremonyStyles, ...cat.categories].forEach((x) => {
    if (x?.id && !x.label) errs.push(`"${x.id}" has no "label".`);
  });

  cat.elements.forEach((e) => {
    if (!e?.id) return;
    const at = `Element "${e.id}"`;
    if (!e.name) errs.push(`${at} has no "name".`);
    if (!cats.has(e.category)) errs.push(`${at} has unknown category "${e.category}".`);
    if (!e.unit) errs.push(`${at} has no "unit".`);
    if (typeof e.defaultQty !== "number") errs.push(`${at} needs a numeric "defaultQty".`);
    if (e.defaultPrice !== null && typeof e.defaultPrice !== "number")
      errs.push(`${at} "defaultPrice" must be a number or null (as per actuals).`);
    const tags = (list: unknown, known: Set<string>, field: string) => {
      if (!Array.isArray(list) || !list.length) return errs.push(`${at} needs a "${field}" list (use ["*"] for all).`);
      list.forEach((t) => t !== "*" && !known.has(t) && errs.push(`${at} has unknown ${field} entry "${t}".`));
    };
    tags(e.eventTypes, types, "eventTypes");
    tags(e.ceremonyStyles, styles, "ceremonyStyles");
    e.upgrades?.forEach((u) => {
      if (!u.id || !u.name || typeof u.price !== "number")
        errs.push(`${at} has an upgrade without id, name or numeric price.`);
    });
  });
  return errs;
}

export function validateVenues(v: unknown): string[] {
  const dir = v as VenueDirectory;
  if (!dir || typeof dir !== "object") return ["venues.json is not a JSON object."];
  if (!Array.isArray(dir.venueTypes)) return [`venues.json is missing the "venueTypes" list.`];
  if (!Array.isArray(dir.venues)) return [`venues.json is missing the "venues" list.`];
  const errs: string[] = [];
  const types = new Set(dir.venueTypes.map((t) => t?.id));
  const ids = new Set<string>();
  dir.venues.forEach((x, i) => {
    const at = x?.id ? `Venue "${x.id}"` : `Venue #${i + 1}`;
    if (!x?.id) errs.push(`${at} has no "id".`);
    else if (ids.has(x.id)) errs.push(`Venue id "${x.id}" is used twice.`);
    else ids.add(x.id);
    if (!x?.name) errs.push(`${at} has no "name".`);
    if (!x?.area) errs.push(`${at} has no "area".`);
    if (!types.has(x?.type)) errs.push(`${at} has unknown type "${x?.type}".`);
    if (x?.stars !== undefined && (typeof x.stars !== "number" || x.stars < 1 || x.stars > 5)) errs.push(`${at} "stars" must be 1–5.`);
    if (!Array.isArray(x?.spaces)) errs.push(`${at} needs a "spaces" list (can be empty).`);
    if (x?.photo && !x.photoIsRepresentative && !(x.photoCredit?.author && x.photoCredit?.license && x.photoCredit?.source))
      errs.push(`${at} has a photo but no "photoCredit" (author, license and source).`);
  });
  if (dir.venues.filter((x) => x?.featured).length > 1) errs.push(`Only one venue can be "featured".`);
  return errs;
}

export function validateBrand(b: unknown): string[] {
  const brand = b as Brand;
  if (!brand || typeof brand !== "object") return ["brand.json is not a JSON object."];
  const errs: string[] = [];
  for (const key of ["company", "phone", "email"] as const)
    if (!brand[key]) errs.push(`brand.json is missing "${key}".`);
  if (typeof brand.coordinationPct !== "number") errs.push(`brand.json "coordinationPct" must be a number.`);
  if (typeof brand.gstPct !== "number") errs.push(`brand.json "gstPct" must be a number.`);
  if (!Array.isArray(brand.terms)) errs.push(`brand.json "terms" must be a list.`);
  return errs;
}
