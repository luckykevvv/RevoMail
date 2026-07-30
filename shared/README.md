# Shared Contracts

This directory is reserved for artifacts shared across frontend and backend boundaries.

- `contracts/` contains versioned request, response, event, and error contracts.
- `schemas/` contains runtime-neutral validation schemas or generated schema outputs.

Shared code must not contain credentials, environment-specific configuration, UI components, database clients, or provider SDKs. Avoid adding shared abstractions until at least two consumers need them.
