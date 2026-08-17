# Auto-generate and persist server keys on first startup

Date: 2026-08-17

## Task Scope

Remove the requirement to configure `SECRET_KEY` and `TOKEN_ENCRYPTION_KEY` manually. On first backend startup, RevoMail generates both keys and stores them in the ignored `data/revomail-server.key` so sessions and encrypted credentials stay stable across restarts without environment configuration.

## Changes

- Added `resolve_runtime_keys()` in `backend/app/config.py` that loads `data/revomail-server.key` (default `runtime_key_file`) or generates missing keys: `SECRET_KEY` is a 48-byte URL-safe random token and `TOKEN_ENCRYPTION_KEY` is a 32-byte base64 Fernet key. The file is written with `0600` permissions when created.
- `Settings.validate_runtime()` now resolves keys before production checks; production validation keeps the HTTPS/public-URL check and a minimum `SECRET_KEY` length, but no longer requires explicit key configuration.
- An explicitly configured but invalid `TOKEN_ENCRYPTION_KEY` (not a valid Fernet key) is replaced with a generated valid key, which also repairs the stale 39-character key found in the local ignored `.env`.
- Added `runtime_key_file` setting (default `PROJECT_ROOT/data/revomail-server.key`) so tests and packaged runs can point at their own key file.
- Updated `.env.example`, `backend/.env.example`, `README.md`, `backend/README.md`, and `AGENTS.md` to document that the two keys are optional and auto-generated.
- Added Python tests: key generation and persistence across restarts, replacement of an invalid configured Fernet key, and production validation using an isolated key file.
- Archived the portable-executable retirement record as `change/change-12.md`.

## Reason

The contributor asked that neither `SECRET_KEY` nor `TOKEN_ENCRYPTION_KEY` require manual configuration: the backend should generate them on first startup and persist them to a file. The previous production validation rejected startups without explicit keys, and the local `.env` carried an invalid Fernet key that broke the packaged backend.

## Key Commands

- `npm run test:python`
- `npm test`
- `npm run build`
- Direct production-mode start with `.venv\Scripts\python.exe -m backend.run` on a temporary port to confirm first-startup key generation and health.

## Validation

- All 19 Python tests passed, including the new `test_runtime_keys_are_generated_and_persisted`, `test_invalid_configured_encryption_key_is_replaced`, and updated production-validation test.
- `npm test` passed the full JavaScript suite and all Python tests.
- `npm run build` produced the Vite production frontend.
- A real production-mode backend start on `127.0.0.1:4271` generated `data/revomail-server.key` with a 41-character `SECRET_KEY` and a 44-character valid Fernet `TOKEN_ENCRYPTION_KEY`, and `/api/v1/health` returned `{"status":"ok","checks":{"database":"ok"}}`.
- `git diff --check` passed.

## Known Issues and Remaining Work

- The local ignored root `.env` still contains an invalid `TOKEN_ENCRYPTION_KEY`; it is now ignored and replaced at runtime by the generated key file, but the stale line can be removed for clarity.
- macOS and Linux packaging remain unverified on this Windows host.
- Real provider credentials were not used; OAuth, Gmail, and OpenAI paths remain covered by local fakes.
