import { describe, expect, it } from "vitest";
import { generateQuoteRef, quoteRefDate, QUOTE_REF_PATTERN } from "./quoteRef";

const nov3 = new Date(2026, 10, 3);

describe("quotation reference", () => {
  it("uses year, day, month then three capital letters", () => {
    expect(quoteRefDate(nov3)).toBe("20260311");
    expect(quoteRefDate(new Date(2027, 0, 25))).toBe("20272501");
    const ref = generateQuoteRef([], nov3);
    expect(ref).toMatch(QUOTE_REF_PATTERN);
    expect(ref.startsWith("20260311-")).toBe(true);
  });

  it("never repeats a reference already taken", () => {
    const taken = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const ref = generateQuoteRef(taken, nov3);
      expect(taken.has(ref)).toBe(false);
      taken.add(ref);
    }
  });

  it("finds the last free combination of a day", () => {
    const L = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const taken: string[] = [];
    for (const a of L) for (const b of L) for (const c of L) taken.push(`20260311-${a}${b}${c}`);
    const free = taken.pop()!;
    expect(generateQuoteRef(taken, nov3)).toBe(free);
    expect(() => generateQuoteRef([...taken, free], nov3)).toThrow();
  });
});
