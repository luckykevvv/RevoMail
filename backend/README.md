# Python Backend

FastAPI is RevoMail's active HTTP backend. It serves the built Vite frontend and exposes the same-origin `/api/v1` contract used by the retained Module 1 account UI.

Implemented Python paths include Google OAuth, session bootstrap, connected-account actions, Gmail inbox/message reads, and OpenAI-backed summary, extraction, and reply-draft endpoints. Microsoft remains pending. Real Google authorization initiation has been verified, while callback exchange, Gmail, refresh, revocation, and OpenAI calls have not yet completed test-account verification; automated tests use local fakes.

## Layout

| Directory | Responsibility |
| --- | --- |
| `app/config.py` | Root `.env` loading and runtime configuration |
| `app/main.py` | FastAPI application, error mapping, routes, and static frontend |
| `app/routers/` | Authentication, accounts, Gmail, AI, and health HTTP endpoints |
| `app/services/` | Gmail parsing and OpenAI operations |
| `python_tests/` | OAuth, account-contract, Gmail, AI, and content tests |
| `requirements.txt` | Locked direct Python dependencies |
| `run.py` | Stable production entry point used by npm, PM2, and Electron |

The previous Node authentication modules under `src/` and their Vitest coverage remain temporarily for migration reference. New backend behavior belongs in FastAPI unless an ADR changes this decision.

## Setup and Commands

From the repository root:

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm run test:python
npm run build
npm run start
```

On macOS or Linux, install with `.venv/bin/python -m pip install -r backend/requirements.txt`. Development commands select the repository `.venv` and then the platform Python command. `npm run backend:pack` produces the standalone backend used by packaged Electron builds.

Keep real Google and OpenAI credentials in the ignored root `.env`. Do not commit tokens, mailbox content, or test-account data.
