import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaAuthRepository } from "../../src/repositories/prisma-auth-repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseSuite = describe.runIf(Boolean(databaseUrl));

databaseSuite("Prisma authentication repository", () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  const repository = new PrismaAuthRepository(prisma);

  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.oAuthCredential.deleteMany();
    await prisma.mailboxConnection.deleteMany();
    await prisma.user.deleteMany();
    await prisma.oAuthTransaction.deleteMany();
  });

  afterAll(() => prisma.$disconnect());

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
      provider: "microsoft",
      scopes: ["openid", "Mail.ReadWrite"],
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
