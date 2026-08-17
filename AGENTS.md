# RevoMail Agent Instructions

These instructions apply to the entire repository. They are intended for AI coding agents working with multiple human contributors.

## 1. Project Context

RevoMail is an AI-assisted email client with summarization, reply drafting, voice commands, and task/calendar extraction.

The current repository contains a verified interactive frontend, an active Python/FastAPI backend with provider-ready Google OAuth, Gmail and OpenAI API paths, the retained connected-account UI, and an Electron desktop launcher with a standalone Windows backend package. Provider calls are covered by local fakes but have not been verified with real credentials. Microsoft, speech recognition, sending, calendar writes, native macOS/Linux packaging verification, and production monitoring remain pending.

Do not describe a mocked interaction as a real integration. Verify the actual code path and runtime behavior before reporting that a requirement is complete.

## 2. Sources of Truth

Use these files in this order:

1. `AGENTS.md` for repository working rules.
2. `todo.md` for product requirements, priorities, acceptance criteria, and scope.
3. `README.md` for supported setup and run commands.
4. `package.json` and `ecosystem.config.cjs` for executable project operations.
5. The current `change.md` for the active task record.
6. Existing source code and tests for actual implemented behavior.

If documentation conflicts with the running code, inspect and test the code, then update the incorrect documentation within the task scope.

## 3. Start-of-Task Checklist

Before editing:

```powershell
git status --short --branch
git ls-files -v | Select-String '^S'
rg --files -g '!node_modules' -g '!dist'
```

Then:

- Read `AGENTS.md`, the relevant sections of `todo.md`, `README.md`, and the current `change.md`.
- Inspect the exact implementation path related to the request.
- Identify existing uncommitted changes and preserve work owned by other contributors.
- Confirm whether the requested work is a continuation of the current `change.md` task or a different task.
- Avoid asking for information that can be discovered safely from the repository or runtime.

Before `pull`, `rebase`, `checkout`, `merge`, or a broad refactor:

- Confirm the working tree state.
- List every skip-worktree file.
- Check whether incoming changes overlap local work or private overrides.
- Stop rather than overwrite unresolved contributor changes.

## 4. Scope and Collaboration Rules

- Make the smallest coherent change that fully satisfies the request.
- Do not mix unrelated cleanup, dependency upgrades, formatting, or architecture changes into the task.
- Preserve uncommitted changes unless the contributor explicitly asks to replace them.
- Never use `git reset --hard`, destructive checkout, or equivalent recovery commands without explicit authorization.
- Avoid broad file rewrites when a focused patch is sufficient.
- Keep shared interfaces backward-compatible unless the requirement explicitly needs a breaking change.
- When changing an API, data model, environment variable, or shared UI contract, update all affected callers, examples, and documentation in the same task.
- Record unresolved bugs, assumptions, and follow-up work instead of silently omitting them.
- Use English for repository documentation, code comments, user-facing product copy, and commit messages unless the task explicitly requests another language.

## 5. Required `change.md` Rules

Every modification to this repository must be documented in the root `change.md`.

### Continue the same task

If the new request is a direct continuation or correction of the task already described in `change.md`:

- Update the existing `change.md`.
- Keep its record accurate as the task evolves.
- Do not create another archive entry.

### Start a different task

If the new request is materially different from the current `change.md` task:

1. Ensure the `change/` directory exists.
2. Find the highest existing `change-<number>.md`.
3. Move the current root `change.md` to `change/change-<next number>.md`.
4. Never overwrite, renumber, or edit an older archive merely to reuse a number.
5. Create a new root `change.md` for the new task.

Example:

```powershell
Move-Item -LiteralPath 'change.md' -Destination 'change\change-4.md'
```

### Required contents

The active `change.md` must include:

- Date.
- Task scope.
- Files or behavior changed.
- Reason for the change.
- Key commands actually used.
- Validation actually performed and its result.
- Known issues, unrun checks, blockers, or remaining work.

Rules:

- Do not claim a test, build, deployment, push, or runtime check that was not performed.
- Documentation-only changes still require a `change.md` entry.
- Read-only investigation does not require a new record unless it changes repository files.
- Keep credentials, tokens, personal data, private hosts, and production secrets out of every change record.

## 6. Git and Private Configuration

- `.gitignore` protects only untracked files. It does not stop Git from tracking a file that is already in the index.
- Keep real `.env` files, tokens, credentials, logs, generated output, dependencies, and personal data untracked.
- Commit sanitized examples such as `.env.example`; never put real secrets or production credentials in examples.
- Before changing ignore behavior, inspect both tracking and ignore state:

```powershell
git ls-files --error-unmatch -- path/to/file
git check-ignore -v -- path/to/file
```

- Use `skip-worktree` only for a tracked default file that requires a long-lived local override.
- Verify a skip-worktree entry with `git ls-files -v -- path/to/file`; the line must begin with `S`.
- Never use `assume-unchanged` for private or machine-specific configuration.
- Never rely on skip-worktree as secret protection.
- Do not commit or push unless the user explicitly requests it.
- Do not force-push, rewrite shared history, or delete remote branches without explicit authorization.
- Before committing, review `git diff`, `git diff --cached`, and `git status`.
- Use focused commit messages such as `feat:`, `fix:`, `docs:`, `test:`, or `chore:`.
- Before every push, run `npm run verify:push`. A push is not verified until the root `RevoMail.exe` portable build has been refreshed and the packaged service smoke test has passed.

## 7. Python, Node.js, Environment, and PM2 Contract

Use the repository npm scripts instead of ad hoc commands:

```powershell
npm run dev
npm run build
npm run start
npm run pm2:start
npm run pm2:logs
npm run pm2:restart
npm run pm2:stop
npm run pm2:delete
npm run desktop
npm run desktop:dev
npm run desktop:pack
npm run desktop:dist
npm run desktop:root
npm run verify:push
```

Dependency rules:

- Use `npm ci` when validating an unchanged lockfile.
- Use `npm install` when intentionally changing dependencies.
- Commit `package-lock.json` whenever dependency resolution changes.
- Do not run a development server under PM2.
- Install Python dependencies into the ignored repository `.venv` from `backend/requirements.txt`.
- FastAPI under `backend/app/` is the active backend. The Node modules under `backend/src/` remain migration reference and regression coverage.

Environment rules:

- Keep environment-dependent values out of source code.
- Add new supported variables to `.env.example` with safe placeholder values.
- Keep the real `.env` ignored.
- FastAPI loads the ignored root `.env`; process and Electron-injected variables take precedence over file values.
- npm and PM2 select the repository `.venv` and then the platform Python command. Development Electron uses the same resolver; packaged Electron launches only its bundled standalone backend.
- The earlier Node SQLite schema and migration remain committed while persistence is migrated to Python. Do not claim that the current FastAPI session path persists accounts in SQLite.
- Keep `/data/`, `*.db`, `*.db-journal`, `*.db-shm`, and `*.db-wal` ignored. Never commit a local database or copy one into a desktop package.
- `ecosystem.config.cjs` should contain process-management settings only. Keep business configuration, service URLs, database URLs, storage paths, and secrets in environment variables.

Production verification:

- PM2 status alone is not proof that deployment succeeded.
- Check logs and verify the real HTTP endpoint, bound host, and configured port.

## 8. Implementation Standards

### General

- Prefer clear, testable modules over adding more behavior to one large file.
- Validate external inputs at the server boundary.
- Use structured errors and explicit loading, empty, success, failure, and retry states.
- Keep provider-specific code behind adapters so Gmail, Microsoft Graph, calendar, LLM, and Speech-to-Text providers can be replaced.
- Do not hard-code ports, provider URLs, model names, filesystem paths, or credentials when they are environment-dependent.

### AI and email safety

- AI output must remain human-reviewed.
- Never send email, create tasks, or add calendar events without explicit user confirmation.
- Treat generated summaries and extracted details as untrusted until confirmed.
- Display uncertainty rather than inventing missing dates, people, locations, or actions.
- Sanitize HTML email before rendering.
- Use idempotency protection for sending email and creating calendar events.
- Do not expose email bodies, tokens, or personal data in logs.

### Accessibility

- Target WCAG 2.1 AA.
- Make every core workflow keyboard accessible.
- Give icon-only controls accessible names.
- Preserve visible focus styles and logical focus order.
- Manage focus when dialogs open and close.
- Respect reduced-motion preferences.
- Voice must never be the only way to perform an action.

### Frontend

- Preserve the established RevoMail visual language unless the task requests a redesign.
- Keep responsive behavior working down to 320 pixels.
- Prefer semantic HTML and reusable UI helpers.
- Do not add a new framework or state library without a concrete requirement and contributor agreement.

### Desktop application

- Keep Electron main-process, preload, and renderer responsibilities separate.
- Renderer processes must use context isolation, must not enable Node.js integration, and may access system capabilities only through a minimal validated preload API.
- Bind desktop-managed services to a loopback host by default. Do not expose a desktop service on the LAN through a renderer-controlled setting.
- Determine readiness through `/api/v1/health`; a child process identifier alone is not proof that the service is usable.
- Prevent duplicate service processes and define explicit start, stop, restart, unexpected-exit, single-instance, and application-exit behavior.
- Store ordinary desktop preferences under Electron `userData`. Keep tokens, the generated encryption key, mailbox content, and other secrets out of renderer-accessible settings.
- Keep Python runtime selection, OAuth values, and LLM keys outside renderer-accessible settings and IPC.
- Preserve the independent Web and PM2 workflows. Desktop integration must not make Electron a server or deployment prerequisite.
- Keep intermediate installers and unpacked applications under ignored `release/`. The sole exception is the root `RevoMail.exe` portable build, which is tracked directly and must remain below 100,000,000 bytes without containing environment files or credentials.
- Keep `RevoMail.cmd` at the repository root as the tracked Windows source launcher. It must install missing or stale Node and Python project dependencies before starting Electron.
- Build the root executable with `npm run desktop:root`; never copy `release/win-unpacked/RevoMail.exe`, because that unpacked executable depends on adjacent packaged resources.

## 9. Validation Matrix

Choose checks proportional to the change.

### Documentation-only changes

```powershell
rg -n "[ \t]+$" AGENTS.md README.md todo.md change.md
git diff --check
```

Also verify headings, links, command names, and that documentation matches the repository.

### Frontend or shared JavaScript changes

```powershell
npm ci
npm run build
```

For interactive changes, also test the affected flow in a real browser at desktop and mobile sizes, then inspect the browser console.

### Production server changes

- Run the relevant automated checks.
- Run `npm run build`.
- Start with `npm run start`.
- Verify a real HTTP response on the configured host and port.
- Confirm that production start does not invoke Vite development mode or another development tool.
- Verify that FastAPI serves both `/api/v1/health` and the built frontend without requiring PostgreSQL or Docker.

### Electron desktop changes

- Run `npm test` and `npm run build`.
- Exercise start, duplicate start, health-ready, stop, restart, invalid configuration, and unexpected-exit behavior.
- Inspect the real Electron launcher for preload or renderer console errors and keyboard-accessible controls.
- Run `npm run desktop:pack` for the current platform when packaging behavior changes.
- Record macOS or Linux checks as unverified when they cannot be run on the current host; configuration alone is not cross-platform verification.

### Integration changes

- Use provider test accounts or fixtures, never personal mailbox data.
- Test success, invalid authorization, expired authorization, timeout, rate limit, empty result, and duplicate-action behavior.
- Verify that secrets and message contents are absent from logs.

If a check cannot run, state exactly why and list the unverified behavior in `change.md` and the final handoff.

## 10. Network Failures

When GitHub, Hugging Face, or another external service is unreachable:

1. First determine whether the current public IP is geolocated to mainland China.
2. If it is, do not repeatedly retry. Complete all work that does not require the network and report which upload, download, or synchronization steps remain incomplete.
3. If it is not, diagnose the specific proxy, DNS, authentication, certificate, or service issue.
4. Do not permanently change a contributor's global proxy or Git configuration without explicit authorization.

## 11. Definition of Done

Before handing work back:

- The requested behavior is implemented within scope.
- The relevant acceptance criteria in `todo.md` are satisfied or remaining gaps are explicit.
- Relevant tests and builds pass.
- Interactive behavior is verified in the real runtime when applicable.
- `change.md` accurately records changes, commands, validation, and open issues.
- No secrets, personal data, build output, dependencies, or local configuration are accidentally tracked.
- `git diff --check` passes.
- The final `git status` is reviewed.
- The handoff states what changed, what was verified, and what remains.
