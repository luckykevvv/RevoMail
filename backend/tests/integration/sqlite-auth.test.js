import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeSqliteDatabase, openSqliteDatabase } from "../../src/config/sqlite.js";
import { SqliteAuthRepository } from "../../src/repositories/sqlite-auth-repository.js";

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "revomail-sqlite-test-"));
const databaseUrl = `file:${path.join(temporaryDirectory, "auth.db").replaceAll("\\", "/")}`;
let database;
let repository;

describe("SQLite authentication repository", () => {
  beforeAll(() => {
    initializeSqliteDatabase({ databaseUrl, migrationsPath: path.resolve("database/migrations") });
    database = openSqliteDatabase(databaseUrl);
    repository = new SqliteAuthRepository(database);
  });

  beforeEach(async () => {
    database.exec(`DELETE FROM "Session"; DELETE FROM "OAuthCredential"; DELETE FROM "MailboxConnection"; DELETE FROM "User"; DELETE FROM "OAuthTransaction";`);
  });

  afterAll(async () => {
    database.close();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it("atomically consumes a one-time OAuth transaction", async () => {
    const now = new Date();
    await repository.createOAuthTransaction({ stateHash: "state-hash", provider: "google", verifierEncrypted: "encrypted-verifier", returnTo: "/", expiresAt: new Date(now.getTime() + 60_000) });
    expect((await repository.consumeOAuthTransaction("state-hash", now))?.provider).toBe("google");
    expect(await repository.consumeOAuthTransaction("state-hash", now)).toBeNull();
  });

  it("persists accounts, credentials, sessions, ownership, and server-side logout", async () => {
    const saved = await repository.saveAuthorizedAccount({
      profile: { id: "provider-account", email: "fixture@example.test", displayName: "Fixture User", avatarUrl: null },
      provider: "google",
      scopes: ["openid", "email"],
      credential: { accessTokenEncrypted: "encrypted-access", refreshTokenEncrypted: "encrypted-refresh", tokenType: "Bearer", expiresAt: new Date(Date.now() + 3600_000) }
    });
    const accounts = await repository.listAccounts(saved.user.id);
    expect(accounts).toHaveLength(1);
    expect(await repository.getOwnedConnection(accounts[0].id, "another-user")).toBeNull();

    await repository.createSession({ userId: saved.user.id, tokenHash: "session-hash", expiresAt: new Date(Date.now() + 3600_000), idleAt: new Date(Date.now() + 1800_000) });
    expect((await repository.findSession("session-hash", new Date()))?.user.email).toBe("fixture@example.test");
    await repository.deleteSession("session-hash");
    expect(await repository.findSession("session-hash", new Date())).toBeNull();
  });

  it("grants a refresh lease to only one concurrent claimant", async () => {
    const saved = await repository.saveAuthorizedAccount({
      profile: { id: "lease-account", email: "lease@example.test", displayName: "Lease User", avatarUrl: null },
      provider: "google",
      scopes: ["openid", "https://www.googleapis.com/auth/gmail.modify"],
      credential: { accessTokenEncrypted: "encrypted-access", refreshTokenEncrypted: "encrypted-refresh", tokenType: "Bearer", expiresAt: new Date(0) }
    });
    const connection = await repository.getOwnedConnection(saved.connection.id, saved.user.id);
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + 30_000);
    const [first, second] = await Promise.all([
      repository.acquireRefreshLease(connection.id, connection.credential.version, now, leaseUntil),
      repository.acquireRefreshLease(connection.id, connection.credential.version, now, leaseUntil)
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
  });
});
