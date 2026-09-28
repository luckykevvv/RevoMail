import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AuthService } from "../../src/services/auth-service.js";
import { createCipher, digest } from "../../src/utils/security.js";

function fixture() {
  const transactions = new Map();
  const sessions = new Map();
  const accounts = [];
  const repository = {
    createOAuthTransaction: vi.fn(async (data) => transactions.set(data.stateHash, { ...data, id: "tx-1" })),
    consumeOAuthTransaction: vi.fn(async (stateHash, now) => {
      const value = transactions.get(stateHash);
      transactions.delete(stateHash);
      return value?.expiresAt > now ? value : null;
    }),
    saveAuthorizedAccount: vi.fn(async (data) => {
      accounts.push({ id: "account-1", userId: "user-1", ...data.profile, provider: data.provider, scopes: data.scopes, status: "CONNECTED", createdAt: new Date(), updatedAt: new Date(), credential: { ...data.credential, version: 0 } });
      return { user: { id: "user-1", email: data.profile.email, displayName: data.profile.displayName, avatarUrl: null } };
    }),
    createSession: vi.fn(async (data) => sessions.set(data.tokenHash, { ...data, id: "session-1", lastSeenAt: new Date("2026-08-03T00:00:00Z"), user: { id: "user-1", email: "user@example.com", displayName: "Test User", avatarUrl: null } })),
    findSession: vi.fn(async (tokenHash) => sessions.get(tokenHash) || null),
    touchSession: vi.fn(),
    setSessionCsrf: vi.fn(async (id, csrfHash) => { for (const session of sessions.values()) if (session.id === id) session.csrfHash = csrfHash; }),
    deleteSession: vi.fn(async (tokenHash) => sessions.delete(tokenHash)),
    listAccounts: vi.fn(async (userId) => accounts.filter((item) => item.userId === userId)),
    getOwnedConnection: vi.fn(async (id, userId) => accounts.find((item) => item.id === id && item.userId === userId) || null),
    deleteConnection: vi.fn(async (id, userId) => { const index = accounts.findIndex((item) => item.id === id && item.userId === userId); if (index >= 0) accounts.splice(index, 1); }),
    markConnectionError: vi.fn(),
    acquireRefreshLease: vi.fn(async () => true),
    updateRefreshedCredential: vi.fn(async () => true),
    releaseRefreshLease: vi.fn()
  };
  const provider = {
    configured: true,
    scopes: ["openid", "https://www.googleapis.com/auth/gmail.modify"],
    authorizationUrl: vi.fn(({ state, challenge }) => `https://provider.example/authorize?state=${state}&challenge=${challenge}`),
    exchangeCode: vi.fn(async () => ({ access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600, scope: "openid https://www.googleapis.com/auth/gmail.modify" })),
    profile: vi.fn(async () => ({ id: "provider-user", email: "user@example.com", displayName: "Test User", avatarUrl: null })),
    refresh: vi.fn(async () => ({ access_token: "new-secret", expires_in: 3600 })),
    revoke: vi.fn(async () => ({ supported: true }))
  };
  const now = () => new Date("2026-08-03T00:00:00Z");
  const service = new AuthService({ repository, providers: { google: provider }, cipher: createCipher(crypto.randomBytes(32).toString("base64")), now });
  return { service, repository, provider, accounts };
}

describe("AuthService", () => {
  it("completes PKCE authorization once and creates a server-side session", async () => {
    const { service, repository } = fixture();
    const authorizationUrl = new URL(await service.beginAuthorization("google", "/?view=settings"));
    const state = authorizationUrl.searchParams.get("state");
    const result = await service.completeAuthorization("google", { code: "valid-code", state });
    expect(result.returnTo).toBe("/?view=settings");
    expect(result.sessionToken).toBeTruthy();
    expect(repository.createSession.mock.calls[0][0].tokenHash).toBe(digest(result.sessionToken));
    await expect(service.completeAuthorization("google", { code: "replay", state })).rejects.toMatchObject({ code: "INVALID_OAUTH_STATE" });
  });

  it("rejects callbacks missing required provider permissions", async () => {
    const { service, provider } = fixture();
    provider.exchangeCode.mockResolvedValue({ access_token: "secret", scope: "openid" });
    const state = new URL(await service.beginAuthorization("google")).searchParams.get("state");
    await expect(service.completeAuthorization("google", { code: "code", state })).rejects.toMatchObject({ code: "INSUFFICIENT_PERMISSIONS" });
  });

  it("requires a valid CSRF token and invalidates logout sessions", async () => {
    const { service } = fixture();
    const state = new URL(await service.beginAuthorization("google")).searchParams.get("state");
    const { sessionToken } = await service.completeAuthorization("google", { code: "code", state });
    const session = await service.authenticate(sessionToken);
    const csrf = await service.issueCsrf(session);
    expect(() => service.assertCsrf(session, csrf)).not.toThrow();
    expect(() => service.assertCsrf(session, "wrong")).toThrow();
    await service.logout(sessionToken);
    expect(await service.authenticate(sessionToken)).toBeNull();
  });

  it("disconnects only an account owned by the session user", async () => {
    const { service, accounts, provider } = fixture();
    accounts.push({ id: "account-1", userId: "user-1", provider: "google", credential: { accessTokenEncrypted: service.cipher.encrypt("token") } });
    await service.disconnect("user-1", "account-1");
    expect(provider.revoke).toHaveBeenCalledWith("token");
    expect(accounts).toHaveLength(0);
    await expect(service.disconnect("other-user", "account-1")).rejects.toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
  });

  it("prevents concurrent provider refresh calls with a database lease", async () => {
    const { service, accounts, provider, repository } = fixture();
    accounts.push({
      id: "account-1", userId: "user-1", provider: "google",
      credential: { accessTokenEncrypted: service.cipher.encrypt("expired"), refreshTokenEncrypted: service.cipher.encrypt("refresh"), expiresAt: new Date("2026-08-02T00:00:00Z"), version: 0 }
    });
    repository.acquireRefreshLease.mockResolvedValue(false);
    await expect(service.validAccessToken("user-1", "account-1")).rejects.toMatchObject({ code: "TOKEN_REFRESH_IN_PROGRESS", retryable: true });
    expect(provider.refresh).not.toHaveBeenCalled();
  });
});
