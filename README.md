# RevoMail

RevoMail is an AI-assisted email client prototype for email summarization, reply drafting, voice commands, and task/calendar extraction.

> **Current status:** the repository contains a working interactive frontend prototype. OAuth, mailbox access, LLM calls, Speech-to-Text, calendar writes, backend persistence, and monitoring are not yet connected to production services.

## Current Prototype

The frontend currently demonstrates:

- OAuth-style demo login.
- Searchable and filterable inbox.
- Email reading with an AI summary and extracted information.
- Editable and regeneratable AI reply drafts.
- Voice-command simulation.
- Task and calendar extraction.
- Light, dark, desktop, and mobile layouts.

The prototype uses static demo data. Selecting an OAuth provider does not connect a real account, and no email or calendar action leaves the browser.

## Quick Start

Prerequisites:

- A current Node.js LTS release.
- npm.

Install the locked dependencies and start the development server:

```powershell
npm ci
npm run dev
```

The terminal prints the local development URL.

## Production Preview

Create a local environment file, build the frontend, and run the production server:

```powershell
Copy-Item .env.example .env
npm run build
npm run start
```

The current `server.js` serves only the built frontend from `dist/`. It is not the future application API.

Supported runtime variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Address used by the production preview server |
| `PORT` | `4173` | Port used by the production preview server |

The current server loads `.env` with `override: true`, so values in `.env` override inherited process variables. Real `.env` files are ignored and must never be committed.

## npm Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Build the frontend into `dist/` |
| `npm run start` | Serve the production build with Node.js |
| `npm run pm2:start` | Build and start the production preview with PM2 |
| `npm run pm2:logs` | View RevoMail PM2 logs |
| `npm run pm2:restart` | Rebuild and restart the PM2 process |
| `npm run pm2:stop` | Stop the PM2 process |
| `npm run pm2:delete` | Remove the PM2 process |

## Repository Structure

```text
RevoMail/
|-- AGENTS.md                  # Repository rules for human and AI contributors
|-- README.md                  # Setup, status, and structure
|-- todo.md                    # Requirements, priorities, and acceptance criteria
|-- change.md                  # Active task change record
|-- change/                    # Numbered historical change records
|-- index.html                 # Vite HTML entry point
|-- src/                       # Current frontend source
|   |-- main.js                # Demo state, views, and interactions
|   `-- style.css              # RevoMail design and responsive styles
|-- public/                    # Static frontend assets
|-- server.js                  # Current production-preview static server
|-- backend/                   # Reserved backend application boundary
|   |-- README.md              # Backend layering and implementation rules
|   |-- src/
|   |   |-- config/            # Environment loading and configuration validation
|   |   |-- routes/            # HTTP route declarations
|   |   |-- controllers/       # Transport validation and response mapping
|   |   |-- middleware/        # Authentication, errors, rate limits, and tracing
|   |   |-- services/          # Provider-neutral application use cases
|   |   |-- domain/            # Business entities, values, and rules
|   |   |-- providers/
|   |   |   |-- email/         # Gmail and Microsoft Graph adapters
|   |   |   |-- ai/            # LLM adapters
|   |   |   |-- calendar/      # Calendar adapters
|   |   |   `-- speech/        # Speech-to-Text adapters
|   |   |-- repositories/      # Persistence interfaces and implementations
|   |   |-- jobs/              # Retryable and asynchronous work
|   |   `-- utils/             # Small backend-only utilities
|   `-- tests/
|       |-- unit/              # Isolated business and utility tests
|       |-- integration/       # API, provider, and persistence tests
|       `-- fixtures/          # Sanitized test data
|-- shared/
|   |-- contracts/             # Frontend/backend request and response contracts
|   `-- schemas/               # Runtime-neutral validation schemas
|-- docs/
|   |-- architecture/          # Architecture decisions and diagrams
|   `-- api/                   # API specifications and examples
|-- scripts/                   # Reusable development and deployment helpers
|-- package.json               # Current frontend and preview-server commands
|-- package-lock.json          # Locked npm dependency graph
|-- ecosystem.config.cjs       # PM2 process definition
`-- .env.example               # Safe runtime configuration example
```

## Architecture Boundaries

The new directories are placeholders for team development; they do not contain a backend implementation yet.

When backend work begins:

1. Routes and controllers handle HTTP concerns only.
2. Services implement application use cases and the human-confirmation workflow.
3. Domain code contains provider-independent business rules.
4. Providers isolate Gmail, Microsoft Graph, LLM, calendar, and speech SDKs.
5. Repositories isolate persistence.
6. Shared contracts define the frontend/backend boundary without importing provider SDKs.

The backend technology stack must be agreed by the team before adding runtime scaffolding. Record the decision under `docs/architecture/` and update `todo.md`, npm scripts, `.env.example`, and this README together.

## Collaboration

Before coding:

1. Read [AGENTS.md](AGENTS.md).
2. Select a requirement from [todo.md](todo.md).
3. Inspect the current `change.md` and preserve other contributors' uncommitted work.
4. Update `change.md` for every repository modification.
5. Run validation proportional to the change and report anything not verified.

Do not mark mocked UI behavior as a completed production integration. The full requirements, priorities, out-of-scope items, and MVP definition of done are maintained in [todo.md](todo.md).
