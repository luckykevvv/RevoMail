# Add a "tell Revo AI what to write" prompt to replying and composing

Date: 2026-10-04

## Task Scope

Joel asked for a prompt area where the user types how they want to reply (or what to write), the AI regenerates the draft from it, and the tone is chosen there. It applies to both replying and composing.

## Changes

- `backend/app/services/ai.py`: `draft_reply` takes optional `instructions`, `current_draft` and `user_name`; new `compose()` writes a new email (subject + body) from instructions. The original email is fenced as untrusted content in the prompt. Instructions and drafts are length-limited. The sign-off now uses the signed-in user's display name; the old prompt told the model to end with a literal `[Your name]` placeholder, which would now have been sent to real recipients.
- `backend/app/routers/ai.py`: `/ai/draft-reply` accepts `instructions` and `current_draft` (both optional, so existing callers still work); new `POST /ai/compose` (authenticated session, 1-1000 character instructions). Provider errors keep the stable `AI_PROVIDER_FAILED` contract.
- `src/main.js`, `src/style.css`: one shared prompt panel (instructions box, Professional/Concise/Friendly tone, Generate / Update / Regenerate button, Ctrl/Cmd+Enter) on both the reply and compose screens. With instructions and an existing draft the draft is revised; the header Regenerate button and an empty instructions box write a fresh draft. Compose fills the subject only when it is empty. The compose body and the button are disabled while the AI is writing, and a reply result is ignored if another email was opened meanwhile. Behaviour changes: tone chips now only select the tone (they used to regenerate the reply immediately and could discard edits), and the compose "Write with AI" button, which inserted fixed demo text, was removed.
- Tests: `backend/python_tests/test_ai_drafting.py` (new). Docs: `docs/api/v1-contracts.md`.

## Key Commands

- `python -m pytest` in the throwaway Linux copy of the repository; headless Chromium against Vite with a mocked API for the UI flow.

## Validation

- 85 backend tests passed (Python 3.10 in the throwaway environment; project targets 3.11+), including prompt construction (instructions, current draft, tone fallback, name sign-off, truncation), subject parsing, route validation and error hiding.
- Headless-browser run against a mock API passed: tone selection does not call the AI; instructions, tone and the user's edited draft are sent; header Regenerate sends no current draft; compose generates, fills an empty subject, keeps the user's subject, and revises its own output; empty instructions are refused; AI actions never send mail and the result still goes through the send confirmation dialog.

## Known Issues and Remaining Work

- Not run against the real OpenAI API (no network from the build environment), so draft quality and the `Subject:` first-line format the compose prompt relies on are unverified.
- Not run: `npm test`, `npm run build`. Rebuild (`npm run build`) and restart the backend to pick up the changes.
- The instructions box is kept per screen only for the current session; it is cleared after a send.
