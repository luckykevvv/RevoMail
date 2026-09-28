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
- `GET /api/v1/auth/google/start?returnTo=/` redirects to Google.
- `GET /api/v1/auth/google/callback` consumes a single-use server-side OAuth transaction and creates an opaque application session.
- `POST /api/v1/auth/logout` invalidates the server-side session and returns `204`.

## Connected accounts

- `GET /api/v1/accounts` returns only accounts owned by the authenticated user.
- `POST /api/v1/accounts/{id}/reauthorize` returns a fresh authorization URL.
- `DELETE /api/v1/accounts/{id}` deletes the local connection and encrypted credential, then returns `204`.

## Gmail mailbox

`/api/v1/emails` is the sole mailbox API for the current Gmail-only, single-user MVP. `GET /api/v1/emails?max_results=20&page_token=...` returns the established `messages` and `next_page_token` fields, plus safe synchronization status:

```json
{
  "messages": [],
  "next_page_token": null,
  "sync": { "status": "idle", "lastSyncedAt": null }
}
```

- `GET /api/v1/emails` accepts `max_results`, `page_token`, `query`, `category`, `unread`, and `starred`. The `Primary` category is the main inbox view and excludes Gmail `Social` and `Promotions`; `All` returns every synchronized INBOX message.
- `GET /api/v1/emails/{messageId}` returns normalized metadata, attachment metadata, encrypted-cache-backed plain text, and sanitized HTML.
- `PATCH /api/v1/emails/{messageId}` modifies unread/starred state after validating the session CSRF token.
- `POST /api/v1/emails/sync` starts or reuses a recoverable sync; `GET /api/v1/emails/sync/{jobId}` reports job and mailbox state.
- `POST /api/v1/emails/send` requires reviewed recipients, subject, body, `confirmed=true`, and an idempotency key. Results are `sent`, `failed`, or `unknown`; an unknown operation is never automatically resent.

Gmail message identifiers and page cursors are opaque. Gmail payloads, credentials, raw HTML, and provider errors never cross the public boundary. There is no parallel account-scoped mailbox API.

## AI operations

The implemented endpoints are `POST /api/v1/ai/summarise`, `POST /api/v1/ai/extract`, `POST /api/v1/ai/draft-reply`, and `POST /api/v1/ai/classify`. The first three accept a mailbox `message_id`; reply drafting also accepts `professional`, `concise`, or `friendly` tone. Output remains a draft for human review.

### Priority classification

`POST /api/v1/ai/classify` labels inbox messages from list metadata only (message bodies are not fetched). It requires an authenticated session with a connected mailbox.

```json
{
  "messages": [
    { "id": "gmail-1", "sender": "boss@example.com", "subject": "Approval needed", "preview": "Can you sign off today?" }
  ]
}
```

`messages` holds 1 to 25 items; larger batches are rejected with `422 INVALID_REQUEST`. The response maps each classified id to a priority and a short reason, plus a `warning`:

```json
{ "classifications": { "gmail-1": { "priority": "high", "reason": "Approval needed today" } }, "warning": null }
```

`warning` is `null` unless nothing usable came back: `"unreadable_reply"` (the model reply was not valid JSON) or `"no_valid_labels"` (valid JSON but no valid priority for any message). In both cases `classifications` is empty and the request still returns 200.

`priority` is `high` (needs an urgent reply or action), `medium` (updates and routine communication), or `low` (advertisements and other low-relevance mail). Ids the model omits or labels invalidly are absent from `classifications`; clients must show those messages unlabelled rather than guessing. Provider failures return the standard `502 AI_PROVIDER_FAILED` error. The label is an AI suggestion, not a mailbox change: nothing is moved, archived, or deleted.

## Reserved v1 operation contracts

Voice, task creation, and calendar creation are not implemented. Email sending now uses the confirmed Gmail contract; the other shared request boundaries remain reserved in `backend/app/contracts.py`:

- Voice commands carry an editable `transcript` and an explicit `confirmed` flag.
- Task mutations carry reviewed fields, `confirmed`, and an `idempotencyKey`.
- Calendar mutations carry reviewed date/time fields, timezone, `confirmed`, and an `idempotencyKey`.
- Any future email or calendar mutation must reject `confirmed=false` and use its idempotency key before contacting a provider.

These reserved models do not imply that an external mutation currently exists.
