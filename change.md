# Inline the auto-install launcher into RevoMail.cmd

Date: 2026-08-17

## Task Scope

Replace the root `RevoMail.cmd` thin wrapper (which delegated to `scripts/launch-desktop.mjs`) with a self-contained one-click launcher that checks prerequisites, installs missing or stale Node dependencies, prepares the Python environment, builds the frontend, and starts Electron.

## Changes

- Rewrote `RevoMail.cmd` to be self-contained: it checks `node` and `npm`, computes the `package-lock.json` SHA-256 fingerprint (lowercase, matching the previous stamp format), compares it with `node_modules/.revomail-lock.sha256`, runs `npm ci` when missing or stale, writes the stamp, and runs `npm run desktop` (build + Electron).
- Deleted `scripts/launch-desktop.mjs` and `scripts/launch-desktop.test.js`; the logic now lives entirely in `RevoMail.cmd`.
- Removed the `npm run launch` script from `package.json` and its row from the `README.md` npm script table.
- Updated the `README.md` `RevoMail.cmd` description to reflect the new inline prerequisite checks and install flow.
- Archived the previous task record as `change/change-13.md`.

## Reason

The contributor asked for the auto-install logic to replace the root `RevoMail.cmd` wrapper. Keeping the Node launcher module would duplicate the same fingerprint/install/start behavior in two places, so the cmd script now owns the flow directly.

## Key Commands

- `git status --short --branch`
- `git rm scripts/launch-desktop.mjs scripts/launch-desktop.test.js`
- `npm test`
- `npm run build`
- `cmd /c RevoMail.cmd` (verified prerequisite checks and install/start flow)
- `git diff --check`

## Validation

- `npm test` passed all JavaScript and Python tests after removing the launcher test file (JS count drops accordingly).
- `npm run build` produced the Vite production frontend.
- `RevoMail.cmd` ran under `cmd /c`, detected the missing dependency stamp, ran `npm ci` (which invoked the Python setup post-install hook), wrote the new stamp, and proceeded to the desktop start step.
- `git diff --check` passed.

## Known Issues and Remaining Work

- The cmd launcher is Windows-only by design; macOS/Linux contributors use the npm commands directly.
- Running Electron from the sandbox could not be completed interactively; the launcher reached the desktop start step but the window could not be verified in this environment.
