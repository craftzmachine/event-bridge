import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256 } from "./sha256";
import { checkCredentials, credentialHash } from "./auth";

describe("sha256", () => {
  it("matches node's implementation", () => {
    for (const s of ["", "abc", "parinay-proposals:a@b.c:p@ss", "ünïcødé ₹ 4,41,303", "x".repeat(200)]) {
      expect(sha256(s)).toBe(createHash("sha256").update(s).digest("hex"));
    }
  });
});

describe("checkCredentials", () => {
  // a throwaway account, so no real password appears in the tests
  const test = [{ email: "tester@example.com", hash: credentialHash("tester@example.com", "correct horse") }];

  it("rejects unknown emails, empty and wrong passwords", () => {
    expect(checkCredentials("someone@example.com", "correct horse", test)).toBeNull();
    expect(checkCredentials("tester@example.com", "", test)).toBeNull();
    expect(checkCredentials("tester@example.com", "wrong horse", test)).toBeNull();
    expect(checkCredentials("info.parinayweddings@gmail.com", "wrong")).toBeNull();
  });
  it("normalises the email before hashing", () => {
    expect(credentialHash("  Info.ParinayWeddings@Gmail.com ", "x")).toBe(credentialHash("info.parinayweddings@gmail.com", "x"));
  });
  it("ignores stray spaces, zero-width and full-width characters from phone keyboards", () => {
    const base = credentialHash("a@b.c", "pass@123");
    expect(credentialHash("a@b.c", "pass@123 ")).toBe(base);
    expect(credentialHash("a@b.c", " pass@123​")).toBe(base);
    expect(credentialHash("a@b.c", "pass＠１２３")).toBe(base);
    expect(credentialHash("a@b.c", "Pass@123")).not.toBe(base); // still case-sensitive
  });
  it("accepts a listed account typed with stray spaces and capitals in the email", () => {
    expect(checkCredentials(" Tester@Example.com", "correct horse ", test)).toBe("tester@example.com");
  });
});
