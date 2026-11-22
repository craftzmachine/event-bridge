import { createContext, useContext } from "react";
import type { Brand, Catalog, CatalogElement, ChecklistTemplate, ProposalPackage, QuestionnaireTemplate, VenueDirectory } from "../types";
import type { Vendor } from "../lib/vendors";

/** `checklists`: the team's from checklists.json; missing means the built-in list (DEFAULT_CHECKLIST) */
export const ConfigContext = createContext<{ catalog: Catalog; brand: Brand; venues: VenueDirectory; packages: ProposalPackage[]; checklists?: ChecklistTemplate[]; teamVendors?: Vendor[]; teamQuestionnaires?: QuestionnaireTemplate[] } | null>(null);

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
