/** Indian digit grouping: 441303.5 -> "4,41,303.50" */
export function groupINR(n: number, decimals = 2): string {
  const neg = n < 0;
  const [whole, frac] = Math.abs(n).toFixed(decimals).split(".");
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  const s = (rest ? `${rest},` : "") + last3 + (frac ? `.${frac}` : "");
  return neg ? `-${s}` : s;
}

export function formatINR(n: number, symbol = "₹"): string {
  return n < 0 ? `(${symbol} ${groupINR(-n)})` : `${symbol} ${groupINR(n)}`;
}

/** Whole rupees, for compact UI totals. */
export function formatINRShort(n: number, symbol = "₹"): string {
  return `${symbol}${groupINR(Math.round(n), 0)}`;
}

export function formatDate(iso: string): string {
  if (!iso) return "Date to be confirmed";
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  const day = d.getDate();
  const suf = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${day}${suf} ${d.toLocaleString("en-GB", { month: "long" })} ${d.getFullYear()}`;
}

export function safeFilePart(s: string): string {
  return s.trim().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "") || "Client";
}
