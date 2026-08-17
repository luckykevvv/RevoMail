# RevoMail API v1 contracts

All application endpoints use the same-origin `/api/v1` prefix. JSON field names are stable within v1. Provider SDK payloads and provider credentials are not part of the public contract.

## Standard errors

Every JSON error contains a stable code, a safe user-facing message, a retryability flag, and a correlation identifier. The same identifier is returned in the `X-Correlation-ID` response header.

```json
{
  "error": {
    "code": "NOT_AUTHENTICATED",
    "message": "Not authenticated.",
    "retryable": false,
    "correlationId": "45dd5f26-1adb-4c46-95d4-22ca87ee092f"
  }
}
```

Clients may retry only when `retryable` is true and the operation itself is safe to repeat. Internal exception text, provider responses, tokens, message bodies, email addresses, and configuration values are never error fields.

## Authentication and health

- `GET /api/v1/health` returns process status, a non-sensitive database readiness check, service name, and timestamp.
- `GET /api/v1/auth/session` returns authentication state, safe user display fields, CSRF value, and provider availability.
- `GET /api/v1/auth/{provider}/start?returnTo=/` redirects to an available provider.
- `GET /api/v1/auth/google/callback` consumes a single-use server-side OAuth transaction and creates an opaque application session.
- `POST /api/v1/auth/logout` invalidates the server-side session and returns `204`.

## Connected accounts

- `GET /api/v1/accounts` returns only accounts owned by the authenticated user.
- `POST /api/v1/accounts/{id}/reauthorize` returns a fresh authorization URL.
- `DELETE /api/v1/accounts/{id}` deletes the local connection and encrypted credential, then returns `204`.

## Mailbox pagination

The implemented Gmail compatibility route is `GET /api/v1/emails?max_results=20&page_token=...`. It returns `messages` and `next_page_token`. New provider-neutral list endpoints must use the following v1 page shape without exposing provider cursors as provider-specific fields:

```json
{
  "items": [],
  "page": {
    "nextCursor": null,
    "hasMore": false
  }
}
```

## AI operations

The implemented endpoints are `POST /api/v1/ai/summarise`, `POST /api/v1/ai/extract`, and `POST /api/v1/ai/draft-reply`. Each accepts a mailbox `message_id`; reply drafting also accepts `professional`, `concise`, or `friendly` tone. Output remains a draft for human review.

## Reserved v1 operation contracts

Voice, task creation, calendar creation, and email sending are not implemented. Their shared request boundaries are reserved in `backend/app/contracts.py` so later modules do not invent incompatible shapes:

- Voice commands carry an editable `transcript` and an explicit `confirmed` flag.
- Task mutations carry reviewed fields, `confirmed`, and an `idempotencyKey`.
- Calendar mutations carry reviewed date/time fields, timezone, `confirmed`, and an `idempotencyKey`.
- Any future email or calendar mutation must reject `confirmed=false` and use its idempotency key before contacting a provider.

These reserved models do not imply that an external mutation currently exists.
