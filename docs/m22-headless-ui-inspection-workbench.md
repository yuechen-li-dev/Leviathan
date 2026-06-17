# Leviathan M22: Headless UI Inspection Workbench

M22 adds a minimal Playwright-based inspection path for Leviathan Web so Codex can verify rendered UI with real screenshots, Machina DOM summaries, and debug snapshot JSON instead of guessing from TSX and CSS alone.

## Tooling added

- `@playwright/test` as a frontend dev dependency only.
- `playwright.config.ts` targeting Chromium only.
- Playwright route mocks for backend-independent route inspection.
- A `captureLeviathanUiHandoffBundle(...)` helper that writes screenshot + DOM summary + Machina snapshot + handoff metadata into one folder.

No vendor files were modified. No product features were added. No Scheduling redesign work was included.

## Scripts

Frontend root: [package.json](C:\Users\yuech\source\repos\Leviathan\src\Leviathan.Web\package.json)

- `npm run test:e2e`
  Runs the Playwright Chromium suite headlessly.
- `npm run test:e2e:headed`
  Runs the same Playwright suite in headed mode for local inspection.
- `npm run ui:snapshot`
  Runs the route snapshot spec directly.

## Server model

Playwright uses `vite preview` via `webServer` and points at `http://127.0.0.1:4173`.

Why preview:

- it exercises built frontend assets instead of an editor-only dev transform path;
- it keeps the first M22 smoke checks backend-independent;
- it stays small and local.

Current expectation:

- run `npm run build` before `npm run test:e2e`, because preview serves the built app.

## Handoff bundle

Each snapshot test writes a handoff bundle under:

`src/Leviathan.Web/test-results/ui-snapshots/<test-name>/`

Artifacts:

- `screenshot.png`
- `dom-summary.json`
- `machina-snapshot.json`
- `handoff.json`

These artifact folders are gitignored:

- `src/Leviathan.Web/test-results/`
- `src/Leviathan.Web/playwright-report/`

## DOM summary

The DOM summary intentionally stays compact and Machina-oriented. It records:

- route
- timestamp
- visible text excerpt
- root ids from `data-machina-root-id`
- one entry per Machina node from `data-machina-node-id`

Each node entry includes:

- `rootId`
- `nodeId`
- `slot`
- `view`
- `debugLabel`
- `layer`
- `tagName`
- `className`
- `role`
- `ariaLabel`
- browser `boundingBox`
- short `textExcerpt`

This avoids dumping full HTML while still giving Codex enough structure to reason about the rendered result.

## Machina snapshot export

M22 exposes a debug-only snapshot bridge on `window` when the route is loaded with `?debug=1`:

- `window.__LEVIATHAN_DEBUG_SNAPSHOT__`
- `window.__LEVIATHAN_GET_DEBUG_SNAPSHOT__()`

The payload includes:

- existing compact debug snapshot JSON
- shell summary
- flattened layout nodes
- recent events
- prompt mapping
- full shell state

This is debug-only. When debug mode is disabled, the window bridge is removed.

## Covered routes

Current Playwright smoke coverage:

1. `/apps?debug=1`
   Verifies app list rendering, captures screenshot, DOM summary, and Machina snapshot.
2. `/apps/scheduling?debug=1`
   Verifies Scheduling route rendering, captures screenshot, DOM summary, and Machina snapshot.

Current backend independence approach:

- Playwright intercepts `/api/**` and fulfills the small responses needed by these smoke routes.
- No ASP.NET backend process is required for the initial M22 route inspection pass.

## How to use

From [src/Leviathan.Web](C:\Users\yuech\source\repos\Leviathan\src\Leviathan.Web):

```bash
npm run build
npm run test:e2e
```

For an interactive local pass:

```bash
npm run test:e2e:headed
```

After a run:

1. Open the screenshot in the relevant `test-results/ui-snapshots/...` folder.
2. Read `dom-summary.json` for Machina node ids, labels, text, and measured bounding boxes.
3. Read `machina-snapshot.json` for the debug snapshot payload.
4. Paste `handoff.json`, `dom-summary.json`, and `machina-snapshot.json` into Codex/ChatGPT alongside the screenshot for targeted UI work.

## Limitations

- Chromium only in M22.
- No visual regression baselines yet.
- No mobile viewport matrix yet.
- Scheduling still exposes only a coarse Machina shell node structure; inner Scheduling composition is still mostly plain React markup inside that slot.
- API mocking is deliberately narrow and only intended for local smoke/snapshot inspection.
- `/apps/scheduling` still triggers shell session behavior internally; M22 works around backend dependence with Playwright route interception rather than deeper shell refactors.

## Recommended M23

- Use screenshot + DOM + Machina handoff bundles for Scheduling UI polish tasks.
- Add more Scheduling fixture states or route-intercepted scenario variants.
- Add mobile and tablet viewport snapshot coverage.
- Add visual regression baselines only after the UI stabilizes.

## M23 follow-up

M23 extends the workbench in these ways:

- Scheduling fixture-state coverage now includes landing, provider setup, public booking, confirmation, cancelled/rescheduled, payment-required, and notification-summary demo surfaces.
- Viewport coverage now includes desktop `1440x1024`, tablet `768x1024`, and phone `390x844`.
- Snapshot tests now assert artifact file creation and page health in addition to route text and Machina node presence.

The basic workflow is unchanged:

```bash
npm run build
npm run test:e2e
```

See [docs/m23-scheduling-ui-polish-handoff.md](C:\Users\yuech\source\repos\Leviathan\docs\m23-scheduling-ui-polish-handoff.md) for the expanded route/state matrix and artifact folders.

## M24 follow-up

M24 does not replace this workbench. It layers a separate real-backend smoke route on top of it:

- `npm run test:e2e` stays fixture/mock oriented;
- `npm run test:e2e:real` starts the ASP.NET backend plus the frontend preview and captures live Scheduling artifacts;
- the same handoff helper now supports a second artifact root at `src/Leviathan.Web/test-results/ui-snapshots-real/`.

See [docs/m24-scheduling-real-backend-smoke.md](C:\Users\yuech\source\repos\Leviathan\docs\m24-scheduling-real-backend-smoke.md).
