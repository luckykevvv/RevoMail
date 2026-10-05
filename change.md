# Separate extracted items and repair formatted email layout

Date: 2026-10-05

## Task scope

Make Tasks and Calendar show their own extracted item types with removable suggestions, correct formatted-email rendering that exposes preheader/brand text or stacks text vertically in narrow table cells, restore safe external-link navigation, and keep extracted details readable in the narrow AI rail.

## Changes

- Tasks now displays only extracted tasks, while Calendar displays only extracted events.
- Added accessible Remove actions for task and event suggestions. Removal updates the current extraction only and does not alter the source email or silently delete a confirmed Google Calendar event.
- Replaced the formatted-email frame's aggressive `overflow-wrap:anywhere` rule with normal table-cell word breaking so narrow marketing-email cells do not stack text one character per line.
- Preserved safe HTML class and hidden metadata, hid common preheader/preview containers, and visually suppressed broken-image alternative text while retaining it for assistive technology.
- Made the broken-image text suppression override marketing-email inline font styles, preserved safe element IDs, and added ID-based preheader/preview detection.
- Advanced the sanitized-HTML cache marker to v4 so HTML cached under previous destructive rules is refreshed once from Gmail on first open.
- Formatted-email links are rewritten to external noopener links. The sandbox permits only external popup navigation, while the Electron main process opens only HTTP, HTTPS, and mail links through the system handler.
- Key details now gives extracted text the full AI-rail width and places its actions below the copy instead of squeezing the copy into a narrow column.
- Event titles and their date/time/location metadata now use separate lines in Key details regardless of title length, so short Monday titles align with longer Wednesday titles.
- Added unit and real-browser regression coverage for separated/removable extraction results, hidden preheaders, long-word layout, broken-image labels, CSP retention, and sanitizer metadata.

## Reason

Tasks and Calendar reused the same mixed renderer, while sanitized marketing and social-email HTML lost common hiding metadata and inherited an overly aggressive word-wrapping rule. Links navigated inside the restricted message frame and displayed a blank page, inline image styles could expose brand alternative text, and the shared extraction row layout squeezed copy inside the narrow reading sidebar.

## Commands and validation

- Reviewed the current branch, existing active-task changes, repository files, and skip-worktree entries (none) before editing.
- Archived the previous Module 7 record as `change/change-30.md`.
- Targeted Vitest: 24 tests passed.
- Targeted Pytest: 29 tests passed.
- Full `npm test`: 116 JavaScript and 140 Python tests passed.
- `npm run build` passed.
- Targeted Microsoft Edge Playwright coverage for safe external email links, hidden preheaders and inline-styled broken-image labels, formatted-email layout, and readable Key details layout: 2 tests passed.
- Follow-up Microsoft Edge regression for the forced title/metadata line break in Key details: 1 test passed.
- A full 9-test Playwright run started and its first two Calendar tests passed, but the detached runner did not terminate within the available tool session; its exact test processes were stopped. The two newly affected scenarios were verified separately as above.
- Updated open GitHub issue #68 with the confirmed real-message recurrence and created open issues #69 and #70 for external email links and the Key details layout. All retain an explicit reporter-confirmation closure gate.

## Known issues and remaining work

- The reporter reopened real messages and confirmed that the extra first-line content is still visible. The vertically stacked text is also still present and is likely the same leaked first-line content rather than legitimate message-body copy. Issues #67 and #68 must remain open; the current sanitiser and frame-style changes are incomplete for these real messages.
- Automated LinkedIn, Fender, and Facebook-style fixtures pass without using personal mailbox content, but they do not reproduce the remaining real-message failure closely enough to prove a fix.
- A real packaged Electron click through to the operating-system browser was not exercised; the browser popup path and the Electron external-protocol allowlist are covered separately.
- Removing an already confirmed event suggestion does not delete the corresponding event from Google Calendar; destructive provider-side deletion remains outside this UI fix.

## Publication request

- The user explicitly requested committing and pushing the current reviewed work to `origin/module-7-voice-settings-accessibility` without changing other branches.
- The user also requested English issue comments recording that #67 and #68 remain unresolved. Neither issue may be closed without the reporter's later confirmation.
- Committed the reviewed implementation as `ed429f3` (`fix: refine extraction and email rendering`) and pushed it normally to `origin/module-7-voice-settings-accessibility`; no force push or other branch update was used.
- Posted English follow-up comments on open issues #67 and #68 stating that the real-message extra first line and related vertical text remain unresolved after the reporter's retest.
