# Fix exponential slowdown and crash after opening several emails

Date: 2026-09-27

## Task Scope

Opening and closing emails made the app progressively slower, and it froze or crashed after about five emails. Find the cause and fix it.

## Changes

- `src/main.js` (`bindEvents`): the theme-button binding `document.querySelectorAll("[data-theme]")` is now `document.querySelectorAll("button[data-theme]")`, with an explanatory comment.

## Root Cause

`render()` sets `data-theme` on `<body>` (`document.body.dataset.theme = state.theme`). `bindEvents()` runs after every render and attached a click listener that calls `render()` to every element matching `[data-theme]`, which includes `<body>`. Unlike the rest of the page, `<body>` is never replaced, so it collected one additional listener per render. Every click anywhere in the page bubbles to `<body>`, so it ran all accumulated listeners, each of which rendered the whole page again and added yet another listener. Renders per open/close cycle therefore grew roughly fourfold each time, so the main thread was saturated within a few emails. This was independent of email content, of the classifier added earlier, of the backend, and of caching; there are no iframes, timers, or observers involved.

## Key Commands

- Copied `src/`, `index.html` and `public/` to a throwaway directory outside the repository, ran Vite with a mock `/api/v1` and drove it with headless Chromium (Playwright): opened and closed emails repeatedly, counting `render()` calls, timing clicks, and reading Chromium performance metrics and a CPU profile.
- `node --check` on `src/main.js`.

## Validation

- Reproduced before the fix: renders per open/close grew 9/17, 35/69, 139/277, 555/1109; closing an email grew from about 140 ms to about 12 s by the fifth cycle and then stopped responding. A CPU profile showed the time in repeated full-page renders (icon creation, `querySelectorAll`, `addEventListener`).
- After the fix, 12 consecutive open/close cycles: a constant 1 render on open and 2 on close, open and close each about 25-65 ms with no upward trend, JS heap 4.1 to 4.5 MB, no page errors. The theme buttons still switch the theme (verified on the Settings screen).
- The mock API and headless Chromium are not the Electron window or a real Gmail mailbox, and the run used the Vite development server rather than the `npm run build` output.

## Known Issues and Remaining Work

- Chromium's `JSEventListeners` metric still rose by about 115 per cycle after the fix while the JS heap stayed flat and the heap snapshot showed no detached nodes. This is consistent with uncollected garbage from replaced DOM, but it was not proven to be collected.
- Not run: `npm test` and `npm run build`. Rebuild with `npm run build` before restarting the server, as it serves `dist/`.
- Separate issue noticed and not fixed: inbox rows and the reading-view heading insert `sender`, `subject` and `preview` into `innerHTML` without escaping (`emailRow` and `readingView` in `src/main.js`). A sender such as `Name <addr@example.com>` is parsed as an HTML tag, and a hostile subject could inject markup or script. This should be escaped in its own task.
