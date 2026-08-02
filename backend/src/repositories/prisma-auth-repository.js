export class PrismaAuthRepository {
  constructor(prisma) { this.prisma = prisma; }

  createOAuthTransaction(data) {
    return this.prisma.oAuthTransaction.create({ data });
  }

  async consumeOAuthTransaction(stateHash, now) {
    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.oAuthTransaction.findUnique({ where: { stateHash } });
      if (!transaction) return null;
      await tx.oAuthTransaction.delete({ where: { id: transaction.id } });
      return transaction.expiresAt > now ? transaction : null;
    });
  }

  async saveAuthorizedAccount({ profile, provider, scopes, credential }) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.mailboxConnection.findUnique({
        where: { provider_providerAccountId: { provider, providerAccountId: profile.id } }
      });
      let user;
      if (existing) {
        user = await tx.user.update({ where: { id: existing.userId }, data: { email: profile.email, displayName: profile.displayName, avatarUrl: profile.avatarUrl } });
      } else {
        user = await tx.user.upsert({
          where: { email: profile.email },
          update: { displayName: profile.displayName, avatarUrl: profile.avatarUrl },
          create: { email: profile.email, displayName: profile.displayName, avatarUrl: profile.avatarUrl }
        });
      }
      const connection = await tx.mailboxConnection.upsert({
        where: { provider_providerAccountId: { provider, providerAccountId: profile.id } },
        update: { userId: user.id, email: profile.email, displayName: profile.displayName, scopes, status: "CONNECTED", lastErrorCode: null },
        create: { userId: user.id, provider, providerAccountId: profile.id, email: profile.email, displayName: profile.displayName, scopes }
      });
      const previous = await tx.oAuthCredential.findUnique({ where: { connectionId: connection.id } });
      await tx.oAuthCredential.upsert({
        where: { connectionId: connection.id },
        update: { ...credential, refreshTokenEncrypted: credential.refreshTokenEncrypted ?? previous?.refreshTokenEncrypted, version: { increment: 1 } },
        create: { connectionId: connection.id, ...credential }
      });
      return { user, connection };
    });
  }

  createSession(data) {
    return this.prisma.session.create({ data });
  }

  async findSession(tokenHash, now) {
    const session = await this.prisma.session.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!session) return null;
    if (session.expiresAt <= now || session.idleAt <= now) {
      await this.prisma.session.deleteMany({ where: { id: session.id } });
      return null;
    }
    return session;
  }

  touchSession(id, idleAt, lastSeenAt) {
    return this.prisma.session.updateMany({ where: { id }, data: { idleAt, lastSeenAt } });
  }

  setSessionCsrf(id, csrfHash) {
    return this.prisma.session.update({ where: { id }, data: { csrfHash } });
  }

  deleteSession(tokenHash) {
    return this.prisma.session.deleteMany({ where: { tokenHash } });
  }

  listAccounts(userId) {
    return this.prisma.mailboxConnection.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  }

  getOwnedConnection(id, userId) {
    return this.prisma.mailboxConnection.findFirst({ where: { id, userId }, include: { credential: true } });
  }

  deleteConnection(id, userId) {
    return this.prisma.mailboxConnection.deleteMany({ where: { id, userId } });
  }

  markConnectionError(id, code) {
    return this.prisma.mailboxConnection.update({ where: { id }, data: { status: "REVOCATION_FAILED", lastErrorCode: code } });
  }

  async acquireRefreshLease(connectionId, expectedVersion, now, refreshLeaseUntil) {
    const result = await this.prisma.oAuthCredential.updateMany({
      where: { connectionId, version: expectedVersion, OR: [{ refreshLeaseUntil: null }, { refreshLeaseUntil: { lt: now } }] },
      data: { refreshLeaseUntil }
    });
    return result.count === 1;
  }

  async updateRefreshedCredential(connectionId, expectedVersion, data) {
    const result = await this.prisma.oAuthCredential.updateMany({ where: { connectionId, version: expectedVersion }, data: { ...data, refreshLeaseUntil: null, version: { increment: 1 } } });
    return result.count === 1;
  }

  releaseRefreshLease(connectionId, expectedVersion) {
    return this.prisma.oAuthCredential.updateMany({ where: { connectionId, version: expectedVersion }, data: { refreshLeaseUntil: null } });
  }
}
