import { createContext, useContext } from "react";
import type { Brand, Catalog, CatalogElement, VenueDirectory } from "../types";

export const ConfigContext = createContext<{ catalog: Catalog; brand: Brand; venues: VenueDirectory } | null>(null);

export function useConfig() {
  const c = useContext(ConfigContext);
  if (!c) throw new Error("ConfigContext missing");
  return c;
}

const tagMatch = (tags: string[], id: string | null) => tags.includes("*") || (id !== null && tags.includes(id));

/** Is this element relevant to the chosen event type and ceremony style? */
export function elementFits(e: CatalogElement, eventType: string | null, style: string | null) {
  return tagMatch(e.eventTypes, eventType) && tagMatch(e.ceremonyStyles, style);
}
