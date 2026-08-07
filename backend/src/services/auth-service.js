import { AppError } from "../utils/errors.js";
import { digest, pkceChallenge, randomToken, safeEqual, safeReturnTo } from "../utils/security.js";

const SESSION_ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;
const OAUTH_TRANSACTION_MS = 10 * 60 * 1000;

export class AuthService {
  constructor({ repository, providers, cipher, now = () => new Date() }) {
    this.repository = repository;
    this.providers = providers;
    this.cipher = cipher;
    this.now = now;
  }

  provider(name) {
    const provider = this.providers[name];
    if (!provider) throw new AppError("UNSUPPORTED_PROVIDER", "This sign-in provider is not supported.", 404, false);
    return provider;
  }

  providerStatus() {
    return Object.fromEntries(Object.entries(this.providers).map(([name, provider]) => [name, provider.configured]));
  }

  async beginAuthorization(name, returnTo = "/", prompt) {
    const provider = this.provider(name);
    const state = randomToken();
    const verifier = randomToken(48);
    const now = this.now();
    await this.repository.createOAuthTransaction({
      stateHash: digest(state),
      provider: name,
      verifierEncrypted: this.cipher.encrypt(verifier),
      returnTo: safeReturnTo(returnTo),
      expiresAt: new Date(now.getTime() + OAUTH_TRANSACTION_MS)
    });
    return provider.authorizationUrl({ state, challenge: pkceChallenge(verifier), prompt });
  }

  async completeAuthorization(name, { code, state }) {
    if (!code || !state) throw new AppError("INVALID_OAUTH_CALLBACK", "The authorization response is incomplete. Please try again.", 400, true);
    const transaction = await this.repository.consumeOAuthTransaction(digest(state), this.now());
    if (!transaction || transaction.provider !== name) throw new AppError("INVALID_OAUTH_STATE", "The authorization request expired or could not be verified. Please try again.", 400, true);
    const provider = this.provider(name);
    const token = await provider.exchangeCode({ code, verifier: this.cipher.decrypt(transaction.verifierEncrypted) });
    const grantedScopes = String(token.scope || "").split(/\s+/).filter(Boolean);
    const required = provider.scopes.filter((scope) => !["openid", "profile", "email", "offline_access"].includes(scope));
    if (grantedScopes.length && required.some((scope) => !grantedScopes.includes(scope))) {
      throw new AppError("INSUFFICIENT_PERMISSIONS", "Required mailbox or calendar permissions were not granted. Please try again and approve the requested access.", 403, false);
    }
    const profile = await provider.profile(token.access_token);
    const expiresAt = token.expires_in ? new Date(this.now().getTime() + Number(token.expires_in) * 1000) : null;
    const { user } = await this.repository.saveAuthorizedAccount({
      profile,
      provider: name,
      scopes: grantedScopes.length ? grantedScopes : provider.scopes,
      credential: {
        accessTokenEncrypted: this.cipher.encrypt(token.access_token),
        refreshTokenEncrypted: this.cipher.encrypt(token.refresh_token),
        tokenType: token.token_type || "Bearer",
        expiresAt
      }
    });
    const sessionToken = randomToken(48);
    const now = this.now();
    await this.repository.createSession({
      userId: user.id,
      tokenHash: digest(sessionToken),
      expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS),
      idleAt: new Date(now.getTime() + SESSION_IDLE_MS)
    });
    return { sessionToken, returnTo: transaction.returnTo };
  }

  async authenticate(sessionToken) {
    if (!sessionToken) return null;
    const now = this.now();
    const session = await this.repository.findSession(digest(sessionToken), now);
    if (!session) return null;
    if (now.getTime() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
      await this.repository.touchSession(session.id, new Date(now.getTime() + SESSION_IDLE_MS), now);
    }
    return session;
  }

  async issueCsrf(session) {
    const token = randomToken();
    await this.repository.setSessionCsrf(session.id, digest(token));
    session.csrfHash = digest(token);
    return token;
  }

  assertCsrf(session, token) {
    if (!session?.csrfHash || !token || !safeEqual(session.csrfHash, digest(token))) throw new AppError("INVALID_CSRF_TOKEN", "The request could not be verified. Refresh and try again.", 403, true);
  }

  logout(sessionToken) {
    if (!sessionToken) return Promise.resolve();
    return this.repository.deleteSession(digest(sessionToken));
  }

  async accounts(userId) {
    const accounts = await this.repository.listAccounts(userId);
    return accounts.map(({ id, provider, email, displayName, scopes, status, lastErrorCode, createdAt, updatedAt }) => ({ id, provider, email, displayName, scopes, status, lastErrorCode, createdAt, updatedAt }));
  }

  async disconnect(userId, connectionId) {
    const connection = await this.repository.getOwnedConnection(connectionId, userId);
    if (!connection) throw new AppError("ACCOUNT_NOT_FOUND", "The connected account was not found.", 404, false);
    try {
      if (connection.credential) await this.provider(connection.provider).revoke(this.cipher.decrypt(connection.credential.accessTokenEncrypted));
    } catch (error) {
      await this.repository.markConnectionError(connection.id, error.code || "PROVIDER_REVOCATION_FAILED");
      throw error;
    }
    await this.repository.deleteConnection(connection.id, userId);
    return { disconnected: true };
  }

  async validAccessToken(userId, connectionId) {
    const connection = await this.repository.getOwnedConnection(connectionId, userId);
    if (!connection?.credential) throw new AppError("ACCOUNT_NOT_FOUND", "The connected account was not found.", 404, false);
    const credential = connection.credential;
    if (!credential.expiresAt || credential.expiresAt.getTime() > this.now().getTime() + 60_000) return this.cipher.decrypt(credential.accessTokenEncrypted);
    if (!credential.refreshTokenEncrypted) throw new AppError("REAUTHORIZATION_REQUIRED", "Reconnect this account to continue.", 401, false);
    const leaseNow = this.now();
    const acquired = await this.repository.acquireRefreshLease(connection.id, credential.version, leaseNow, new Date(leaseNow.getTime() + 30_000));
    if (!acquired) throw new AppError("TOKEN_REFRESH_IN_PROGRESS", "Account authorization is being refreshed. Try again shortly.", 409, true);
    try {
      const refreshed = await this.provider(connection.provider).refresh(this.cipher.decrypt(credential.refreshTokenEncrypted));
      const updated = await this.repository.updateRefreshedCredential(connection.id, credential.version, {
        accessTokenEncrypted: this.cipher.encrypt(refreshed.access_token),
        refreshTokenEncrypted: refreshed.refresh_token ? this.cipher.encrypt(refreshed.refresh_token) : credential.refreshTokenEncrypted,
        expiresAt: refreshed.expires_in ? new Date(this.now().getTime() + Number(refreshed.expires_in) * 1000) : null
      });
      if (!updated) throw new AppError("TOKEN_REFRESH_IN_PROGRESS", "Account authorization changed while refreshing. Try again.", 409, true);
      return refreshed.access_token;
    } catch (error) {
      await this.repository.releaseRefreshLease(connection.id, credential.version);
      if (error instanceof AppError && error.code === "TOKEN_REFRESH_IN_PROGRESS") throw error;
      await this.repository.markConnectionError(connection.id, "REAUTHORIZATION_REQUIRED");
      throw new AppError("REAUTHORIZATION_REQUIRED", "Reconnect this account to continue.", 401, false);
    }
  }
}
