# Reduce navigation rendering and asynchronous request contention

Date: 2026-08-24

## Task Scope

Fix progressive UI blocking and lag after repeated navigation by preserving the authenticated application shell, avoiding repeated sidebar event binding, cancelling stale view requests, and clearing view-specific timers without changing the established RevoMail design.

## Changes

- Kept the authenticated application shell and sidebar mounted across page navigation; only the workspace and overlay regions are replaced.
- Limited event binding to newly rendered workspace/overlay nodes and marked the persistent sidebar after its first binding so its handlers are not added again.
- Added centralized `navigate()` lifecycle cleanup for search, voice, mailbox-list, message-detail, and AI operations when their owning view is left.
- Added `LatestRequestCoordinator` so a newer mailbox/detail/AI request aborts the previous request and stale completions cannot reset current loading state or overwrite newer content.
- Passed abort signals through the existing API helper for mailbox listing, message loading, summarization, extraction, and reply drafting.
- Preserved sidebar active state and unread count without rebuilding the sidebar DOM.
- Added unit coverage for superseded and view-cancelled requests.
- Archived the previous Module 3 record as `change/change-16.md`.

## Reason

Every state change previously rebuilt the complete authenticated application, regenerated all icons, and rebound every control. Pending requests and page-level timers could also finish after navigation and trigger additional renders. Repeated navigation therefore produced avoidable DOM allocation, garbage collection, and asynchronous render contention.

## Key Commands

- `git status --short --branch`
- `git ls-files -v`
- repository searches with `rg`
- `git switch main`
- `git pull --ff-only origin main`
- `git switch -c codex/frontend-navigation-performance`
- `npm run test:js`
- `npm run build`
- `git diff --check`

## Validation

- All 58 JavaScript tests passed, including the new stale-request and view-cancellation coverage.
- The Vite production build passed.
- `git diff --check` passed; Git reported only the repository's existing LF-to-CRLF working-copy warnings.

## Known Issues and Remaining Work

- No authenticated real-Gmail browser session was used, per the request to implement the identified fixes without reproducing the issue.
- The workspace content is still rendered from template strings when the active page changes; this fix removes full application/sidebar rebuilding but does not introduce keyed DOM reconciliation or list virtualization.
