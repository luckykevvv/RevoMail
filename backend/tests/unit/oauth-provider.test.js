import { describe, expect, it, vi } from "vitest";
import { createOAuthProvider } from "../../src/providers/oauth/provider.js";

function provider(fetchImpl = vi.fn()) {
  return createOAuthProvider({
    name: "google",
    clientId: "test-client",
    clientSecret: "test-secret",
    authorizationUrl: "https://accounts.example/authorize",
    tokenUrl: "https://accounts.example/token",
    userInfoUrl: "https://accounts.example/userinfo",
    revokeUrl: "https://accounts.example/revoke",
    redirectUri: "https://app.example/api/v1/auth/google/callback",
    fetchImpl
  });
}

describe("OAuth provider adapter", () => {
  it("builds an authorization-code URL with PKCE, state, offline access, and least-privilege scopes", () => {
    const url = new URL(provider().authorizationUrl({ state: "state-value", challenge: "pkce-value" }));
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("code_challenge")).toBe("pkce-value");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")).toContain("gmail.modify");
    expect(url.searchParams.get("scope")).not.toContain("gmail.readonly");
  });

  it("normalizes token and profile responses", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "secret", refresh_token: "refresh", expires_in: 3600 }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sub: "account-id", email: "USER@EXAMPLE.TEST", email_verified: true, name: "Example User" }), { status: 200, headers: { "content-type": "application/json" } }));
    const adapter = provider(fetchImpl);
    const token = await adapter.exchangeCode({ code: "code", verifier: "verifier" });
    const profile = await adapter.profile(token.access_token);
    expect(profile).toEqual({ id: "account-id", email: "user@example.test", displayName: "Example User", avatarUrl: null });
    expect(fetchImpl.mock.calls[0][1].body.get("code_verifier")).toBe("verifier");
  });

  it("classifies provider rate limits as retryable without exposing payload details", async () => {
    const adapter = provider(vi.fn(async () => new Response(JSON.stringify({ error: "private-provider-detail" }), { status: 429, headers: { "content-type": "application/json" } })));
    await expect(adapter.exchangeCode({ code: "code", verifier: "verifier" })).rejects.toMatchObject({ code: "TOKEN_EXCHANGE_FAILED", retryable: true, message: "The authorization provider could not complete the request." });
  });
});
