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

## Read state

Each message in `GET /api/v1/emails` and `GET /api/v1/emails/{id}` carries `unread` (true when Gmail still has the `UNREAD` label on it).

`POST /api/v1/emails/{id}/read` removes the `UNREAD` label in Gmail and returns `{ "id": "...", "unread": false }`. It is idempotent, needs an authenticated session with a connected mailbox, and requires the `gmail.modify` scope. Accounts connected before that scope was requested receive `403 INSUFFICIENT_PERMISSIONS` (not retryable) until the user reconnects the Google account in Settings. Other provider failures return `502 EMAIL_PROVIDER_FAILED`. The frontend marks the row read immediately, then restores it to unread if this call fails, so RevoMail never shows a state that Gmail does not have.

## Sending email and the Sent mailbox

`GET /api/v1/emails?label=SENT` lists the connected account's Gmail Sent mail (same response shape as the inbox; `to` holds the recipients). `label` accepts `INBOX` (default) or `SENT`, case-insensitively; anything else returns `422 INVALID_REQUEST`.

`GET /api/v1/emails/{id}` also returns `reply_to`: the list of addresses a reply would go to, so the UI can show them before sending. For a message you received this is its `Reply-To` header, otherwise `From`; for a message you sent (Gmail `SENT` label) it is the original `To`.

`POST /api/v1/emails/send` sends a message from the connected Gmail account (`gmail.send`/`gmail.modify` scope):

```json
{
  "to": "bob@example.com",
  "subject": "Hello",
  "body": "Plain-text body",
  "replyToMessageId": null,
  "confirmed": true,
  "idempotencyKey": "client-generated, 8-128 characters"
}
```

- `confirmed` must be `true`, set only after the user has reviewed the final recipients, subject and body. Otherwise `400 CONFIRMATION_REQUIRED`.
- For a reply, set `replyToMessageId`. The recipient is then taken **from that message on the server** (see `reply_to` above) and any `to` sent by the client is ignored, so a reply cannot be redirected. The reply is placed in the same Gmail thread (`threadId`, `In-Reply-To`, `References`). An empty `subject` becomes `Re: <original subject>`.
- For a new message, `to` is required (at most 20 addresses; syntax is validated, and values containing line breaks are rejected to prevent header injection). Invalid input returns `422 INVALID_RECIPIENT`.
- Success returns `{ "id", "threadId", "sent": true, "replayed": false }`.
- Idempotency: repeating a request with the same `idempotencyKey` and identical content returns the original result with `"replayed": true` and does not send again. Reusing a key for different content returns `409 IDEMPOTENCY_KEY_REUSED`; a request still running returns `409 SEND_IN_PROGRESS` (retryable). Only the provider message id is stored with the key, never recipients, subject or body.
- Delivery outcomes: a definite failure (validation, `403 INSUFFICIENT_PERMISSIONS` when the account must be reconnected, `404 EMAIL_NOT_FOUND`, other 4xx → `502 EMAIL_PROVIDER_FAILED`) releases the key so the same request can be retried. If Gmail may have accepted the message (timeout, unexpected error or a Gmail 5xx) the response is `502 SEND_OUTCOME_UNKNOWN`, the key is locked, and repeating it returns `409 SEND_OUTCOME_UNKNOWN`; the user must check the Sent mailbox before sending again.
- Every attempt writes an `AuditRecord` (`email.send`, outcome `SUCCEEDED`, `FAILED`, `REJECTED` or `UNKNOWN`, correlation id, Gmail message id on success). Message content is never logged or audited.

## AI operations

The implemented endpoints are `POST /api/v1/ai/summarise`, `POST /api/v1/ai/extract`, `POST /api/v1/ai/draft-reply`, and `POST /api/v1/ai/classify`. The first three accept a mailbox `message_id`; reply drafting also accepts `professional`, `concise`, or `friendly` tone. Output remains a draft for human review.

### Event extraction

`POST /api/v1/ai/extract` returns `events` and `tasks`. Each event keeps the text as written in the email (`date`, `time`, `location`, `organiser`) and also carries `start`, `end` and `all_day`. `start` is `YYYY-MM-DDTHH:MM` (or `YYYY-MM-DD` for an all-day event) and `end` is `YYYY-MM-DDTHH:MM`; both are `null` when the AI could not resolve them with certainty. Relative dates such as "tomorrow" are resolved against the email's sent date. Values that are not real calendar dates are dropped by the server. These fields only pre-fill the calendar form; the user checks and can change them before anything is created.

## Calendar

`POST /api/v1/calendar/events` adds an event to the connected Google account's primary calendar (`calendar` scope):

```json
{
  "title": "Project Meeting",
  "startsAt": "2026-10-05T10:00",
  "endsAt": "2026-10-05T11:00",
  "timezone": "Australia/Melbourne",
  "allDay": false,
  "location": "Room 302",
  "description": "",
  "confirmed": true,
  "idempotencyKey": "client-generated, 8-128 characters"
}
```

- Times are local wall-clock values in `timezone` (an IANA name; invalid names are rejected). For `allDay: true`, `startsAt` and `endsAt` are dates and `endsAt` is the inclusive last day. A missing `endsAt` on a timed event means one hour. The end must be after the start.
- `confirmed` must be `true`, set only after the user reviewed the event in the dialog. Otherwise `400 CONFIRMATION_REQUIRED`. Invalid input returns `422 INVALID_EVENT`.
- Success returns `{ "id", "htmlLink", "created": true, "replayed": false }`.
- Idempotency, delivery outcomes and auditing work exactly as for sending email (see above), with these codes: `409 IDEMPOTENCY_KEY_REUSED`, `409 CALENDAR_IN_PROGRESS`, `502`/`409 CALENDAR_OUTCOME_UNKNOWN` (check Google Calendar before adding it again), `403 INSUFFICIENT_PERMISSIONS` (reconnect the Google account). Only the Google event id and link are stored with the key; the audit operation is `calendar.create`.

### Guided drafting

`POST /api/v1/ai/draft-reply` also accepts optional `instructions` (what the user wants to say, up to 1000 characters) and `current_draft` (up to 20000 characters). With instructions the reply follows them; with `current_draft` as well, that draft is revised rather than rewritten. The original email is treated as untrusted content, so instructions inside it are not followed. The sign-off uses the signed-in user's display name instead of a placeholder.

`POST /api/v1/ai/compose` writes a new email from `instructions` (required, 1-1000 characters), `tone`, and optional `subject` and `current_draft`. It returns `{ "subject", "draft" }`; an existing subject is kept unchanged. Both endpoints only return text for the user to review and edit; sending always goes through `POST /api/v1/emails/send` after explicit confirmation. Provider failures return `502 AI_PROVIDER_FAILED` with no provider detail.

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

Voice, task creation, calendar creation, and email sending are not implemented. Their shared request boundaries are reserved in `backend/app/contracts.py` so later modules do not invent incompatible shapes:

- Voice commands carry an editable `transcript` and an explicit `confirmed` flag.
- Task mutations carry reviewed fields, `confirmed`, and an `idempotencyKey`.
- Calendar mutations carry reviewed date/time fields, timezone, `confirmed`, and an `idempotencyKey`.
- Any future email or calendar mutation must reject `confirmed=false` and use its idempotency key before contacting a provider.

These reserved models do not imply that an external mutation currently exists.
