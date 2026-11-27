// The plans Event Bridge is sold on, shown on the landing page. Keep in step with docs/PRODUCT_PLAN.md (section 2).
// Prices are indicative, per company per month, in rupees, before GST; `features` lists only what's built today.
export interface Plan {
  id: "starter" | "professional" | "enterprise";
  name: string;
  forWho: string;
  /** rupees a month; null = quoted */
  price: number | null;
  users: string;
  features: string[];
  highlight?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    forWho: "Solo planners and small studios",
    price: 1499,
    users: "2 users",
    features: ["Proposal Studio with PDF and Excel export", "Your logo, terms and catalogue", "Events, checklists and payments", "CRM and team tasks", "10 client shares a month"],
  },
  {
    id: "professional",
    name: "Professional",
    forWho: "Growing planning teams",
    price: 4999,
    users: "10 users",
    highlight: true,
    features: ["Everything in Starter", "Unlimited client shares and the Client Portal", "Questionnaires and coordination sheets", "Expenses, staff advances and handovers", "Internal costs and margin"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    forWho: "Agencies and multi-branch companies",
    price: null,
    users: "25+ users",
    features: ["Everything in Professional", "A venue directory for your city", "Catalogue set-up and team training", "Priority support"],
  },
];
