import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Brand, Proposal } from "../types";
import { newProposal } from "../state/proposals";
import { clientsFrom, followUpsDue, isLead, leadToProposal, logActivity, moveStage, searchLeads, syncWithProposals, type Lead } from "./crm";

const brand: Brand = JSON.parse(readFileSync("public/config/brand.json", "utf8"));
const ME = "planner@studio.test";
const NOW = new Date("2026-11-22T10:00:00Z");

const lead = (extra: Partial<Lead> = {}): Lead => ({
  id: "l1",
  name: "Ananya Menon",
  phone: "98470 12345",
  source: "instagram",
  dates: ["2027-02-14", "2027-02-12"],
  guests: 600,
  budget: 1500000,
  venue: "Taj Green Cove",
  eventType: "wedding",
  stage: "new",
  activity: [],
  createdAt: "",
  updatedAt: "",
  createdBy: ME,
  ...extra,
});

describe("CRM", () => {
  it("logs stage moves and activity, and keeps a reason only while lost", () => {
    let l = moveStage(lead(), "contacted", ME, NOW);
    expect(l.stage).toBe("contacted");
    expect(l.activity.at(-1)).toMatchObject({ kind: "stage", text: "New → Contacted", by: ME });
    expect(moveStage(l, "contacted", ME)).toBe(l);
    l = moveStage(l, "lost", ME, NOW, "  went with a cheaper planner ");
    expect(l).toMatchObject({ stage: "lost", lostReason: "went with a cheaper planner" });
    expect(moveStage(l, "meeting", ME).lostReason).toBeUndefined();
    const logged = logActivity(lead(), "call", " Wants a quote ", ME, NOW, "2026-11-25");
    expect(logged.followUp).toBe("2026-11-25");
    expect(logged.activity[0]).toMatchObject({ kind: "call", text: "Wants a quote" });
    expect(isLead(logged)).toBe(true);
    expect(isLead({ ...logged, stage: "maybe" })).toBe(false);
  });

  it("lists open enquiries whose follow-up has come, oldest first", () => {
    const list = [lead({ id: "a", followUp: "2026-11-22" }), lead({ id: "b", followUp: "2026-11-20" }), lead({ id: "c", followUp: "2026-11-30" }), lead({ id: "d", followUp: "2026-11-01", stage: "won" })];
    expect(followUpsDue(list, "2026-11-22").map((l) => l.id)).toEqual(["b", "a"]);
    expect(searchLeads(list, "taj").length).toBe(4);
    expect(searchLeads(list, "nobody")).toEqual([]);
  });

  it("turns an enquiry into a proposal with what it already knows", () => {
    const p = leadToProposal(lead(), brand, []);
    expect(p.client).toMatchObject({ name: "Ananya Menon", contact: "98470 12345", dates: ["2027-02-12", "2027-02-14"], date: "2027-02-12", guests: 600, budget: 1500000, venue: "Taj Green Cove" });
    expect(p.eventType).toBe("wedding");
    expect(p.status).toBe("draft");
    expect(p.ref).toMatch(/^\d{8}-[A-Z]{3}$/);
  });

  it("follows the proposal: sent moves it on, accepted wins it, lost loses it", () => {
    const p = { ...newProposal(brand), id: "p1" } as Proposal;
    const base = lead({ stage: "meeting", proposalId: "p1" });
    expect(syncWithProposals([base], [{ ...p, status: "draft" }], ME)).toEqual([]);
    expect(syncWithProposals([base], [{ ...p, status: "sent" }], ME)[0].stage).toBe("proposal");
    expect(syncWithProposals([base], [{ ...p, status: "accepted" }], ME)[0].stage).toBe("won");
    expect(syncWithProposals([base], [{ ...p, status: "lost" }], ME)[0]).toMatchObject({ stage: "lost", lostReason: "Proposal marked lost" });
    expect(syncWithProposals([lead({ stage: "won", proposalId: "p1" })], [{ ...p, status: "accepted" }], ME)).toEqual([]);
  });

  it("gathers clients from proposals, one per mobile number", () => {
    const a = { ...newProposal(brand), id: "a", status: "accepted" as const, client: { ...newProposal(brand).client, name: "Ananya Menon", contact: "+91 98470 12345", dates: ["2027-02-12"], date: "2027-02-12" } };
    const b = { ...newProposal(brand), id: "b", client: { ...newProposal(brand).client, name: "Ananya M.", contact: "9847012345", dates: ["2027-06-01"], date: "2027-06-01" } };
    const c = { ...newProposal(brand), id: "c", client: { ...newProposal(brand).client, name: "Rahul" } };
    const clients = clientsFrom([a, b, c, newProposal(brand)], brand.gstPct);
    expect(clients.map((x) => [x.proposals.map((p) => p.id), x.lastDate])).toEqual([[["a", "b"], "2027-06-01"], [["c"], undefined]]);
  });
});
