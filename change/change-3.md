# Add project requirements backlog

Date: 2026-07-31

## Changes

- Added `todo.md` as the authoritative project requirements and implementation backlog.
- Rewrote the complete requirements backlog in English while preserving its structure, priorities, checklist state, scope, and acceptance criteria.
- Separated completed frontend prototype work from unfinished production integrations.
- Defined MVP functional requirements, non-functional requirements, priorities, acceptance criteria, technical work, out-of-scope items, and the MVP definition of done.
- Archived the previous GitHub publication record as `change/change-2.md`.

## Reason

The repository previously described only the interactive frontend demo. It did not provide an implementation-ready requirements list or make the difference between simulated UI flows and production functionality explicit.

## Key commands

```powershell
git status --short --branch
git ls-files -v | Select-String '^S'
rg --files -g '!node_modules' -g '!dist'
rg -n -i "OAuth|summary|draft|voice|task|calendar|privacy|accessibility|security" src README.md change change.md
Move-Item -LiteralPath change.md -Destination change\change-2.md
git diff --check
rg -n "^## |^- \[[ x]\]" todo.md
rg -n -P "\p{Han}" todo.md
```

## Validation

- Confirmed the repository was clean before editing and had no skip-worktree files.
- Confirmed `todo.md` contains the required sections and actionable checklist items.
- Confirmed `todo.md` contains no Chinese characters after the English rewrite.
- Confirmed the Markdown changes contain no whitespace errors.
- No application source or runtime configuration was changed.
