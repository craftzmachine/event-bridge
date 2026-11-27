// Floor plans saved as templates for a venue, so the next wedding there starts from the same room. This device only.
import type { VenueLayout } from "../types";

const KEY = "event-bridge.layouts.v1";

export interface LayoutTemplate {
  id: string;
  name: string;
  venue: string;
  layout: VenueLayout;
  savedAt: string;
}

const isTemplate = (x: unknown): x is LayoutTemplate => {
  const t = x as LayoutTemplate;
  return !!t && typeof t.id === "string" && typeof t.name === "string" && !!t.layout && Array.isArray(t.layout.items) && typeof t.layout.w === "number";
};

export function readTemplates(): LayoutTemplate[] {
  try {
    const x = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(x) ? x.filter(isTemplate) : [];
  } catch {
    return [];
  }
}

export function saveTemplate(t: Omit<LayoutTemplate, "id" | "savedAt">): boolean {
  try {
    const list = readTemplates().filter((x) => !(x.name === t.name && x.venue === t.venue));
    localStorage.setItem(KEY, JSON.stringify([{ ...t, id: Math.random().toString(36).slice(2, 10), savedAt: new Date().toISOString() }, ...list].slice(0, 50)));
    return true;
  } catch {
    return false;
  }
}

export function removeTemplate(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(readTemplates().filter((t) => t.id !== id)));
  } catch {
    /* storage blocked */
  }
}

/** templates for this venue first (matched loosely by name), then the rest */
export function templatesFor(venue: string): LayoutTemplate[] {
  const v = venue.trim().toLowerCase();
  const all = readTemplates();
  return [...all.filter((t) => v && t.venue.trim().toLowerCase() === v), ...all.filter((t) => !v || t.venue.trim().toLowerCase() !== v)];
}
