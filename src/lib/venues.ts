import type { Venue } from "../types";

export interface VenueFilter {
  q: string;
  type: string; // "all" or a venueTypes id
  area: string; // "all" or an area name
}

/** Case-insensitive match on name, alias, area, address, description, features and space names; every word must match. */
export function filterVenues(venues: Venue[], f: VenueFilter): Venue[] {
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  return venues.filter((v) => {
    if (f.type !== "all" && v.type !== f.type) return false;
    if (f.area !== "all" && v.area !== f.area) return false;
    if (!words.length) return true;
    const hay = [v.name, v.aka, v.area, v.city, v.address, v.description, ...(v.features ?? []), ...v.spaces.map((s) => s.name)]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export function largestCapacity(v: Venue): number | undefined {
  const caps = v.spaces.map((s) => s.capacity).filter((c): c is number => typeof c === "number");
  return caps.length ? Math.max(...caps) : undefined;
}
