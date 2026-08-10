import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { createCipher, digest, pkceChallenge, safeReturnTo } from "../../src/utils/security.js";

describe("authentication security utilities", () => {
  it("encrypts tokens with authenticated encryption", () => {
    const cipher = createCipher(crypto.randomBytes(32).toString("base64"));
    const encrypted = cipher.encrypt("private-token");
    expect(encrypted).not.toContain("private-token");
    expect(cipher.decrypt(encrypted)).toBe("private-token");
    const parts = encrypted.split(".");
    parts[3] = `${parts[3][0] === "A" ? "B" : "A"}${parts[3].slice(1)}`;
    expect(() => cipher.decrypt(parts.join("."))).toThrow();
  });

  it("uses the RFC 7636 SHA-256 PKCE challenge", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("accepts only local return paths", () => {
    expect(safeReturnTo("/settings?tab=accounts")).toBe("/settings?tab=accounts");
    expect(safeReturnTo("https://evil.example")).toBe("/");
    expect(safeReturnTo("//evil.example")).toBe("/");
  });

  it("produces stable non-plaintext digests", () => {
    expect(digest("session-id")).toBe(digest("session-id"));
    expect(digest("session-id")).not.toContain("session-id");
  });
});
