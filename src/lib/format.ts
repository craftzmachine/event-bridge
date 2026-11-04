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

/** Today as YYYY-MM-DD in the user's own time zone (toISOString() would give the UTC date). */
export function todayISO(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDate(iso: string): string {
  if (!iso) return "Date to be confirmed";
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  const day = d.getDate();
  const suf = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${day}${suf} ${d.toLocaleString("en-GB", { month: "long" })} ${d.getFullYear()}`;
}

/**
 * Several event dates in one line: dates in the same month share it ("14th & 15th February 2027"),
 * otherwise each is written in full and joined with "·".
 */
export function formatDates(isos: string[]): string {
  const valid = isos.filter((iso) => !isNaN(new Date(`${iso}T00:00:00`).getTime()));
  if (!valid.length) return formatDate("");
  if (valid.length === 1) return formatDate(valid[0]);
  const monthKey = (iso: string) => iso.slice(0, 7);
  const groups: string[][] = [];
  for (const iso of valid) {
    const last = groups[groups.length - 1];
    if (last && monthKey(last[0]) === monthKey(iso)) last.push(iso);
    else groups.push([iso]);
  }
  return groups
    .map((g) => {
      if (g.length === 1) return formatDate(g[0]);
      const days = g.map((iso) => formatDate(iso).split(" ")[0]);
      const tail = formatDate(g[0]).split(" ").slice(1).join(" ");
      return `${days.slice(0, -1).join(", ")} & ${days[days.length - 1]} ${tail}`;
    })
    .join(" · ");
}

export function safeFilePart(s: string): string {
  return s.trim().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "") || "Client";
}
