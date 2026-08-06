import crypto from "node:crypto";

function iso(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function dates(record, fields) {
  if (!record) return null;
  const result = { ...record };
  for (const field of fields) if (result[field]) result[field] = new Date(result[field]);
  return result;
}

function connectionRecord(record) {
  if (!record) return null;
  let scopes = [];
  try {
    const parsed = JSON.parse(record.scopes);
    if (Array.isArray(parsed)) scopes = parsed;
  } catch {
    scopes = [];
  }
  return { ...dates(record, ["createdAt", "updatedAt"]), scopes };
}

function transaction(database, operation) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export class SqliteAuthRepository {
  constructor(database) {
    this.database = database;
    this.database.exec("PRAGMA foreign_keys = ON");
  }

  createOAuthTransaction(data) {
    const now = new Date().toISOString();
    this.database.prepare(`INSERT INTO "OAuthTransaction" ("id", "stateHash", "provider", "verifierEncrypted", "returnTo", "expiresAt", "createdAt") VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(crypto.randomUUID(), data.stateHash, data.provider, data.verifierEncrypted, data.returnTo, iso(data.expiresAt), now);
    return Promise.resolve();
  }

  consumeOAuthTransaction(stateHash, now) {
    return Promise.resolve(transaction(this.database, () => {
      const record = this.database.prepare(`SELECT * FROM "OAuthTransaction" WHERE "stateHash" = ?`).get(stateHash);
      if (!record) return null;
      this.database.prepare(`DELETE FROM "OAuthTransaction" WHERE "id" = ?`).run(record.id);
      const transactionRecord = dates(record, ["expiresAt", "createdAt"]);
      return transactionRecord.expiresAt > now ? transactionRecord : null;
    }));
  }

  saveAuthorizedAccount({ profile, provider, scopes, credential }) {
    return Promise.resolve(transaction(this.database, () => {
      const timestamp = new Date().toISOString();
      const existingConnection = this.database.prepare(`SELECT * FROM "MailboxConnection" WHERE "provider" = ? AND "providerAccountId" = ?`).get(provider, profile.id);
      let user = existingConnection
        ? this.database.prepare(`SELECT * FROM "User" WHERE "id" = ?`).get(existingConnection.userId)
        : this.database.prepare(`SELECT * FROM "User" WHERE "email" = ?`).get(profile.email);
      if (user) {
        this.database.prepare(`UPDATE "User" SET "email" = ?, "displayName" = ?, "avatarUrl" = ?, "updatedAt" = ? WHERE "id" = ?`)
          .run(profile.email, profile.displayName, profile.avatarUrl, timestamp, user.id);
      } else {
        const userId = crypto.randomUUID();
        this.database.prepare(`INSERT INTO "User" ("id", "email", "displayName", "avatarUrl", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?)`)
          .run(userId, profile.email, profile.displayName, profile.avatarUrl, timestamp, timestamp);
        user = { id: userId };
      }
      user = this.database.prepare(`SELECT * FROM "User" WHERE "id" = ?`).get(user.id);

      const serializedScopes = JSON.stringify(scopes);
      let connectionId = existingConnection?.id;
      if (existingConnection) {
        this.database.prepare(`UPDATE "MailboxConnection" SET "userId" = ?, "email" = ?, "displayName" = ?, "scopes" = ?, "status" = 'CONNECTED', "lastErrorCode" = NULL, "updatedAt" = ? WHERE "id" = ?`)
          .run(user.id, profile.email, profile.displayName, serializedScopes, timestamp, connectionId);
      } else {
        connectionId = crypto.randomUUID();
        this.database.prepare(`INSERT INTO "MailboxConnection" ("id", "userId", "provider", "providerAccountId", "email", "displayName", "scopes", "status", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, 'CONNECTED', ?, ?)`)
          .run(connectionId, user.id, provider, profile.id, profile.email, profile.displayName, serializedScopes, timestamp, timestamp);
      }

      const previousCredential = this.database.prepare(`SELECT * FROM "OAuthCredential" WHERE "connectionId" = ?`).get(connectionId);
      if (previousCredential) {
        this.database.prepare(`UPDATE "OAuthCredential" SET "accessTokenEncrypted" = ?, "refreshTokenEncrypted" = ?, "tokenType" = ?, "expiresAt" = ?, "refreshLeaseUntil" = NULL, "version" = "version" + 1, "updatedAt" = ? WHERE "connectionId" = ?`)
          .run(credential.accessTokenEncrypted, credential.refreshTokenEncrypted ?? previousCredential.refreshTokenEncrypted, credential.tokenType, iso(credential.expiresAt), timestamp, connectionId);
      } else {
        this.database.prepare(`INSERT INTO "OAuthCredential" ("id", "connectionId", "accessTokenEncrypted", "refreshTokenEncrypted", "tokenType", "expiresAt", "version", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`)
          .run(crypto.randomUUID(), connectionId, credential.accessTokenEncrypted, credential.refreshTokenEncrypted, credential.tokenType, iso(credential.expiresAt), timestamp, timestamp);
      }
      const connection = this.database.prepare(`SELECT * FROM "MailboxConnection" WHERE "id" = ?`).get(connectionId);
      return { user: dates(user, ["createdAt", "updatedAt"]), connection: connectionRecord(connection) };
    }));
  }

  createSession(data) {
    const timestamp = new Date().toISOString();
    this.database.prepare(`INSERT INTO "Session" ("id", "userId", "tokenHash", "csrfHash", "expiresAt", "idleAt", "lastSeenAt", "createdAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(crypto.randomUUID(), data.userId, data.tokenHash, data.csrfHash ?? null, iso(data.expiresAt), iso(data.idleAt), timestamp, timestamp);
    return Promise.resolve();
  }

  findSession(tokenHash, now) {
    const record = this.database.prepare(`SELECT s.*, u."email" AS "userEmail", u."displayName" AS "userDisplayName", u."avatarUrl" AS "userAvatarUrl", u."createdAt" AS "userCreatedAt", u."updatedAt" AS "userUpdatedAt" FROM "Session" s JOIN "User" u ON u."id" = s."userId" WHERE s."tokenHash" = ?`).get(tokenHash);
    if (!record) return Promise.resolve(null);
    const session = dates(record, ["expiresAt", "idleAt", "lastSeenAt", "createdAt"]);
    if (session.expiresAt <= now || session.idleAt <= now) {
      this.database.prepare(`DELETE FROM "Session" WHERE "id" = ?`).run(session.id);
      return Promise.resolve(null);
    }
    session.user = {
      id: session.userId,
      email: session.userEmail,
      displayName: session.userDisplayName,
      avatarUrl: session.userAvatarUrl,
      createdAt: new Date(session.userCreatedAt),
      updatedAt: new Date(session.userUpdatedAt)
    };
    delete session.userEmail;
    delete session.userDisplayName;
    delete session.userAvatarUrl;
    delete session.userCreatedAt;
    delete session.userUpdatedAt;
    return Promise.resolve(session);
  }

  touchSession(id, idleAt, lastSeenAt) {
    const result = this.database.prepare(`UPDATE "Session" SET "idleAt" = ?, "lastSeenAt" = ? WHERE "id" = ?`).run(iso(idleAt), iso(lastSeenAt), id);
    return Promise.resolve({ count: Number(result.changes) });
  }

  setSessionCsrf(id, csrfHash) {
    this.database.prepare(`UPDATE "Session" SET "csrfHash" = ? WHERE "id" = ?`).run(csrfHash, id);
    return Promise.resolve();
  }

  deleteSession(tokenHash) {
    const result = this.database.prepare(`DELETE FROM "Session" WHERE "tokenHash" = ?`).run(tokenHash);
    return Promise.resolve({ count: Number(result.changes) });
  }

  listAccounts(userId) {
    const records = this.database.prepare(`SELECT * FROM "MailboxConnection" WHERE "userId" = ? ORDER BY "createdAt" ASC`).all(userId);
    return Promise.resolve(records.map(connectionRecord));
  }

  getOwnedConnection(id, userId) {
    const connection = this.database.prepare(`SELECT * FROM "MailboxConnection" WHERE "id" = ? AND "userId" = ?`).get(id, userId);
    if (!connection) return Promise.resolve(null);
    const credential = this.database.prepare(`SELECT * FROM "OAuthCredential" WHERE "connectionId" = ?`).get(id);
    const normalized = connectionRecord(connection);
    normalized.credential = dates(credential, ["expiresAt", "refreshLeaseUntil", "createdAt", "updatedAt"]);
    return Promise.resolve(normalized);
  }

  deleteConnection(id, userId) {
    const result = this.database.prepare(`DELETE FROM "MailboxConnection" WHERE "id" = ? AND "userId" = ?`).run(id, userId);
    return Promise.resolve({ count: Number(result.changes) });
  }

  markConnectionError(id, code) {
    this.database.prepare(`UPDATE "MailboxConnection" SET "status" = 'REVOCATION_FAILED', "lastErrorCode" = ?, "updatedAt" = ? WHERE "id" = ?`).run(code, new Date().toISOString(), id);
    return Promise.resolve();
  }

  acquireRefreshLease(connectionId, expectedVersion, now, refreshLeaseUntil) {
    const result = this.database.prepare(`UPDATE "OAuthCredential" SET "refreshLeaseUntil" = ? WHERE "connectionId" = ? AND "version" = ? AND ("refreshLeaseUntil" IS NULL OR "refreshLeaseUntil" < ?)`)
      .run(iso(refreshLeaseUntil), connectionId, expectedVersion, iso(now));
    return Promise.resolve(Number(result.changes) === 1);
  }

  updateRefreshedCredential(connectionId, expectedVersion, data) {
    const result = this.database.prepare(`UPDATE "OAuthCredential" SET "accessTokenEncrypted" = ?, "refreshTokenEncrypted" = ?, "expiresAt" = ?, "refreshLeaseUntil" = NULL, "version" = "version" + 1, "updatedAt" = ? WHERE "connectionId" = ? AND "version" = ?`)
      .run(data.accessTokenEncrypted, data.refreshTokenEncrypted, iso(data.expiresAt), new Date().toISOString(), connectionId, expectedVersion);
    return Promise.resolve(Number(result.changes) === 1);
  }

  releaseRefreshLease(connectionId, expectedVersion) {
    const result = this.database.prepare(`UPDATE "OAuthCredential" SET "refreshLeaseUntil" = NULL WHERE "connectionId" = ? AND "version" = ?`).run(connectionId, expectedVersion);
    return Promise.resolve({ count: Number(result.changes) });
  }
}
