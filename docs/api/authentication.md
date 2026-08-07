# Authentication API v1

All routes are same-origin under `/api/v1`. JSON errors use:

```json
{
  "error": {
    "code": "STABLE_CODE",
    "message": "Safe user-facing message",
    "retryable": false
  }
}
```

Provider tokens and secrets are never response fields.

## Session and OAuth

### `GET /api/v1/health`

Checks the FastAPI service. Returns `200` with status, service, and timestamp fields.

### `GET /api/v1/auth/session`

Returns `200` with provider availability and authentication state. An authenticated response contains user display fields and the value expected by the retained account UI.

### `GET /api/v1/auth/:provider/start?returnTo=/`

Google is implemented; Microsoft returns a pending-provider error. The endpoint records OAuth state and a local `returnTo` path before redirecting.

### `GET /api/v1/auth/:provider/callback`

Validates state, exchanges the code, loads the Google profile, creates the signed application session, and redirects to a clean frontend URL. Provider failures redirect with a safe `authError` code.

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

- `GET /api/v1/emails` lists Gmail inbox metadata and accepts `max_results` and `page_token`.
- `GET /api/v1/emails/:messageId` returns message metadata, text, and cleaned HTML.
- `POST /api/v1/ai/summarise` returns a summary and bullet points for a message.
- `POST /api/v1/ai/extract` returns explicit tasks and events.
- `POST /api/v1/ai/draft-reply` returns a human-reviewable reply draft and accepts a tone.
