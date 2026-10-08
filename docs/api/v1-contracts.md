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

## Sending email and the Sent mailbox

`GET /api/v1/emails?label=SENT` lists live, paginated Gmail Sent mail using the same list response shape as INBOX. Accepted labels are uppercase INBOX (default) and SENT. Sent pages and sent-only details do not enter the inbox cache.

`GET /api/v1/emails/{id}/reply-metadata` returns `reply_to` and `subject`. Reply recipients come from Reply-To, otherwise From; sent messages use the original To. The frontend fetches this metadata before drafting and displays these recipients for review. Ordinary cached reading remains cache-first.

`POST /api/v1/emails/send` retains the Module 3 contract and requires authentication, CSRF and gmail.modify:

```json
{
  "to": ["bob@example.com"],
  "cc": [],
  "bcc": [],
  "subject": "Hello",
  "bodyText": "Reviewed plain-text body",
  "inReplyToMessageId": null,
  "confirmed": true,
  "idempotencyKey": "client-generated, 16-200 characters"
}
```

- Recipients, subject and body must be reviewed; invalid input or confirmation returns 422. The exact reviewed recipients are sent, including replies. Reply threading preserves the original thread, In-Reply-To and References.
- Results are `{ operationId, status: "sent" | "failed" | "unknown", providerMessageId?, threadId? }`. Identical retries return the saved result; changed content under the same key returns 409 IDEMPOTENCY_CONFLICT. The per-user attempt limit returns 429 SEND_RATE_LIMITED.
- Ambiguous send outcomes remain unknown and cannot be automatically resent. The existing send:gmail idempotency namespace and audit semantics remain unchanged; calendar creation has separate handling. Request content is hashed, not stored in idempotency or audit records.

## AI operations

The implemented endpoints are `POST /api/v1/ai/summarise`, `POST /api/v1/ai/extract`, `POST /api/v1/ai/draft-reply`, and `POST /api/v1/ai/classify`. The first three accept a mailbox `message_id`; reply drafting also accepts `professional`, `concise`, or `friendly` tone. Output remains a draft for human review.

### Event extraction

`POST /api/v1/ai/extract` returns `events` and `tasks`. Each event keeps the text as written in the email (`date`, `time`, `location`, `organiser`) and also carries `start`, `end` and `all_day`. `start` is `YYYY-MM-DDTHH:MM` (or `YYYY-MM-DD` for an all-day event) and `end` is `YYYY-MM-DDTHH:MM`; both are `null` when the AI could not resolve them with certainty. Relative dates such as "tomorrow" are resolved against the email's sent date. Values that are not real calendar dates are dropped by the server. These fields only pre-fill the calendar form; the user checks and can change them before anything is created.

## Calendar

`POST /api/v1/calendar/events` adds an event to the connected Google account's primary calendar (`https://www.googleapis.com/auth/calendar.events` scope; reconnect older accounts to grant it):

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

- Times are local wall-clock values in `timezone` (an IANA name; invalid names are rejected). For `allDay: true`, `startsAt` and `endsAt` are dates and `endsAt` is the inclusive last day. A missing `endsAt` on a timed event means one hour. The end must be after the start. Nonexistent or ambiguous local times at daylight-saving transitions are rejected for user correction.
- `confirmed` must be `true`, set only after the user reviewed the event in the dialog. Otherwise `400 CONFIRMATION_REQUIRED`. Invalid input returns `422 INVALID_EVENT`.
- Success returns `{ "id", "htmlLink", "created": true, "replayed": false }`.
- Authentication and X-CSRF-Token are required. Calendar idempotency uses the independent calendar.create namespace. Identical retries replay the saved result; changed payloads conflict. Definite provider rejection releases the key; ambiguous failures retain it. Codes: `409 IDEMPOTENCY_KEY_REUSED`, `409 CALENDAR_IN_PROGRESS`, `502`/`409 CALENDAR_OUTCOME_UNKNOWN` (check Google Calendar before adding it again), `403 INSUFFICIENT_PERMISSIONS` (reconnect the Google account). Rate limits return 429 CALENDAR_RATE_LIMITED and permit retrying the same key. Only the Google event id and link are stored with the key; the audit operation is `calendar.create`.

### Guided drafting

`POST /api/v1/ai/draft-reply` also accepts optional `instructions` (what the user wants to say, up to 1000 characters) and `current_draft` (up to 20000 characters). With instructions the reply follows them; with `current_draft` as well, that draft is revised rather than rewritten. The original email is treated as untrusted content, so instructions inside it are not followed. The sign-off uses the signed-in user's display name instead of a placeholder.

`POST /api/v1/ai/compose` writes a new email from `instructions` (required, 1-1000 characters), `tone`, and optional `subject` and `current_draft`. It returns `{ "subject", "draft" }`; an existing subject is kept unchanged. Both endpoints read the authenticated user's model and reply-length preferences for each request. Both endpoints only return text for the user to review and edit; sending always goes through `POST /api/v1/emails/send` after explicit confirmation. Provider failures return `502 AI_PROVIDER_FAILED` with no provider detail.

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

### User preferences (implemented)

`GET /api/v1/settings` requires an authenticated session and returns `{ "settings": { ... }, "allowedAiModels": ["configured-model"] }`. `PATCH /api/v1/settings` also requires `X-CSRF-Token` and accepts a non-empty partial settings object. Unknown properties, nulls, incorrect types, unsupported enum values, and models outside the server allowlist return 422. Updates preserve unspecified fields atomically and are scoped to the session user.

Settings fields: `language` (`en`, `zh-CN`), `theme` (`system`, `light`, `dark`), `reducedMotion` (boolean), `defaultAiModel` (configured string), `replyLength` (`concise`, `medium`, `detailed`), `speechLanguage` (`auto`, `en-AU`, `en-US`, `zh-CN`), `voiceEnabled` (boolean), and `voiceAutoPlay` (boolean). Defaults are English, system theme, no explicit motion reduction, the server model, medium replies, automatic English/Chinese recognition, voice off, and automatic playback for voice-originated commands on. Existing saved language choices remain unchanged. Invalid stored values fall back independently. Logout does not delete settings.

### Voice transcription (implemented)

`GET /api/v1/voice/capabilities` requires a session and returns the backward-compatible `available` flag plus `transcriptionAvailable`, `synthesisAvailable`, `intentAvailable`, `languages`, `mimeTypes`, `maxSeconds`, `maxBytes`, `timeoutSeconds`, and `maxSpeechChars`. Provider keys and model credentials are never returned.

`POST /api/v1/voice/transcriptions?language=auto` requires a session, CSRF header, and saved `voiceEnabled=true`. Its body is raw audio, not multipart or JSON. Supported Content-Type base values are `audio/webm`, `audio/mp4`, and `audio/ogg`; codec parameters are accepted. The server checks container signatures, limits incoming bytes while streaming, then delegates decoding to the provider. `auto` omits the provider language hint; explicit English and Simplified Chinese settings send a language hint. Success returns `{ "text": "Show my tasks" }`. This endpoint never invokes commands or persists audio/text.

Errors use the existing error envelope: `VOICE_DISABLED` (403), `VOICE_UNAVAILABLE` (503), `VOICE_INVALID_AUDIO` (415/422), `VOICE_AUDIO_TOO_LARGE` (413), `VOICE_RATE_LIMITED` (429), `VOICE_TIMEOUT` (504), `VOICE_PROVIDER_FAILED` (502), `VOICE_NO_SPEECH` (422), and `VOICE_TRANSCRIPT_TOO_LONG` (422). The text limit is 2000 characters. Rate limits are process-local to the current single-process MVP. Client recording duration is bounded by `maxSeconds`; the server does not trust a client duration header and enforces the byte limit independently.

`POST /api/v1/voice/intents` accepts an editable transcript, language mode, current view/message context, and an optional `followUpMessageId` established by an explicitly reviewed target selection in the current dialog. Documented common English and Chinese commands, including common polite wrappers, follow-up references such as “summarise it”, and safe search-then-summary requests are parsed deterministically; other commands use the configured chat model with strict JSON Schema output and are accepted only after validation against the closed action, destination, and target-filter enums. `detectedLanguage` reports the input language, while `displayText` is always an English review description. It returns an inert preview only. The client visibly identifies the retained follow-up target, resolves at most five mailbox candidates, and requires a separate confirmation before invoking existing workflows. Voice results and speech playback use English. Sending, deletion, archiving, mailbox-state changes, task creation, and calendar creation are rejected.

`POST /api/v1/voice/speech` requires CSRF, saved voice consent, and `{ "text": "...", "language": "en|zh-CN" }`. It returns uncached `audio/mpeg`. Each request is limited to the configured maximum of at most 4096 characters; the client splits longer results at sentence boundaries. The server does not persist or log input text or generated audio. Playback is identified as AI-generated and remains optional.

Voice transcription and reviewed Calendar creation are implemented with fixture coverage. Task creation remains reserved in `backend/app/contracts.py`. Voice commands cannot create events or send messages:

- Voice commands carry an editable `transcript` and an explicit `confirmed` flag.
- Task mutations carry reviewed fields, `confirmed`, and an `idempotencyKey`.
- Calendar mutations carry reviewed date/time fields, timezone, `confirmed`, and an `idempotencyKey`.
- Any future email or calendar mutation must reject `confirmed=false` and use its idempotency key before contacting a provider.

These reserved models do not imply that an external mutation currently exists.
