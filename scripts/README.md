# Project Scripts

This directory is reserved for reusable development, validation, migration, and deployment helpers.

Rules:

- Expose common contributor operations through `package.json` scripts.
- Keep scripts non-interactive where practical and return a non-zero exit code on failure.
- Do not hard-code personal paths, private hosts, credentials, tokens, or production addresses.
- Read configuration from documented environment variables.
- Add usage and validation notes when introducing a script.
