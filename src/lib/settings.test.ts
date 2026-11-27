import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Brand, Catalog } from "../types";
import { applySettings, checkSettings, mergeBrand, readSettingsFile, settingsFile, uniqueId } from "./settings";

const brand = JSON.parse(readFileSync("public/config/brand.json", "utf8")) as Brand;
const catalog = JSON.parse(readFileSync("public/config/catalog.json", "utf8")) as Catalog;

describe("company settings", () => {
  it("lays saved fields over brand.json and keeps the rest", () => {
    const b = mergeBrand(brand, { company: "Lotus Weddings", contact: { ...brand.contact, name: "Asha" } });
    expect(b.company).toBe("Lotus Weddings");
    expect(b.contact.name).toBe("Asha");
    expect(b.colors).toEqual(brand.colors);
  });

  it("drops unknown fields from a saved or imported brand", () => {
    const r = readSettingsFile({ format: "event-bridge.settings", brand: { company: "X", advanceManagers: ["a@b.c"], colors: {} } });
    expect(r).toEqual({ brand: { company: "X" } });
  });

  it("sets aside a saved catalogue that no longer validates instead of failing", () => {
    const broken = { ...catalog, elements: [{ ...catalog.elements[0], category: "nope" }] };
    const r = applySettings(brand, catalog, [], { catalog: broken });
    expect(r.catalog).toBe(catalog);
    expect(r.ignored[0]).toMatch(/catalogue was ignored/);
  });

  it("refuses to save bad values, in plain words", () => {
    expect(checkSettings(brand, { brand: { company: "", gstPct: 140 } }, [])).toEqual(expect.arrayContaining([expect.stringMatching(/company/), "GST % must be between 0 and 100."]));
    expect(checkSettings(brand, { brand: { company: "Lotus" }, catalog }, [])).toEqual([]);
  });

  it("round-trips through a settings file and makes unique ids", () => {
    expect(readSettingsFile(JSON.parse(JSON.stringify(settingsFile({ brand: { gstPct: 12 }, catalog }))))).toEqual({ brand: { gstPct: 12 }, catalog });
    expect(uniqueId("Mandap décor", ["mandap-decor"])).toBe("mandap-decor-2");
  });
});
