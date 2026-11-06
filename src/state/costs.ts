// The cost sheet (element id → internal cost per unit) and the margin threshold, kept on this device only.
// Costs are never written to public/config, which anyone can download.

const COSTS = "event-bridge.costs.v1";
const MIN = "event-bridge.min-margin.v1";

export function readCosts(): Record<string, number> {
  try {
    const x = JSON.parse(localStorage.getItem(COSTS) ?? "{}");
    return x && typeof x === "object" ? Object.fromEntries(Object.entries(x).filter(([, v]) => typeof v === "number" && v >= 0)) as Record<string, number> : {};
  } catch {
    return {};
  }
}

export function writeCosts(costs: Record<string, number>) {
  try {
    localStorage.setItem(COSTS, JSON.stringify(costs));
  } catch {
    /* storage blocked: the sheet applies for this visit only */
  }
}

export function readMinMargin(fallback: number): number {
  try {
    const n = Number(localStorage.getItem(MIN));
    return Number.isFinite(n) && n > 0 && n < 100 ? n : fallback;
  } catch {
    return fallback;
  }
}

export function writeMinMargin(n: number) {
  try {
    localStorage.setItem(MIN, String(n));
  } catch {
    /* storage blocked */
  }
}
