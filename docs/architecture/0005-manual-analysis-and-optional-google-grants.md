# ADR 0005 Manual email analysis and optional Google grants

Date: 2026-11-01

## Status

Accepted. Supersedes the combined sign-in/mailbox authorisation behaviour described in earlier authentication records; existing persistence and provider adapters remain in use.

## Decision

Google sign-in establishes only identity and a RevoMail session. Gmail is an explicit optional connection; Calendar is a separate explicit permission addition on that connection. Identity callbacks never overwrite provider credentials. Existing connections and refresh tokens survive ordinary sign-in and incremental grants.

The existing OAuthTransaction encrypted verifier payload now carries purpose, requested scopes, PKCE verifier, initiating user/session hash, and target connection. No database schema migration is required. State remains hashed, single-use, atomic, and time-limited. Connection callbacks validate the initiating live session and provider subject before writing credentials. Legacy pending transactions require retry; durable accounts and sessions remain compatible.

Manual analysis has its own session/CSRF-protected router and request models. Streamed limits precede JSON/MIME parsing. The parser accepts text and standard email exports, ignores attachments, converts HTML fallback to text without loading resources, and returns an editor preview. The user separately requests an AI action. The router calls the existing AI service methods and request-local model/reply preferences, never Gmail adapters or token dependencies.

Manual source text, results, files, drafts, and suggestions remain transient. They do not enter the mailbox cache, tasks, jobs, idempotency records, browser storage, or logs. API responses prohibit caching. A bounded per-user in-memory limiter stores only action timestamps. This limit has the same single-process deployment boundary as existing speech limits.

## Consequences

- Signed-in users without Gmail can analyse controlled content from any email provider without a provider API integration.
- Manual replies and task/event suggestions are editable and copy-only. Existing Gmail send/Calendar writes retain their separate confirmation and idempotency boundaries.
- Optional connection callbacks must arrive on a host carrying the initiating session cookie; missing continuity fails safely. Identity sign-in retains its loopback-host transition support.
- Disconnect removes all locally stored credentials for the Google connection but preserves identity/session. Provider-side revocation remains future work.
- Manual input is capped at the existing AI service's 15,000-character body budget. Priority classification retains the existing 400-character preview behaviour.
- Browser functional tests run the real frontend and FastAPI with test-only Google/AI fakes. They prove R9 behaviour, not real-provider authorisation or model quality.
