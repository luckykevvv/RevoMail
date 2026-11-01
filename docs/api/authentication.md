# Authentication API v1

All routes are same-origin under `/api/v1`. JSON errors use:

```json
{
  "error": {
    "code": "STABLE_CODE",
    "message": "Safe user-facing message",
    "retryable": false,
    "correlationId": "45dd5f26-1adb-4c46-95d4-22ca87ee092f"
  }
}
```

Provider tokens and secrets are never response fields. The browser cookie contains only a signed opaque session token; its hash and the encrypted provider credential are stored in SQLite.

## Session and OAuth

### `GET /api/v1/health`

Checks the FastAPI service. Returns `200` with status, service, and timestamp fields.

### `GET /api/v1/auth/session`

Returns `200` with provider availability and authentication state. An authenticated response contains user display fields and the value expected by the retained account UI.

### `GET /api/v1/auth/google/start?returnTo=/`

Requests only `openid`, `email`, and `profile`. The endpoint records hashed single-use state, encrypted PKCE/context, and a safe local `returnTo` path for ten minutes. OAuth must start and return on the exact configured `APP_BASE_URL` origin; `localhost` and `127.0.0.1` are intentionally not interchangeable because browser session cookies are host-only. Optional connection callbacks require the originating session cookie on that callback host.

### `GET /api/v1/auth/google/callback`

Validates the callback origin before atomically consuming state, then restores the PKCE verifier and requested scopes, exchanges the code, and loads the Google profile. Sign-in upserts identity and rotates the application session without creating a mailbox or touching existing credentials. Gmail/Calendar callbacks require the same live initiating session and Google account identity, validate actual grants, and preserve session/CSRF state. Expired, replayed, legacy-context, mismatched-origin, mismatched-account, and provider failures redirect with safe `authError` codes; the authenticated Settings page displays connection errors.

### `POST /api/v1/auth/logout`

Clears the signed application session and returns `204`.

## Connected accounts

### `GET /api/v1/accounts`

Returns the current session's connected Google account with provider, email, display name, status, and granted scopes, or an empty list for an identity-only user. Empty accounts do not invalidate sign-in.

### `POST /api/v1/accounts/google/connect`

Requires authentication and `X-CSRF-Token`. Returns `{ "authorizationUrl": "..." }` for an explicit Gmail connection requesting identity, `gmail.modify`, and `gmail.send` scopes. Provider additions use incremental authorisation and offline access. Encrypted transaction context binds user, session hash, purpose, requested scopes, and PKCE verifier. Partial/unknown requested grants do not replace working credentials; a missing replacement refresh token preserves the prior same-client token. Optional grants from an older credential are not additional requirements for Gmail recovery.

### `POST /api/v1/accounts/:id/reauthorize`

Requires authentication, `X-CSRF-Token`, and account ownership; returns a Gmail consent URL. It does not newly request Calendar permission. Calendar access remains enabled when Google returns its grant; if missing, Gmail reconnect succeeds and the account exposes `calendarRequiresReauthorization: true` for a separate opt-in. After credentials are saved, a stale credential-failure sync status is cleared without claiming sync success or deleting cached messages/history. The redirect includes `connected=gmail` so Settings displays an authorisation-saved receipt; frontend bootstrap initiates synchronization. Callback failures log only safe correlation/purpose/error codes and keep existing credentials unchanged.

### `POST /api/v1/accounts/:id/authorize-calendar`

Requires authentication, `X-CSRF-Token`, and ownership of an existing Gmail connection. Returns a separate consent URL adding `calendar.events`. Calendar-only connection without Gmail is outside R9. Existing Calendar grants continue working without reauthorisation.

### `DELETE /api/v1/accounts/:id`

Requires authentication, `X-CSRF-Token`, and ownership. Removes the connection and local Gmail/Calendar credentials, leaving the RevoMail session and identity intact. Provider-side revocation is not implemented in the Python path; revoke the grant in Google account settings if needed.

## Gmail and AI

- `/api/v1/emails` is the sole Gmail mailbox namespace. It provides synchronized pagination, Gmail search, safe message reading, unread/starred mutation, synchronization status, and confirmed idempotent sending.
- `POST /api/v1/ai/summarise` returns a summary and bullet points for a message.
- `POST /api/v1/ai/extract` returns explicit tasks and events.
- `POST /api/v1/ai/draft-reply` returns a human-reviewable reply draft and accepts a tone.
- `/api/v1/ai/manual/*` requires a valid application session and CSRF token, never Gmail tokens. See the manual analysis contract in `v1-contracts.md`.
