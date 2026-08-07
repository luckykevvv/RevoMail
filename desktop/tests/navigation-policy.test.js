import { describe, expect, it } from "vitest";
import { isAllowedNavigation } from "../navigation-policy.js";


describe("desktop navigation policy", () => {
  const appOrigin = "http://127.0.0.1:4173";

  it("allows the managed application origin", () => {
    expect(isAllowedNavigation("http://127.0.0.1:4173/api/v1/auth/google/callback", { appOrigin })).toBe(true);
  });

  it("allows Google account navigation only during provider authentication", () => {
    expect(isAllowedNavigation("https://accounts.google.com/v3/signin/challenge", { appOrigin, allowProviderAuth: true })).toBe(true);
    expect(isAllowedNavigation("https://accounts.google.com/v3/signin/challenge", { appOrigin })).toBe(false);
  });

  it("rejects unrelated and lookalike origins", () => {
    expect(isAllowedNavigation("https://accounts.google.com.example.test/login", { appOrigin, allowProviderAuth: true })).toBe(false);
    expect(isAllowedNavigation("https://example.com/", { appOrigin, allowProviderAuth: true })).toBe(false);
    expect(isAllowedNavigation("not-a-url", { appOrigin, allowProviderAuth: true })).toBe(false);
  });
});
