# ADR 0001: Authentication backend and persistence

Date: 2026-08-03

## Status

Superseded by ADR 0002 for persistence. The authentication, encryption, session, and provider-adapter decisions remain active.

## Decision

RevoMail originally selected the existing Node.js and Express runtime with PostgreSQL persistence. ADR 0002 replaced PostgreSQL and Prisma with local SQLite. ADR 0003 now supersedes the HTTP runtime decision with Python and FastAPI for Gmail and LLM ecosystem compatibility.

OAuth uses the authorization code flow with PKCE and one-time, expiring server-side state records. The browser receives only an opaque session cookie. Provider access and refresh tokens are encrypted with AES-256-GCM before persistent storage and never form part of a frontend contract.

Sessions use a SHA-256 digest of the opaque cookie value, absolute and idle expiration, server-side invalidation, and a per-session CSRF token for mutations. Cookies are HttpOnly, SameSite=Lax, and Secure in production.

Token refresh uses a short database lease plus a credential version check. Only the lease holder calls the provider refresh endpoint, preventing duplicate use of providers that rotate refresh tokens.

## Consequences

- ADR 0002 records the earlier local SQLite implementation; ADR 0003 defines the active Python/FastAPI runtime and its staged persistence migration.
- Google and Microsoft credentials remain environment-only configuration.
- Mailbox and calendar modules can reuse provider credentials through `AuthService.validAccessToken` without exposing tokens to clients.
- Microsoft does not expose a direct OAuth token revocation endpoint for this flow; disconnect deletes RevoMail's local credential. Google disconnect also calls its revocation endpoint.
- A future cross-origin deployment must revisit Cookie, CORS, trusted-origin, and CSRF policy before it is supported.
