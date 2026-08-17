# Shared Contracts

This directory contains artifacts shared across frontend and backend boundaries.

- `contracts/` contains versioned request, response, event, and error contracts.
- `schemas/` contains runtime-neutral validation schemas or generated schema outputs.

`contracts/api-v1.schema.json` defines standard errors, pagination, OAuth, AI, voice, task, and calendar shapes. Reserved contracts do not imply that their endpoints are implemented.

Shared code must not contain credentials, environment-specific configuration, UI components, database clients, or provider SDKs. Avoid adding shared abstractions until at least two consumers need them.
