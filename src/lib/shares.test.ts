import { describe, expect, it } from "vitest";
import { clientAnswers, generatePassword, type Share } from "./shares";

const share = (id: string, extra: Partial<Share>): Share =>
  ({ id, token: "t", client: "C", title: "T", kind: "pdf", fileName: "p.pdf", size: 1, createdAt: 1, expiresAt: 2, createdBy: "s", views: 0, expired: false, ...extra }) as Share;

describe("client answers on the Studio cards", () => {
  it("uses the share recorded on the proposal, else its newest share", () => {
    const approved = { kind: "approved" as const, at: 5 };
    const changes = { kind: "changes" as const, comment: "Fewer lights", at: 9 };
    const shares = [
      share("old", { proposalId: "p1", createdAt: 1, decision: approved }),
      share("new", { proposalId: "p1", createdAt: 2, decision: changes }),
      share("quiet", { proposalId: "p2", createdAt: 3 }),
      share("own", { proposalId: "p3", createdAt: 1, decision: approved }),
      share("later", { proposalId: "p3", createdAt: 4, decision: changes }),
    ];
    const answers = clientAnswers([{ id: "p1" }, { id: "p2" }, { id: "p3", shareId: "own" }, { id: "p4" }], shares);
    expect(answers.get("p1")).toBe(changes);
    expect(answers.has("p2")).toBe(false); // the newest link has no answer yet
    expect(answers.get("p3")).toBe(approved);
    expect(answers.has("p4")).toBe(false);
  });

  it("generates readable passwords", () => {
    expect(generatePassword()).toMatch(/^[A-HJ-NP-Za-km-np-z2-9]{4}-[A-HJ-NP-Za-km-np-z2-9]{4}-[A-HJ-NP-Za-km-np-z2-9]{4}$/);
  });
});
