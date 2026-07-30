# Add repository instructions for AI coding agents

Date: 2026-07-31

## Scope

Added repository-wide instructions for AI coding agents collaborating with multiple RevoMail contributors.

## Changes

- Added root `AGENTS.md`, which applies to the entire repository.
- Defined project context, sources of truth, task-start checks, collaboration boundaries, Git safety, private configuration handling, Node.js/PM2 commands, implementation standards, validation requirements, network-failure handling, and the definition of done.
- Added the complete `change.md` continuation and archival rules requested for team collaboration.
- Archived the previous requirements-document task as `change/change-3.md`.

## Reason

Multiple contributors and their coding agents need one consistent repository contract. The rules prevent agents from overwriting each other's work, treating prototype behavior as production functionality, leaking private configuration, or claiming unverified results.

## Key Commands

```powershell
git status --short --branch
git ls-files -v | Select-String '^S'
rg --files -g 'AGENTS.md' -g 'change*.md' -g 'todo.md' -g 'README.md'
Move-Item -LiteralPath 'change.md' -Destination 'change\change-3.md'
rg -n "^#|^##|^###" AGENTS.md
rg -n "[ \t]+$" AGENTS.md change.md
git diff --check
```

## Validation

- Confirmed that `AGENTS.md` is at the repository root and therefore applies repository-wide.
- Confirmed that the rules include the required `change.md` continuation, numbering, archival, content, and verification requirements.
- Confirmed that documented npm and PM2 commands match `package.json`.
- Confirmed that `.env` and generated output remain ignored and that no secret values were added.
- Confirmed that Markdown files have no trailing whitespace or Git whitespace errors.

## Remaining Work

- No application code was changed, so runtime and browser tests were not required.
- The documentation changes have not been committed or pushed.
