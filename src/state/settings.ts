// The company settings edited on the Settings page, kept on this device (see src/lib/settings.ts for the rules).
import { cleanBrandOverrides, type CompanySettings } from "../lib/settings";
import type { Catalog } from "../types";

const KEY = "event-bridge.settings.v1";

export function readSettings(): CompanySettings {
  try {
    const x = JSON.parse(localStorage.getItem(KEY) ?? "{}") as CompanySettings | null;
    if (!x || typeof x !== "object") return {};
    return {
      ...(x.brand ? { brand: cleanBrandOverrides(x.brand) } : {}),
      ...(x.catalog && typeof x.catalog === "object" ? { catalog: x.catalog as Catalog } : {}),
      ...(typeof x.savedAt === "string" ? { savedAt: x.savedAt } : {}),
    };
  } catch {
    return {};
  }
}

/** false when the browser refused (storage full or blocked) */
export function writeSettings(s: CompanySettings): boolean {
  try {
    if (!s.brand && !s.catalog) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ ...s, savedAt: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}
