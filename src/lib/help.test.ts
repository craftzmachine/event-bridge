import { describe, expect, it } from "vitest";
import { FIGURES, GROUPS, HELP, ORDERED, neighbours, searchHelp, searchHits } from "./help";
import { FIGURE_IDS } from "../components/help/figures";
import { APPS } from "./nav";

describe("help", () => {
  it("has a guide for every app on the Dashboard, at the app's own address", () => {
    for (const a of APPS) {
      const t = HELP.find((x) => x.id === a.id);
      expect(t, a.id).toBeDefined();
      expect(t?.href).toBe(a.href);
      expect(t?.title).toBe(a.label);
    }
  });

  it("gives each topic a unique id and at least one step", () => {
    expect(new Set(HELP.map((t) => t.id)).size).toBe(HELP.length);
    for (const t of HELP) {
      expect(t.steps.length, t.id).toBeGreaterThan(0);
      expect(t.summary.length, t.id).toBeGreaterThan(10);
    }
  });

  it("searches every word, ignoring case", () => {
    expect(searchHelp(HELP, "")).toBe(HELP);
    expect(searchHelp(HELP, "   ")).toBe(HELP);
    const ids = searchHelp(HELP, "HANDOVER").map((t) => t.id);
    expect(ids).toContain("expenses");
    expect(searchHelp(HELP, "zzqx-nothing")).toEqual([]);
    expect(searchHelp(HELP, "venue capacity").map((t) => t.id)).toContain("venues");
  });

  it("keeps only the matching questions when a topic is found through them", () => {
    const hits = searchHelp(HELP, "google pay");
    const ex = hits.find((t) => t.id === "expenses");
    expect(ex?.faqs?.map((f) => f.q)).toEqual(["Can it read my Google Pay payments automatically?"]);
    const faq = searchHelp(HELP, "another device").find((t) => t.id === "faq");
    expect(faq?.faqs).toHaveLength(1);
  });

  it("contains no email addresses or credentials", () => {
    const text = JSON.stringify(HELP);
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(text).not.toMatch(/password\s*[:=]/i);
  });

  it("links only to topics, figures and groups that exist", () => {
    expect([...FIGURE_IDS].sort()).toEqual([...FIGURES].sort());
    const ids = new Set(HELP.map((t) => t.id));
    for (const t of HELP) {
      expect(GROUPS.some((g) => g.id === t.group), t.id).toBe(true);
      for (const r of t.related ?? []) expect(ids.has(r), `${t.id} → ${r}`).toBe(true);
    }
    expect(ORDERED).toHaveLength(HELP.length);
    expect(neighbours(ORDERED, ORDERED[0].id).prev).toBeUndefined();
    expect(neighbours(ORDERED, "nope").topic).toBeUndefined();
  });

  it("points search results at the exact step, best first", () => {
    expect(searchHits(HELP, " ")).toEqual([]);
    const hits = searchHits(HELP, "prepare handover");
    expect(hits[0]).toMatchObject({ kind: "step" });
    expect(hits[0].topic.id).toBe("expenses");
    expect(hits[0].text).toMatch(/Prepare handover/);
    const top = searchHits(HELP, "keyboard shortcuts")[0];
    expect(top).toMatchObject({ kind: "topic" });
    expect(searchHits(HELP, "aisle").some((h) => h.kind === "shortcut" || h.kind === "step" || h.kind === "tip")).toBe(true);
  });
});
