import { createContext, useCallback, useContext, useState } from "react";

export const THEMES = [
  { id: "parinay", label: "Parinay", swatch: ["#fbf8f2", "#b79a68", "#241d18"] },
  { id: "solarized-light", label: "Solarized Light", swatch: ["#fdf6e3", "#b58900", "#073642"] },
  { id: "solarized-dark", label: "Solarized Dark", swatch: ["#002b36", "#b58900", "#eee8d5"] },
  { id: "nord", label: "Nord", swatch: ["#2e3440", "#88c0d0", "#eceff4"] },
  { id: "dark", label: "Dark", swatch: ["#121212", "#c9a96e", "#ededed"] },
  { id: "white", label: "White", swatch: ["#ffffff", "#9a7b45", "#111111"] },
] as const;

/** "classic" is the brand serif mix; the font button cycles classic → sans → mono. */
export const FONTS = [
  { id: "classic", label: "Classic" },
  { id: "sans", label: "Sans Serif" },
  { id: "mono", label: "Mono" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export type FontId = (typeof FONTS)[number]["id"];
export interface Appearance {
  theme: ThemeId;
  font: FontId;
}

const KEY = "proposal-builder.appearance.v1";
// first visit opens in the Dark theme; once someone picks a theme, their saved choice wins
const DEFAULT: Appearance = { theme: "dark", font: "classic" };

export function readAppearance(): Appearance {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Appearance> | null;
    return {
      theme: THEMES.some((t) => t.id === a?.theme) ? (a!.theme as ThemeId) : DEFAULT.theme,
      font: FONTS.some((f) => f.id === a?.font) ? (a!.font as FontId) : DEFAULT.font,
    };
  } catch {
    return DEFAULT;
  }
}

/** Sets the data attributes the theme/font CSS keys off. Called before first render to avoid a flash. */
export function applyAppearance(a: Appearance) {
  const el = document.documentElement;
  el.dataset.theme = a.theme;
  el.dataset.font = a.font;
  const bg = getComputedStyle(el).getPropertyValue("--paper").trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg || "#241d18");
}

/** Owned once by App and shared through AppearanceContext, so every control stays in sync. */
export function useAppearanceState() {
  const [a, setA] = useState<Appearance>(readAppearance);
  const update = useCallback((patch: Partial<Appearance>) => {
    setA((cur) => {
      const next = { ...cur, ...patch };
      applyAppearance(next);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage blocked: applies for this visit only */
      }
      return next;
    });
  }, []);
  const nextFont = FONTS[(FONTS.findIndex((f) => f.id === a.font) + 1) % FONTS.length];
  return {
    ...a,
    nextFont,
    setTheme: (theme: ThemeId) => update({ theme }),
    cycleFont: () => update({ font: nextFont.id }),
  };
}

export type AppearanceApi = ReturnType<typeof useAppearanceState>;
export const AppearanceContext = createContext<AppearanceApi | null>(null);
export function useAppearance() {
  const c = useContext(AppearanceContext);
  if (!c) throw new Error("AppearanceContext missing");
  return c;
}
