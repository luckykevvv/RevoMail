# Voice calendar review actions and privacy assessment

Date: 2026-10-10

## Task scope

Add an in-context calendar action panel beneath a voice extraction result without changing the existing two-column voice-dialog framework. Review whether Google Calendar events can later be displayed without permanent local storage, but do not change privacy, OAuth, Calendar-read, persistence, or retention code in this task.

## Changes

- Added a `Calendar actions` panel immediately after the voice playback status for extracted calendar events, while retaining the established two-column dialog and its existing responsive single-column fallback.
- Each event shows its title, date/time and location, then offers `Review and add`. The action reuses the existing editable Google Calendar confirmation dialog; opening the review performs no provider write, and the final confirmation/idempotency boundary remains unchanged.
- Added English/Chinese interface copy, responsive event-action styling, stronger accessible secondary text contrast, and browser coverage at desktop and 320px widths.
- Reviewed Calendar-read feasibility and current storage behavior without changing privacy, OAuth, Calendar-read, persistence, retention, or provider code.

## Reason

Voice extraction can describe calendar events but previously offered no visible path from the spoken result to the existing mandatory Google Calendar review flow.

## Commands and validation

- Reviewed repository status, skip-worktree entries, task documentation, voice extraction rendering, Calendar creation confirmation, OAuth scopes, encrypted mailbox persistence, and official Google/OAIC privacy guidance before editing.
- Archived the previous inbox-refresh task record as `change/change-33.md`.
- `npm run build` passed after the sandboxed attempt encountered Windows `EPERM` while resolving `src/main.js`; the permitted host run built 1,563 modules successfully.
- Full JavaScript suite: all 130 tests passed. The sandboxed run first encountered the same Windows `realpath` restriction, so the suite was rerun in the permitted host environment.
- The normal Python phase could not access the host's shared `pytest-of-lizho` directory. Rerunning the complete suite with repository-local `--basetemp build/pytest-voice-calendar-20261010-1800` passed all 163 tests; two existing non-failing `.pytest_cache` permission warnings remain.
- Focused Microsoft Edge Playwright passed at 1280px and 320px. It verified that the action panel follows the playback status, has no horizontal page overflow, passes the scoped WCAG 2.1 AA axe scan, opens the editable event review, and makes zero Calendar write calls before final confirmation. Both screenshots were visually inspected.
- The first focused axe run identified low contrast in the explanatory copy; its colour was strengthened and both responsive scenarios then passed.
- Reviewed the complete pending diff and repository status, reran the final build and whitespace checks, then committed and pushed the current feature-branch progress at the user's request before comparing it with the latest remote `main`.

## Known issues and remaining work

- Google Calendar event reading and synchronization were assessed only. No Calendar-read endpoint, event cache, OAuth scope change, retention rule, or privacy implementation was added.
- The current application already requests `calendar.events`, which technically permits event reads as well as writes, but the backend exposes creation only. A future live Calendar view would still require an explicit disclosure/consent review and a defined memory/cache lifecycle even if no event is written to SQLite.
- Current Gmail synchronization stores encrypted email bodies in SQLite until provider deletion, cache clearing, or connected-account deletion; there is no automatic retention TTL. It should not be described as non-persistent merely because the values are encrypted.
- The requested save-point commit was pushed only to `module-7-voice-settings-accessibility`; no merge into `main` was performed.
