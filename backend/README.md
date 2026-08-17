# Python Backend

FastAPI is RevoMail's active HTTP backend. It serves the built Vite frontend and exposes the same-origin `/api/v1` contract used by the retained Module 1 account UI. SQLite is the active persistence layer for server-side sessions, encrypted credentials, OAuth transactions, user/account records, settings, tasks, audits, jobs, and idempotency keys.

Implemented Python paths include Google OAuth, session bootstrap, connected-account actions, Gmail inbox/message reads, and OpenAI-backed summary, extraction, and reply-draft endpoints. Microsoft remains pending. Real Google authorization initiation has been verified, while callback exchange, Gmail, refresh, revocation, and OpenAI calls have not yet completed test-account verification; automated tests use local fakes.

## Layout

| Directory | Responsibility |
| --- | --- |
| `app/config.py` | Root `.env` loading and runtime configuration |
| `app/main.py` | FastAPI application, error mapping, routes, and static frontend |
| `app/persistence.py` | SQLite migrations, encrypted credentials, sessions, and repositories |
| `app/jobs.py` | Lease-based recoverable job foundation |
| `app/contracts.py` | Provider-neutral v1 request and response models |
| `app/routers/` | Authentication, accounts, Gmail, AI, and health HTTP endpoints |
| `app/services/` | Gmail parsing and OpenAI operations |
| `python_tests/` | OAuth, account-contract, Gmail, AI, and content tests |
| `requirements.txt` | Locked direct Python dependencies |
| `run.py` | Stable production entry point used by npm, PM2, and Electron |

The previous Node authentication modules under `src/` and their Vitest coverage remain temporarily for migration reference. New backend behavior belongs in FastAPI unless an ADR changes this decision.

## Setup and Commands

From the repository root:

```powershell
npm ci
npm run test:python
npm run db:migrate
npm run db:rollback
npm run build
npm run start
```

The npm post-install hook creates `.venv` and installs `backend/requirements.txt`. `npm run setup` can be run explicitly, while source start, Python test, desktop, and backend packaging commands verify the environment automatically. A system Python 3.11 or newer is still required for source development. `npm run backend:pack` produces the standalone backend used by packaged Electron builds.

FastAPI applies pending migrations before it becomes ready. `SECRET_KEY` and `TOKEN_ENCRYPTION_KEY` are optional: when left empty, RevoMail generates both on first startup and stores them in the ignored `data/revomail-server.key`, so sessions and encrypted credentials stay stable across restarts. Production mode additionally rejects an insecure public URL. Keep real Google and OpenAI credentials in the ignored root `.env`. Do not commit tokens, mailbox content, or test-account data.
