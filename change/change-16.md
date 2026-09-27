# Add AI priority classification (High / Medium / Low) to the inbox

Date: 2026-09-27

## Task Scope

Classify every inbox email with AI as High (needs an urgent reply or action), Medium (updates and routine communication) or Low (advertisements and other low-relevance mail), show the result as a badge on each inbox row, and let the user filter the inbox by priority. Implements the P1 item "Improve priority detection and automatic email classification" in `todo.md`.

## Changes

- `backend/app/services/ai.py`: added `classify(items)` and `CLASSIFY_SYSTEM`. One model call labels a batch of up to 25 messages (sender, subject, preview only) and returns `{"classifications": {id: {priority, reason}}, "warning": ...}`. Ids the model invents or omits, and priorities outside high/medium/low, are dropped; reasons are stripped of markup and capped at 140 characters. The prompt tells the model to treat email text as untrusted data. `_chat` gained optional `temperature` (default unchanged at 0.4) and `json_mode` arguments; classification uses temperature 0 and JSON mode, retrying without JSON mode if the model rejects it.
- Fix (reported: every email showed "could not be classified"): the first version discarded the whole batch whenever the model reply did not match one exact shape, and gave no reason. It now (1) sends the model short numeric ids ("1", "2", ...) and maps them back to Gmail ids, so ids can no longer be mangled or reformatted when echoed; (2) requests strict JSON mode; (3) extracts JSON from a reply wrapped in prose or code fences; (4) accepts a bare list, an object keyed by id, alternative wrapper keys, numeric ids, missing ids (matched by position) and labels such as "High priority"; (5) returns `warning` = `unreadable_reply` or `no_valid_labels` when nothing usable came back, which the inbox heading now shows, and logs counts (never email or reply content) under `revomail.ai`; (6) raised the token budget to 150 + 120 per email.
- `backend/app/routers/ai.py`: added `POST /api/v1/ai/classify` (returns the `classify()` result unchanged) with `ClassifyItem` / `ClassifyRequest` validation (1-25 messages, bounded field lengths). It requires a session with a connected mailbox and uses the existing safe `AI_PROVIDER_FAILED` error.
- `src/mailbox-state.js`: added `applyClassifications()` and `PRIORITY_LEVELS`.
- `src/main.js`: after each inbox page renders, the new messages are sent to `/api/v1/ai/classify` without blocking the list. Each row shows a priority badge (text label plus colour, reason in the tooltip). A "Filter by AI priority" chip row (All, High, Medium, Low, with counts) filters the list. While classifying, the list heading shows "Classifying priority…"; on failure it shows "Priority labels unavailable" or "N emails could not be classified" and rows stay unlabelled.
- `src/style.css`: added the `--red` token and styles for the badges and chips, including a narrow-screen rule.
- Tests: `backend/python_tests/test_classification.py` (new, 14 cases including the reply-shape variants, short-id mapping, JSON-mode fallback and warning reporting), 3 route tests appended to `backend/python_tests/test_api.py`, and 3 tests appended to `src/mailbox-state.test.js`.
- Docs: `docs/api/v1-contracts.md` (new "Priority classification" section), `README.md` (prototype feature list), `todo.md` (status note on the P1 item).
- Archived the previous task record as `change/change-15.md`.

## Reason

The contributor asked for an email classification system with three priority levels and chose AI classification for every email, shown as row badges and filter tabs. Batching one call per inbox page (rather than one call per email) keeps latency and cost bounded while still classifying every email. Classification is deferred until after the list renders so mailbox reading never depends on the AI provider, per NFR-04.

## Key Commands

- `python3 -m venv` plus `pip install` of the pinned `backend/requirements.txt` packages (minus PyInstaller) in a throwaway directory outside the repository, then `python -m pytest`.
- `node --test` against a minimal stand-in for the `vitest` API to run `src/mailbox-state.test.js`.
- `node --check` on a copy of `src/main.js`.

## Validation

- Python: all 37 tests passed in the throwaway Linux environment (Python 3.10; the project targets 3.11+): the 20 existing tests plus 17 new ones. The OpenAI call is faked in every test.
- JavaScript: the 6 tests in `src/mailbox-state.test.js` passed under the vitest stand-in, not under real vitest.
- `src/main.js` passed a Node syntax check.

## Known Issues and Remaining Work

- The exact cause of the reported "could not be classified" failure is not confirmed. The sandbox cannot reach OpenAI (the egress proxy returns 403), so the real model reply could not be reproduced. The fix removes the likely causes described above and makes any remaining failure self-describing. If the message persists, the heading now says which case it is, and the backend log line from `revomail.ai` gives the counts.

- Not run: `npm test`, `npm run build`, and the Windows `.venv`, because the installed `node_modules` and `.venv` are Windows builds. Run `npm test` and `npm run build` on Windows before merging.
- Not verified: the badges, filter chips and narrow-screen layout in a real browser or Electron window (AGENTS.md requires desktop and mobile checks and a console inspection), and real OpenAI classification quality (no test uses a real key).
- Classification runs from sender, subject and preview only, so an email whose urgency appears only deep in the body can be under-rated. Results are not cached between sessions, so each inbox load re-classifies (and re-bills) its messages; a persisted cache and a way for the user to correct a label are follow-ups.
- Message previews are sent to the configured OpenAI account. This is the same data class as the existing summarise, extract and draft-reply features, but it now happens automatically on inbox load rather than on a button click. If that is not acceptable, add a settings toggle.
- `git status` shows every tracked file as modified before this task because of CRLF line endings; edits here preserved CRLF.
