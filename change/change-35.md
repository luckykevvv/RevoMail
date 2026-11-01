# R9 corrective review

Date: 2026-11-01

## Task scope

Correct HTML-only manual email parsing, invalidate stale reply-generation state when tone or instructions change while preserving editable text, and verify that Google identity, Gmail connection/reconnection, and Calendar authorization use compatible callback and session-cookie origins.

## Changes and reason

- Archived the completed Gmail refresh/local-time greeting record unchanged as `change/change-34.md` and retained this work on `R9_Manual_email_analysis`.
- `backend/app/services/manual_email.py` now inserts text separators for table cells and a broader set of block elements. Its bounded HTML parser ignores `hidden`, `aria-hidden`, `display:none`, `visibility:hidden`, `mso-hide:all`, and collapsed-overflow preheaders, including nested hidden markup. It still opens no remote resources.
- Added HTML-only `.eml` regressions proving adjacent table headings/cells and block paragraphs remain distinct while hidden inbox-preview text is excluded.
- Manual reply generation now records the tone/instructions used for the returned draft. Changing either setting preserves the current draft, including user edits, but displays an announced regeneration-required message and updates the action label. A successful regeneration records the new basis and clears the warning.
- Gmail reply generation now applies the same generation-basis behavior. User-edited reply text remains intact after tone/instruction changes; stale drafts are not reused as current by reply or voice actions, and regeneration receives the preserved draft as context.
- Runtime configuration now requires an explicit `GOOGLE_REDIRECT_URI` to use the exact scheme, hostname, and effective port from `APP_BASE_URL`, with the fixed callback path. OAuth start and callback requests also reject an unexpected request origin without consuming callback state.
- The Electron service controller derives `GOOGLE_REDIRECT_URI` from its managed loopback origin, preventing a private `.env` callback host from conflicting with a selected `localhost` or `127.0.0.1` desktop host. Browser fixtures now set matching origins explicitly.
- Added deterministic coverage for matching and mismatched OAuth configuration/request origins and a complete identity sign-in, Gmail connect, Gmail reconnect, and Calendar authorization sequence that preserves one session.
- Updated README and authentication documentation to state that `localhost` and `127.0.0.1` are not interchangeable cookie origins.

## Commands and validation

- Confirmed the clean `R9_Manual_email_analysis` branch, its upstream, tracked-file inventory, and absence of skip-worktree entries.
- Read the repository rules, relevant requirements and setup documentation, current task record, and affected parser, frontend state, OAuth configuration, routes, and tests.
- Focused Python run: **81 passed** after correcting two test assumptions exposed by the first run (blank HTML separator lines and a default TestClient host).
- Focused JavaScript run: **12 passed** across manual-analysis and desktop service-controller tests.
- `npm run build`: passed; Vite transformed 1,564 modules and produced the production assets.
- First R9 browser launch failed safely because its fixture callback and application origins differed. After fixing that fixture environment, the next run used the older production build and reached 10 passes/1 expected missing-element failure. After the required rebuild, `$env:BROWSER_CHANNEL='msedge'; npm run test:browser:r9`: **11 passed**.
- `$env:BROWSER_CHANNEL='msedge'; npm run test:browser`: **32 passed**, including edited reply preservation, regeneration-required state, regeneration completion, existing Gmail reconnect, Calendar, sending, voice, accessibility, and 320-pixel workflows.
- `npm run test:js`: **154 passed in 29 files**.
- `$env:PYTEST_ADDOPTS='--basetemp=build/r9-review-full-pytest -p no:cacheprovider'; npm run test:python`: **221 passed**.
- Started `npm run start` in production mode on an isolated loopback origin with ignored test storage. Real HTTP checks returned health/database-ready `200`, built frontend `200` with a production asset reference, and unauthenticated accounts `401`. The temporary server was stopped.

## Remaining work and limitations

- OAuth provider behavior is covered with deterministic fakes. This review did not use a dedicated live Google test account, so Google consent-screen registration and real login/Gmail/Calendar grants remain externally unverified.
- Existing user-edited drafts are preserved during regeneration by sending them as the existing `current_draft`; accepting the newly generated text still replaces the editor contents, as designed.
- No desktop packaging or macOS/Linux checks were run because launcher packaging behavior was not changed; only the spawned backend environment was updated and unit-tested.
- No merge or push to `main` was performed.
