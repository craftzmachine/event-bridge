// The signed-in app's sections, shared by the sidebar and the phone tab bar, and which one a URL belongs to.
export type NavId = "dashboard" | "events" | "studio" | "expenses" | "venues" | "visualize";
export type IconName = "home" | "calendar" | "file" | "wallet" | "pin" | "eye";

export interface NavItem {
  id: NavId;
  label: string;
  /** the label in the phone tab bar */
  short: string;
  href: string;
  icon: IconName;
  /** in the phone tab bar; the rest go under More */
  tab: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", short: "Home", href: "#/dashboard", icon: "home", tab: true },
  { id: "events", label: "Events", short: "Events", href: "#/events", icon: "calendar", tab: true },
  { id: "studio", label: "Proposal Studio", short: "Studio", href: "#/studio", icon: "file", tab: true },
  { id: "expenses", label: "Expenses", short: "Expenses", href: "#/expenses", icon: "wallet", tab: true },
  { id: "venues", label: "Venue Directory", short: "Venues", href: "#/venues", icon: "pin", tab: false },
  { id: "visualize", label: "Visualize Proposal", short: "Visualize", href: "#/visualize", icon: "eye", tab: false },
];

/** "#/expenses/company" → "expenses"; a hash outside the app (landing, login, a client's link) → null. */
export function navCurrent(hash: string): NavId | null {
  const head = hash.replace(/^#\/?/, "").split("/")[0].toLowerCase();
  return NAV_ITEMS.find((x) => x.id === head)?.id ?? null;
}
