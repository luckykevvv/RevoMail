# Remove preset inbox messages for Issue #56

Date: 2026-08-16

## Scope

Fix GitHub Issue #56 so an authenticated user never sees RevoMail's preset inbox messages while the connected email provider is loading. Preserve the login-page product illustration and existing Gmail pagination behavior.

## Changes

- Removed all six preset messages from the runtime inbox data in `src/main.js`.
- Initialized mailbox messages and the selected message as empty until the connected provider responds.
- Reset mailbox, selection, pagination, and AI state before the first provider page, on sign-out, and when no connected account exists.
- Added a provider-specific loading state and a truthful empty-provider state instead of rendering stale demo data.
- Replaced the hard-coded Inbox badge and six-email summary message with values derived from the current provider mailbox.
- Added a mailbox page state helper and regression tests proving that the first provider page replaces stale data, an empty provider stays empty, and later pages append.
- Archived the previous Module 2 task record as `change/change-9.md`.

## Reason

The frontend previously initialized the authenticated inbox with six demo messages. `fetchEmails()` started immediately after session bootstrap, but its loading render continued to display those messages until Gmail returned. Users therefore saw unrelated mail for several seconds after login.

## Key Commands

```powershell
git status --short --branch
git ls-files -v | Select-String '^S'
npm.cmd run test:js
npm.cmd test
npm.cmd run build
npm.cmd run desktop:pack
npm.cmd run desktop:ui-smoke
git diff --check
git status --short --branch
```

## Validation

- `npm.cmd test` passed 16 JavaScript test files with 46 tests and all 17 Python tests.
- The new mailbox regression tests verify first-page replacement, an empty provider response, and later-page append behavior.
- `npm.cmd run build` produced the Vite production frontend successfully.
- The production JavaScript bundle contains none of the removed preset inbox sender addresses.
- `npm.cmd run desktop:pack` rebuilt the Windows unpacked application successfully.
- `npm.cmd run desktop:ui-smoke` launched the real unpacked Electron application, reached database-ready health, opened the application without launcher errors, and reached the Google authorization page.

## Known Issues and Remaining Work

- The real signed-in Gmail transition was not repeated because no test-account credentials were entered during the smoke test. Provider responses remain covered by local fakes and the mailbox state regression tests.
- This change fixes the incorrect preset content during initial login loading. Periodic background polling for newly arrived messages is not added by this issue.
- The current branch also contains the earlier uncommitted Module 2 work; no commit or push was performed.
