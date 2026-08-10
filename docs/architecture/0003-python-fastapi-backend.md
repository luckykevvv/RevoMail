# ADR 0003: Python and FastAPI backend

Date: 2026-08-06

## Status

Accepted. This decision supersedes the Node/Express runtime selection in ADR 0001 for new HTTP and provider work. ADR 0002 remains a record of the earlier desktop SQLite implementation while persistence is migrated deliberately.

## Decision

RevoMail uses Python and FastAPI as its active same-origin API backend. Vite remains the frontend build system, Electron remains the desktop shell, and npm remains the stable command surface for contributors. Development commands select the repository `.venv` or a platform Python command without exposing runtime selection as application configuration. Packaged desktop builds use PyInstaller to create a standalone backend executable that Electron launches directly.

The Python service owns `/api/v1`, serves the production frontend, and hosts Google OAuth, connected-account compatibility, Gmail, and LLM routes. Provider-specific code stays behind service modules so Gmail and OpenAI can be replaced or mocked in tests.

## Consequences

- Python dependencies are installed separately from npm dependencies.
- Electron development starts FastAPI through the shared Python resolver.
- Desktop packaging is platform-specific and builds the standalone backend on the target operating system before Electron packaging.
- Packaged applications do not fall back to an arbitrary system Python; a missing bundled backend is reported as a service startup failure.
- The previous Node authentication code remains temporarily as migration reference and test coverage, but it is no longer the production entry point.
