# Authentication API v1

All routes are same-origin under `/api/v1`. JSON errors use:

```json
{
  "error": {
    "code": "STABLE_CODE",
    "message": "Safe user-facing message",
    "retryable": false,
    "correlationId": "request identifier"
  }
}
```

Provider tokens and secrets are never response fields.

## Session and OAuth

### `GET /api/v1/health`

Checks the HTTP service and database. Returns `200 { "status": "ok" }` or a retryable `DATABASE_UNAVAILABLE` error.

### `GET /api/v1/auth/session`

Returns `200` with `authenticated: false` and provider availability when signed out. An authenticated response contains safe user fields, provider availability, and a short-lived in-memory CSRF token. Send that value in `X-CSRF-Token` for mutations.

### `GET /api/v1/auth/:provider/start?returnTo=/`

Supports `google` and `microsoft`. Creates expiring state and PKCE records, then redirects to the provider. `returnTo` must be a local path.

### `GET /api/v1/auth/:provider/callback`

Validates and consumes state, exchanges the code, validates granted scopes, stores encrypted credentials, creates the application session, and redirects to a clean frontend URL. Provider failures redirect with a safe `authError` code.

### `POST /api/v1/auth/logout`

Requires the session Cookie and `X-CSRF-Token`. Invalidates the server-side session and clears the Cookie. Returns `204`.

## Connected accounts

### `GET /api/v1/accounts`

Returns only accounts owned by the session user, including provider, email, display name, status, granted scopes, and timestamps.

### `POST /api/v1/accounts/:id/reauthorize`

Requires authentication and CSRF. Returns a fresh consent URL for an account owned by the session user.

### `DELETE /api/v1/accounts/:id`

Requires authentication and CSRF. Google access is revoked before local deletion. Microsoft credentials are deleted locally because this OAuth flow has no direct token revocation endpoint. A provider revocation failure preserves the local record as `REVOCATION_FAILED` so the user can retry safely.
