# Fix "The time zone is not valid" when adding an event to Google Calendar

Date: 2026-10-04

## Task Scope

Joel's screenshot shows the Add-event dialog rejecting the browser's time zone, `Australia/Sydney`, with "The time zone is not valid", so no event could be created.

## Root Cause

`Australia/Sydney` is a valid name. The backend validates it with Python's `zoneinfo`, which reads the operating system's time zone database. Windows has none, and the `tzdata` package that Python uses as a fallback was not in `backend/requirements.txt`, so every zone lookup failed. My earlier tests passed only because the Linux test environment has an OS time zone database. The packaged desktop backend (PyInstaller) had the same gap: a test build without the data fails with the same lookup error.

## Changes

- `backend/requirements.txt`: added `tzdata==2026.5`. The project's setup script reinstalls Python packages automatically when this file changes.
- `scripts/build-python-backend.mjs`: added `--collect-data tzdata` so the packaged desktop backend bundles the data.
- `backend/python_tests/test_calendar.py`: new test that builds an event for Australia/Sydney, Australia/Melbourne, America/New_York, Europe/London and UTC. It fails with the original error if the time zone data is missing, so the problem is caught by the test suite on any machine.

## Key Commands

- Reproduced the failure in the throwaway Linux copy by pointing `PYTHONTZPATH` at an empty directory (simulating Windows) with `tzdata` uninstalled: `ZoneInfoNotFoundError: No time zone found with key Australia/Sydney`, and the calendar tests fail. With `tzdata` installed, same setting, all 122 backend tests pass.
- Built a tiny PyInstaller program on Linux with and without `--collect-data tzdata`, run with no OS time zone database: it failed without the flag and printed `Australia/Sydney` with it.

## Validation

- 122 backend tests passed with the OS time zone database hidden and `tzdata` installed. Not run on Windows itself, and the real desktop installer was not built; only the small PyInstaller test above.

## Known Issues and Remaining Work

- Joel needs to restart with `npm run start` (or reinstall: `npm ci`) so the new `tzdata` package is installed into the `.venv`, then retry. If the dialog still reports an invalid time zone afterwards, run `.venv\Scripts\python -c "import tzdata"` and tell me the result.
- Not run: `npm test`, `npm run build`.
