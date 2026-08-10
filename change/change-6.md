# Implement Module 1 authentication and connected accounts

Date: 2026-08-03

## Scope

Implement GitHub Module #1 and sub-issues #11, #12, #15, and #18: Google and Microsoft OAuth, secure server-side sessions and token lifecycle management, and connected-account permissions and revocation UI.

## Changes

- Selected Node.js, Express, PostgreSQL, Prisma, Zod, and Vitest for the Module 1 authentication boundary and recorded the decision in an ADR.
- Added versioned authentication and connected-account API documentation, startup configuration validation, a database-backed health endpoint, safe structured errors, correlation identifiers, and security headers.
- Added PostgreSQL models and a migration for users, mailbox connections, encrypted OAuth credentials, sessions, and one-time OAuth transactions.
- Implemented Google and Microsoft authorization-code adapters with state, PKCE, minimum enabled-feature scopes, safe provider error normalization, token refresh, and Google revocation.
- Encrypted provider tokens with AES-256-GCM, stored only session-token digests, enforced absolute and idle session expiry, added CSRF protection, and prevented concurrent provider refresh through a database lease.
- Replaced simulated login with server session bootstrap, provider availability and error states, real logout, real user identity, and clean OAuth callback URLs.
- Added responsive connected-account permission, reconnect, confirmed disconnect, partial-failure, retry, and mobile-visible sign-out UI.
- Added unit, API, and PostgreSQL integration tests plus a sanitized local OAuth fixture covering state replay, permissions, encryption, CSRF, logout, ownership, provider failures, and refresh concurrency.
- Updated npm and PM2 scripts, environment examples, README files, `todo.md`, `.gitignore`, and the dependency lockfile.
- Clarified in `todo.md` and GitHub issue #11 that Microsoft OAuth/Graph support is pending; the implemented adapter remains available but is not advertised as a currently supported MVP provider path.
- Archived the previous active task as `change/change-5.md`.

## Reason

Replace the simulated login with provider-ready OAuth and secure, persistent authentication foundations for the RevoMail MVP.

## Key Commands

```powershell
git status --short --branch
git ls-files -v | Select-String '^S'
rg --files -g '!node_modules' -g '!dist'
npm install @prisma/client zod helmet
npm install @prisma/adapter-pg pg
npm install --save-dev prisma vitest supertest
npm run db:generate
npm ci
npm test
npm run test:db
npm run build
npx prisma validate
npm run db:migrate
npx prisma migrate status
node server.js
curl.exe -i http://127.0.0.1:43173/api/v1/auth/session
curl.exe -i http://127.0.0.1:43173/api/v1/auth/google/start
docker run --rm --name revomail-module1-final -e POSTGRES_USER=revomail -e POSTGRES_PASSWORD=revomail -e POSTGRES_DB=revomail -p 127.0.0.1::5432 -d postgres:16-alpine
docker stop revomail-module1-final
git diff --check
git add --all
git commit -m "feat: implement module 1 authentication"
git push -u origin module_1_login
git commit -m "docs: mark Microsoft support pending"
git push
```

## Validation

- `npm ci` completed from the lockfile; its Prisma postinstall generated the client successfully and npm reported zero vulnerabilities.
- `npm test` passed all 16 always-on tests; the database suite is skipped unless `TEST_DATABASE_URL` is supplied.
- `npm run test:db` passed all three PostgreSQL repository integration tests against the migrated temporary PostgreSQL 16 database.
- `npm run build` completed the Vite production build successfully.
- `npx prisma validate` accepted the schema.
- The committed migration applied from scratch to PostgreSQL 16 in a temporary Docker container; `prisma migrate status` reported the database schema up to date.
- The production-mode server connected to PostgreSQL and returned HTTP 200 for both `/api/v1/health` and the built frontend.
- The unconfigured-provider endpoint returned a safe `PROVIDER_NOT_CONFIGURED` response without exposing configuration or secrets.
- A real browser completed the full sanitized Google fixture flow: redirect, callback, session restoration, connected-account permission display, confirmed revocation/deletion, and logout.
- Desktop and 320px browser checks had no console errors; mobile content had no horizontal overflow, navigation retained accessible names, and sign-out remained visible.
- `git diff --check` passed and generated dependencies, builds, Prisma client files, environment files, and browser QA artifacts remain ignored.

## Remaining Work

- Real Google authorization, refresh, and revocation cannot be verified until sanitized test-app credentials and a test account are available.
- Microsoft OAuth and Microsoft Graph release support is explicitly pending; no Microsoft provider setup or production validation is currently scheduled.
- Microsoft disconnect removes local credentials because the selected Microsoft OAuth flow has no direct token-revocation endpoint.
- Mailbox synchronization, email sending, and calendar writes remain outside Module 1 and are still simulated.
