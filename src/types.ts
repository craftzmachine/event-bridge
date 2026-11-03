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
}

export interface Proposal {
  id: string;
  createdAt: string;
  updatedAt: string;
  client: {
    name: string;
    contact: string;
    date: string;
    venue: string;
    location: string;
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
}
