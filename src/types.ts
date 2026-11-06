export interface Choice {
  id: string;
  label: string;
  blurb?: string;
  image?: string;
}

export interface Category {
  id: string;
  label: string;
  order: number;
}

export interface CatalogUpgrade {
  id: string;
  name: string;
  price: number;
}

export interface CatalogElement {
  id: string;
  name: string;
  category: string;
  description?: string;
  unit: string;
  defaultQty: number;
  /** null = billed "as per actuals" */
  defaultPrice: number | null;
  eventTypes: string[];
  ceremonyStyles: string[];
  upgrades?: CatalogUpgrade[];
  image?: string;
  /** priced per guest: the quantity is the guest count × this (e.g. 1 chair per guest, 0.1 tables) */
  perGuest?: number;
}

export interface Catalog {
  eventTypes: Choice[];
  ceremonyStyles: Choice[];
  categories: Category[];
  elements: CatalogElement[];
}

export interface Brand {
  company: string;
  tagline: string;
  legalName: string;
  logo: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  contact: { name: string; role: string; phone: string; email: string };
  currency: string;
  coordinationPct: number;
  coordinationLabel: string;
  gstPct: number;
  colors: { ink: string; accent: string; soft: string; line: string };
  terms: string[];
  /** the standard payment milestones; when missing, 70% at booking and the balance before the event */
  paymentPlan?: { label: string; pct: number; when: "booking" | "before-event" }[];
  /** days before the first event date that a "before-event" milestone falls due (default 7) */
  balanceDueDays?: number;
}

export interface VenueSpace {
  name: string;
  size?: string;
  capacity?: number;
  note?: string;
}

export interface Venue {
  id: string;
  name: string;
  aka?: string;
  type: string;
  area: string;
  city: string;
  address?: string;
  stars?: number;
  phone?: string;
  website?: string;
  /** The venue's own photo gallery, linked rather than copied (official photos are copyrighted). */
  gallery?: string;
  /** Shown first, as the large card above the directory grid. */
  featured?: boolean;
  description?: string;
  photo?: string;
  photoIsRepresentative?: boolean;
  /** Required with a real venue photo: who took it, its licence, and the page it came from. */
  photoCredit?: PhotoCredit;
  /** What the photo shows, for screen readers (e.g. "Infinity pool above the sea at …"); falls back to the name */
  photoAlt?: string;
  spaces: VenueSpace[];
  features?: string[];
  verification?: string;
  sources?: string[];
}

export interface PhotoCredit {
  author: string;
  license: string;
  licenseUrl?: string;
  /** e.g. the Wikimedia Commons file page */
  source: string;
}

export interface VenueDirectory {
  note?: string;
  venueTypes: { id: string; label: string }[];
  venues: Venue[];
}

/** off = not shown, offer = listed as an optional upgrade, include = added to the price */
export type UpgradeMode = "off" | "offer" | "include";

export interface LineUpgrade {
  id: string;
  name: string;
  price: number;
  mode: UpgradeMode;
}

export interface Line {
  uid: string;
  elementId: string | null;
  name: string;
  category: string;
  unit: string;
  qty: number;
  /** null = as per actuals, excluded from totals */
  rate: number | null;
  notes: string;
  /** true = additional option, not part of the Grand Total */
  optional: boolean;
  upgrades: LineUpgrade[];
  /** the function (Proposal.functions id) it belongs to; none = the first function, or no functions at all */
  fn?: string;
  /** while set, qty follows the guest count: ⌈guests × perGuest⌉ */
  perGuest?: number;
  /** internal cost of the whole line (qty included); never shown to clients or exported */
  cost?: number | null;
}

/** One function of a multi-function celebration: Haldi, Mehendi, Muhurtham, Reception… */
export interface EventFunction {
  id: string;
  label: string;
  /** YYYY-MM-DD, one of client.dates, or "" for not yet fixed */
  date: string;
}

export type PaymentMethod = "upi" | "bank" | "cheque" | "cash" | "card";

export interface Milestone {
  id: string;
  label: string;
  /** share of the total including GST */
  pct: number;
  /** YYYY-MM-DD, or "" when it can't be dated yet */
  due: string;
}

export interface Payment {
  id: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  note?: string;
  receiptNo: string;
}

export interface Proposal {
  id: string;
  createdAt: string;
  updatedAt: string;
  client: {
    name: string;
    contact: string;
    /** first (earliest) event date, YYYY-MM-DD; kept for drafts saved before multi-date support */
    date: string;
    /** every event date, sorted; older drafts don't have it, so read through eventDates() */
    dates?: string[];
    venue: string;
    location: string;
    /** expected guests; per-guest lines follow it */
    guests?: number | null;
    /** the family's budget for the whole proposal (compared with the Grand Total) */
    budget?: number | null;
  };
  ref: string;
  eventType: string | null;
  style: string | null;
  lines: Line[];
  coordinationPct: number;
  /** null = no round-off; otherwise the Grand Total quoted to the client */
  grandTotal: number | null;
  terms: string[];
  notes: string;
  /** where it stands with the client; older drafts have none, so read through proposalStatus() */
  status?: ProposalStatus;
  /** when the status last changed (ISO) */
  statusAt?: string;
  /** when it was first marked sent (ISO); kept when it later becomes accepted or lost */
  sentAt?: string;
  /** the latest Visualize Proposal share made from it with "Share with client" */
  shareId?: string;
  /** the theme chosen for sharing it as a web page (a ThemeId); unset means the planner's current theme */
  pageTheme?: string;
  /** functions of a multi-function celebration; none = one list, as before */
  functions?: EventFunction[];
  /** the payment plan and what has been received; unset = the standard plan, nothing received */
  payments?: { plan?: Milestone[]; received: Payment[] };
}

export type ProposalStatus = "draft" | "sent" | "accepted" | "lost";
