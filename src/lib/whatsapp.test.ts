import { describe, expect, it } from "vitest";
import { shareMessages, waLink, waNumber } from "./whatsapp";

describe("WhatsApp links", () => {
  it("reads phone numbers as typed by the team", () => {
    expect(waNumber("+91 98470 00000")).toBe("919847000000");
    expect(waNumber("98470 00000")).toBe("919847000000");
    expect(waNumber("098470-00000")).toBe("919847000000");
    expect(waNumber("0091 98470 00000")).toBe("919847000000");
    expect(waNumber("+44 7700 900123")).toBe("447700900123");
    expect(waNumber("To be confirmed")).toBeNull();
    expect(waNumber("0471 2345678")).toBeNull(); // a landline isn't on WhatsApp
    expect(waNumber(undefined)).toBeNull();
  });

  it("fills in the message, and keeps the password out of the link message", () => {
    const m = shareMessages({ client: "Anjali", company: "Parinay Weddings", title: "Hindu Wedding proposal", link: "https://x.test/#/view/abc", password: "Ab3d-EfGh-JkMn", expires: "6 Dec 2026" });
    expect(m.link).toContain("https://x.test/#/view/abc");
    expect(m.link).not.toContain("Ab3d");
    expect(m.password).toContain("Ab3d-EfGh-JkMn");
    expect(m.email).not.toContain("Ab3d");
    expect(waLink("919847000000", "hi & bye")).toBe("https://wa.me/919847000000?text=hi%20%26%20bye");
    expect(waLink(null, "hi")).toBe("https://wa.me/?text=hi");
  });
});
