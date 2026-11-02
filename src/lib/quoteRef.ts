const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Date part of a quotation reference: year, day, month — 3 Nov 2026 → "20260311". */
export function quoteRefDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getDate())}${pad(d.getMonth() + 1)}`;
}

function randomLetters(n: number): string {
  const bytes = new Uint32Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => LETTERS[b % 26]).join("");
}

/**
 * New reference in the form YYYYDDMM-ABC, unique among `taken`.
 * 17,576 letter combinations per day; throws only if every one is used.
 */
export function generateQuoteRef(taken: Iterable<string>, date = new Date()): string {
  const used = new Set(taken);
  const prefix = quoteRefDate(date);
  for (let i = 0; i < 200; i++) {
    const ref = `${prefix}-${randomLetters(3)}`;
    if (!used.has(ref)) return ref;
  }
  // nearly exhausted day: walk the remaining combinations in order
  for (let n = 0; n < 26 ** 3; n++) {
    const ref = `${prefix}-${LETTERS[Math.floor(n / 676)]}${LETTERS[Math.floor(n / 26) % 26]}${LETTERS[n % 26]}`;
    if (!used.has(ref)) return ref;
  }
  throw new Error(`All quotation references for ${prefix} are in use.`);
}

export const QUOTE_REF_PATTERN = /^\d{8}-[A-Z]{3}$/;
