# Module 7: voice, preferences, and accessibility

Date: 2026-10-05

## Scope and reason

Implement Issues #7, #27, #31, #37, #33, and #34 on baseline afdf154. Replace simulated voice and settings with reviewed commands, permission-aware cloud transcription, persistent preferences, and accessible interactions.

## Changes

- Archived the baseline record as change/change-22.md.
- Continued Module 7 with the requested integration of main at 02f7030. Preserved the original HEAD in codex/backup-module7-before-main-20261005 and all tracked/untracked source changes in stash (module7-before-main-20261005).
- Merged with --no-commit --no-ff and reapplied the stash. Conflicts were resolved by preserving the Module 3/7 architecture and adapting main's functionality. No commit, push or provider verification is implied.
- Preserved incoming archive collisions 19–22 as 25–28 and incoming main's active record as 29. Existing archives, including Module 7's archive 22, remain intact.
- Integrated Calendar extraction/confirmation, CSRF and separate calendar idempotency; retained cached inbox and canonical confirmed-send API. Added a separate SENT list and custom AI draft instructions with request-scoped preferences.
- Kept Calendar, Gmail and OAuth discovery resources in desktop packages; added least-privilege Calendar event authorization.
- Added live reply metadata for reviewed Reply-To/SENT recipients without turning normal cached reads into provider calls. Preserved the exact reviewed send recipients and existing send response/status contract; carried forward References threading.
- Calendar dialogs use the existing focus trap and stable overlay, preserve edits across background refresh, require explicit confirmation, and retain keys across retries/reopening. Added English/Chinese copy, light/dark contrast corrections and 320px layout checks.
- Updated README, todo, environment examples, API docs and shared Calendar schema. Imported main tests were adapted to the retained canonical sending API rather than enabling a competing send route.

## Commands and validation

- Reviewed clean Git status and skip-worktree entries (none).
- Switched to module-7-voice-settings-accessibility tracking the requested remote baseline.
- Ran git fetch origin main, git branch backup, git stash push --include-untracked, git merge --no-commit --no-ff origin/main, and git stash apply. Backups are retained.
- npm ci passed and installed the merged pinned tzdata requirement. npm reported 14 dependency audit findings (6 moderate, 8 high); no unrelated dependency upgrade was attempted.
- npm test: 112 JavaScript tests passed; Python initially exposed three integration failures (Calendar key bounds, reply token budget, and fixture Base64 padding), which were corrected. Latest npm run test:python: 140 passed, including Calendar CSRF, confirmation, DST, rate limits, unknown outcomes, and per-user/operation idempotency isolation.
- npm run build passed. npm run desktop:pack passed on Windows, including the final artifact refresh after the Sent-star fix (exit 0).
- BROWSER_CHANNEL=msedge npm run test:browser: all 7 passed (desktop/320px, settings, voice review, synthetic native media capture, compose, Sent, Calendar and axe). Initial Calendar contrast failures were fixed. Additional Calendar-only light/dark and keyboard-trap checks: 2 passed.
- npm run desktop:smoke passed against the packaged service: database health OK, session endpoint OK, Google OAuth start returned 307 to accounts.google.com. This does not verify OAuth completion.
- Inspected the packaged Calendar/Gmail/OAuth discovery documents and Australia/Sydney tzdata resource: present.
- Final git diff --check and git diff --cached --check passed. All merge conflicts are resolved and changes are staged for review. The staged file list contains no real .env, database, log, dependency directory or packaged artifact.
- Real packaged Electron with an isolated build-directory profile: launcher start/open/stop and signed-out mailbox rendering passed; both windows have contextIsolation=true, sandbox=true and nodeIntegration=false. The first automation attempt timed out locating a window; a follow-up inspection of all windows verified the expected launcher and mailbox state. Native microphone prompts were not exercised.

## Remaining verification

- Real Google OAuth completion, Gmail sending, Calendar writes and cloud transcription remain unverified without dedicated provider-test credentials. Automated coverage uses sanitized fixtures and synthetic audio.
- Physical microphone permission prompts, manual Windows screen-reader review and native macOS/Linux verification remain pending. Automated axe checks are not a claim of full WCAG conformance.
- Backup reference and original stash are retained. No issue closure or real-provider completion is implied.

## Publication follow-up

- The user explicitly requested committing and pushing the reviewed result to the current module-7-voice-settings-accessibility branch.
- Rechecked staged changes, working-tree differences, conflict entries and skip-worktree entries before publication. No unstaged changes or unresolved conflicts were present; git diff --cached --check passed.
- The merge will be committed and pushed normally to origin/module-7-voice-settings-accessibility, without force-pushing. Push completion is verified separately against the remote branch after the command succeeds.
