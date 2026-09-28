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

The endpoint records a single-use OAuth state and local `returnTo` path for ten minutes before redirecting to Google. The server-side transaction also preserves validation when a loopback callback changes between `127.0.0.1` and `localhost` and the browser cannot send the original host cookie.

### `GET /api/v1/auth/google/callback`

Atomically consumes and validates state, exchanges the code, loads the Google profile, stores the encrypted credential and hashed application session in SQLite, and redirects to a clean frontend URL. Expired or replayed states and provider failures redirect with a safe `authError` code.

### `POST /api/v1/auth/logout`

Clears the signed application session and returns `204`.

## Connected accounts

### `GET /api/v1/accounts`

Returns the current session's connected Google account with provider, email, display name, status, and granted scopes.

### `POST /api/v1/accounts/:id/reauthorize`

Requires authentication and returns a fresh Google consent URL.

### `DELETE /api/v1/accounts/:id`

Requires authentication and removes the Google credential and account from the current application session. Provider-side revocation is not yet implemented in the Python path.

## Gmail and AI

- `/api/v1/emails` is the sole Gmail mailbox namespace. It provides synchronized pagination, Gmail search, safe message reading, unread/starred mutation, synchronization status, and confirmed idempotent sending.
- `POST /api/v1/ai/summarise` returns a summary and bullet points for a message.
- `POST /api/v1/ai/extract` returns explicit tasks and events.
- `POST /api/v1/ai/draft-reply` returns a human-reviewable reply draft and accepts a tone.
