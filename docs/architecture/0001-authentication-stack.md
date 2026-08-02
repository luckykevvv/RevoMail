# ADR 0001: Authentication backend and persistence

Date: 2026-08-03

## Status

Accepted for Module 1.

## Decision

RevoMail uses the existing Node.js and Express runtime for a same-origin API and production frontend server. PostgreSQL is the persistent store, Prisma owns the schema and migrations, Zod validates startup configuration, and provider-specific OAuth behavior is isolated behind a common adapter.

OAuth uses the authorization code flow with PKCE and one-time, expiring server-side state records. The browser receives only an opaque session cookie. Provider access and refresh tokens are encrypted with AES-256-GCM before PostgreSQL storage and never form part of a frontend contract.

Sessions use a SHA-256 digest of the opaque cookie value, absolute and idle expiration, server-side invalidation, and a per-session CSRF token for mutations. Cookies are HttpOnly, SameSite=Lax, and Secure in production.

Token refresh uses a short database lease plus a credential version check. Only the lease holder calls the provider refresh endpoint, preventing duplicate use of providers that rotate refresh tokens.

## Consequences

- PostgreSQL and a valid 32-byte encryption key are required before the production server starts.
- Google and Microsoft credentials remain environment-only configuration.
- Mailbox and calendar modules can reuse provider credentials through `AuthService.validAccessToken` without exposing tokens to clients.
- Microsoft does not expose a direct OAuth token revocation endpoint for this flow; disconnect deletes RevoMail's local credential. Google disconnect also calls its revocation endpoint.
- A future cross-origin deployment must revisit Cookie, CORS, trusted-origin, and CSRF policy before it is supported.
