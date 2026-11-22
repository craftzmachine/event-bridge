// The signed-in apps. There's no menu: the Dashboard shows them as tiles, and every other page links back to it.
export type NavId = "dashboard" | "events" | "studio" | "crm" | "tasks" | "vendors" | "questionnaires" | "portal" | "expenses" | "venues" | "visualize";
export type IconName = "home" | "calendar" | "file" | "wallet" | "pin" | "eye" | "users" | "check" | "book" | "list" | "heart";

export interface AppItem {
  id: Exclude<NavId, "dashboard">;
  label: string;
  /** one line on the Dashboard tile */
  description: string;
  href: string;
  icon: IconName;
}

export const APPS: AppItem[] = [
  { id: "events", label: "Events", description: "Every wedding in play, each with its own workspace", href: "#/events", icon: "calendar" },
  { id: "studio", label: "Proposal Studio", description: "Build, price and send proposals", href: "#/studio", icon: "file" },
  { id: "expenses", label: "Expenses", description: "Event and company spending, advances and handovers", href: "#/expenses", icon: "wallet" },
  { id: "venues", label: "Venue Directory", description: "Halls, hotels and resorts around Thiruvananthapuram", href: "#/venues", icon: "pin" },
  { id: "visualize", label: "Visualize Proposal", description: "Password-protected, view-only links for clients", href: "#/visualize", icon: "eye" },
];

/** "#/expenses/company" → "expenses"; a hash outside the app (landing, login, a client's link) → null. */
export function navCurrent(hash: string): NavId | null {
  const head = hash.replace(/^#\/?/, "").split("/")[0].toLowerCase();
  if (head === "dashboard") return "dashboard";
  return APPS.find((x) => x.id === head)?.id ?? null;
}
