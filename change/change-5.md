# Reserve backend and project-support directories

Date: 2026-07-31

## Scope

Prepared a provider-neutral directory structure for future backend and shared work, and documented the complete repository layout for contributors.

## Changes

- Added a structure-only `backend/` workspace with boundaries for configuration, HTTP transport, middleware, services, domain rules, external providers, persistence, jobs, utilities, and tests.
- Added `shared/`, `docs/`, and `scripts/` workspaces with ownership rules.
- Rewrote the root README to explain project status, current commands, environment behavior, repository structure, architecture boundaries, and contributor workflow.
- Updated `todo.md` to record that the placeholder structure exists without marking backend implementation requirements complete.
- Extended `.gitignore` to cover local `.env.*` variants while retaining sanitized `.env.example` files.
- Archived the AI-agent instruction task as `change/change-4.md`.
- Included the previously uncommitted English requirements backlog, contributor-agent instructions, and their numbered change records in the same requested local commit.

## Reason

The team needs stable locations for upcoming backend, API-contract, architecture, testing, and automation work. The structure must support collaboration without prematurely choosing a backend framework or implying that unimplemented integrations already exist.

## Key Commands

```powershell
git status --short --branch
git ls-files -v | Select-String '^S'
rg --files -g '!node_modules' -g '!dist'
Move-Item -LiteralPath 'change.md' -Destination 'change\change-4.md'
npm ci
npm run build
rg -n "[ \t]+$" README.md backend shared docs scripts change.md
git check-ignore -v .env .env.local .env.production
git diff --check
git add --all
git diff --cached --check
git commit -m "chore: add project structure and contributor docs"
```

## Validation

- Confirmed that the existing frontend still installs and builds successfully.
- Confirmed that all directories shown in the README exist in the repository.
- Confirmed that documented npm and PM2 commands match `package.json`.
- Confirmed that `.env`, `.env.local`, and `.env.production` are ignored while `.env.example` remains eligible for tracking.
- Confirmed that Markdown changes contain no trailing whitespace or Git whitespace errors.

## Remaining Work

- The backend directories are placeholders only; no backend framework, API, database, queue, provider SDK, or runtime has been selected.
- Backend technology selection remains an open P0 requirement in `todo.md`.
- The changes are committed locally and have not been pushed.
