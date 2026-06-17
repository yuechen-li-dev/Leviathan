# M22-pre Headless UI Development Survey

## Summary

Leviathan's frontend is already in a good position for source-first and layout-first AI assistance. The React/Vite app builds cleanly, the Vitest suite passes, Machina layout rows are stable and readable, and the vendored Machina React adapter already emits `data-machina-*` DOM annotations for node id, slot, view, debug label, and layer.

Today, repo-local UI verification is mostly static and structural rather than truly visual. The verified toolchain is `npm install`, `npm run build`, and `npm test -- --run`, with tests centered on pure logic, layout inspection helpers, API client behavior, and `renderToStaticMarkup()` assertions. There is no configured Playwright, Puppeteer, Storybook, screenshot regression suite, or automated browser smoke harness in the repo at this time.

The current Machina debug inspector is useful but unevenly surfaced. It can already export a compact JSON snapshot with resolved layout nodes, shell summary, dispatch history, and Ariadne prompt mapping, but it is currently wired into the apps list and RustSimulator layouts, not the Scheduling layout. That means Leviathan already has a strong snapshot concept for AI/UI work, but Scheduling does not yet benefit from it in the real runtime path.

One requested input document is missing from the repo: `docs/m21-scheduling-notification-policy-skeleton.md`. This report therefore uses the existing docs and current source as the factual baseline.

## Current Frontend Commands

Frontend root: [package.json](C:\Users\yuech\source\repos\Leviathan\src\Leviathan.Web\package.json)

Repo-local commands currently defined in `src/Leviathan.Web/package.json`:

| Purpose | Command | Notes |
|---|---|---|
| install | `npm install` | Verified successfully. |
| dev server | `npm run dev` | Runs `vite --host 0.0.0.0`. |
| build | `npm run build` | Runs `tsc -b && vite build`; verified successfully. |
| test | `npm test -- --run` | Invokes `vitest run --run`; verified successfully. |
| preview | `npm run preview` | Runs `vite preview --host 0.0.0.0`; documented only, not visually inspected. |
| Capacitor sync | `npm run cap:sync` | Runs build, then `npx cap sync android`. |
| Capacitor open Android | `npm run cap:android` | Runs sync, then `npx cap open android`. |
| Android open only | `npm run android:open` | Runs `npx cap open android`. |

Not present in frontend scripts:

- lint
- format
- Storybook
- Playwright
- Puppeteer
- screenshot test command
- accessibility test command

## Current Test and Headless Browser Capability

### What exists now

- `vitest` is installed and used as the standard test runner.
- `jsdom` is installed as a dev dependency.
- Current tests cover shell dispatch, route mapping, API config, Ariadne prompt mapping, debug snapshot creation, and Scheduling component rendering through `react-dom/server`.
- The vendored Machina React adapter emits stable DOM annotations:
  - `data-machina-node-id`
  - `data-machina-slot`
  - `data-machina-view`
  - `data-machina-debug-label`
  - `data-machina-layer`
- Machina layout can be resolved headlessly from `LayoutRow[]` with `resolveLayoutRows()`.

### What does not exist now

- No configured Playwright test suite.
- No configured Puppeteer test suite.
- No Vitest browser mode configuration.
- No screenshot regression tests.
- No DOM snapshot files or snapshot serializers.
- No accessibility test harness such as `axe-core` or `jest-axe`.
- No Storybook or story-like fixture catalog.
- No automated frontend+backend smoke script that boots both stacks together and verifies the DOM.

### Evidence from package/tooling inspection

- `npm ls @playwright/test playwright puppeteer @vitest/browser-playwright @vitest/browser-preview @storybook/react axe-core jest-axe` returned an empty tree from `src/Leviathan.Web`.
- `vite.config.ts` contains only React plugin setup and `/api` proxying to `http://localhost:5188`.
- The current test suite passes without a browser runtime and does not configure a DOM environment globally.

### Capability answers

Can Codex run a headless browser in this repo today?

- Not through any repo-configured toolchain that was verified in this milestone.
- A small dev-only Playwright setup would be a plausible future addition, but it does not exist yet.

Can Codex capture screenshots today?

- Not through a repo-local, verified browser automation path.
- No screenshot tool or screenshot assertions are configured in the frontend project.

Can Codex inspect rendered DOM today?

- Yes, partially.
- Static component HTML can be inspected through `renderToStaticMarkup()` tests.
- Machina DOM annotations exist in the adapter, so a future browser harness could query reliable `data-machina-*` markers.
- Full runtime DOM inspection for live routes was not verified in this milestone.

Can Codex run local backend + frontend together in tests today?

- Not through a checked-in automated harness.
- The frontend dev server proxies `/api` to the backend, so manual local co-run is straightforward.
- There is no existing end-to-end test orchestration that starts both processes and asserts behavior.

Environment limitations relevant to headless UI work:

- Current verified tests are unit/static-render tests, not route-level browser tests.
- No checked-in screenshot baseline or visual diff path exists.
- The Machina inspector export currently depends on browser runtime wiring.
- Scheduling runtime state is not yet surfaced through the Machina inspector path.
- Capacitor Android commands exist, but no headless Android screenshot or emulator automation path is configured in the repo.

## Machina Debug Inspector Inventory

Primary sources:

- [m2-debug-inspector.md](C:\Users\yuech\source\repos\Leviathan\docs\m2-debug-inspector.md)
- [debugInspector.ts](C:\Users\yuech\source\repos\Leviathan\src\Leviathan.Web\src\machina\debugInspector.ts)
- [MachinaHost.tsx](C:\Users\yuech\source\repos\Leviathan\src\Leviathan.Web\src\machina\MachinaHost.tsx)
- [views.tsx](C:\Users\yuech\source\repos\Leviathan\src\Leviathan.Web\src\machina\views.tsx)

### What the inspector exports

The compact `LeviathanDebugSnapshot` currently contains:

- `generatedAt`
- `apiBaseUrl`
- `route`
- `status`
- `currentScreenSummary`
- `layoutNodes`
- `recentEvents`
- `promptMapping`

### Resolved layout node fields

Each `layoutNodes[]` entry currently includes:

- `id`
- `debugLabel`
- `viewKey`
- `parentId`
- `rect`
  - `x`
  - `y`
  - `width`
  - `height`
- `z`
- `layer`
- `order`
- `depth`

This is strong data for LLM reasoning because it is compact, typed, numeric, and tied to stable node ids.

### Shell state fields

The shell summary currently includes:

- `route`
- `status`
- `error`
- `appCount`
- `sessionId`
- `wasRestored`
- `screenRevision`
- `promptKind`
- `promptId`
- `textInputLength`
- `hasTextInput`

The full shell state is also rendered in the inspector details area, but the compact exported snapshot intentionally keeps only the summary plus `currentScreenSummary`.

### Dispatch history fields

Each dispatch history entry includes:

- `sequence`
- `at`
- `type`
- `summary`

The ring buffer keeps the most recent 40 events. Summaries are intentionally compact:

- Ariadne session/screen events collapse to summarized screen data.
- `set-text-input` collapses to text length plus presence.
- Other events preserve the non-`type` payload fields.

### Prompt/action mapping fields

When a prompt is active, `promptMapping` includes:

- `promptId`
- `promptKind`
- `revision`
- `title`
- `actions[]`
  - `kind`
  - `key`
  - `label`
  - `dispatchEvent`
- `textInput`
  - `available`
  - `valid`
  - `length`

This is particularly useful for headless agent work because it makes prompt-to-dispatch wiring inspectable without reverse-engineering button handlers from the DOM.

### Scheduling coverage today

Scheduling is not currently covered well by the inspector in the real runtime path.

- `MachinaHost` builds the inspector only for `buildAppsLayout(...)` and `buildRustSimulatorLayout(...)`.
- `buildSchedulingLayout(...)` only renders `root` plus `scheduling-home`.
- `ShellState` is centered on shell route/app loading plus Ariadne screen state; it does not model Scheduling-specific provider setup, slot selection, hold, booking, audit, or lifecycle state.

Implication:

- The current inspector is useful for shell-level and RustSimulator work.
- It is not yet sufficient for real Scheduling UI diagnosis unless equivalent Scheduling state is captured some other way.

### Snapshot quality for LLM prompts

Strengths:

- stable ids
- compact numeric rectangles
- explicit depth/order
- dispatch trace
- prompt action mapping
- JSON already shaped for copy/paste

Current weaknesses:

- no Scheduling runtime state in the real path
- no DOM snapshot bundled with layout snapshot
- no screenshot path bundled with snapshot
- export is primarily exposed through browser UI

### Browser-only or headless?

Current user-facing export is browser-exposed:

- `Copy snapshot` uses `navigator.clipboard` when available.
- The same JSON is rendered into a read-only `<textarea>` as a manual fallback.

However, the snapshot generation logic itself is not browser-only:

- `inspectLayout(...)`
- `summarizeShellState(...)`
- `inspectPromptMapping(...)`
- `createDebugSnapshot(...)`

These are pure helpers that can already be called from tests or a future CLI/headless harness.

### How Codex could obtain equivalent data without manual copy

Immediately possible with current code:

- Unit tests that call `resolveLayoutRows(...)`, `inspectLayout(...)`, and `createDebugSnapshot(...)`.
- A tiny frontend probe script that imports the same helpers and writes snapshot JSON to stdout or disk.
- Browser automation later, using Playwright evaluation plus the existing React adapter DOM annotations.

Not present today, but good future additions:

- a dedicated `dumpResolvedLayout()` helper
- a CLI snapshot generator for selected routes/fixtures
- a debug route/query param that emits snapshot JSON directly
- a fixture-driven renderer that serializes layout + DOM summary together

## MachinaLayout.JS AI-UI Gap Analysis

Vendored MachinaLayout.JS already gives AI-assisted UI work several strong primitives:

- canonical flat authoring model: `LayoutRow[]`
- deterministic resolver: `resolveLayoutRows(...)`
- canonical tree conversion: `toResolvedTree(...)`
- canonical flattening helper: `flattenResolvedTree(...)`
- responsive variants selected from `rootRect`
- stable `view ?? slot` rendering contract
- React adapter DOM annotations via `data-machina-*`

### Question-by-question evaluation

1. Can an LLM infer where every major UI object is from code alone?

- Often yes for Machina-owned geometry.
- The row model is unusually readable and includes ids, parents, frames, view keys, and optional debug labels.
- The answer is weaker when a screen is mostly ordinary React markup inside one large Machina slot, as Scheduling currently is.

2. Are row ids/debug labels/view keys consistently exposed?

- Core support is good.
- Rows can carry `id`, `view` or `slot`, `debugLabel`, `layer`, and `z`.
- The React adapter exposes these into DOM attributes.
- Leviathan uses debug labels in some layouts, but not consistently across all app surfaces.

3. Is there a canonical resolved layout serializer?

- Partially.
- Core has canonical resolved document and tree shapes plus `flattenResolvedTree(...)`.
- There is not a documented, named "debug snapshot schema" in MachinaLayout.JS itself.

4. Is there a canonical DOM annotation standard?

- Yes, at the adapter level.
- `MachinaReactView` emits `data-machina-node-id`, `data-machina-slot`, `data-machina-view`, `data-machina-debug-label`, and `data-machina-layer`.
- This is already strong enough to serve as the DOM-side anchor for browser automation.

5. Is there a canonical screenshot+layout overlay mode?

- No.
- `debug={true}` outlines node wrappers and shows labels, but there is no packaged screenshot capture or overlay export workflow.

6. Is there a way to render layout boxes without real app data?

- Yes for pure layout.
- `resolveLayoutRows(...)` only needs rows and a root rect.
- The control-room sample demonstrates fixture-driven rendering of resolved layouts.
- Leviathan can already construct layout docs from fake shell state in tests.

7. Are layout variants/breakpoints inspectable enough?

- Core support is solid.
- Variants are deterministic and selected from root dimensions.
- What is missing is a standard Leviathan-side tool to dump snapshots for several viewport presets in one run.

8. Are text blocks / MachinaText inspectable enough?

- Partially.
- MachinaText has a clear contract and stable props, but there is no dedicated text-inspection snapshot beyond rendered DOM or user-authored props.
- Good enough for code reading, weaker for automated UI audits.

9. Are dispatch events traceable enough?

- For Leviathan shell and Ariadne flow, yes.
- MachinaDispatch itself is pure and deterministic.
- The current debug inspector adds a useful ring buffer.
- Scheduling events are much less traceable because they are not yet routed through comparable shell-level snapshotting.

10. What would improve Codex frontend iteration most?

- A stable, documented `MachinaDebugSnapshot` schema shared across apps.
- A headless snapshot CLI that outputs JSON plus optional screenshot path.
- Fixture-driven route/screen renderers.
- Standard viewport presets.
- A browser automation helper that captures screenshot + DOM + Machina snapshot in one bundle.

### Biggest MachinaLayout.JS gaps for AI/UI work

- No canonical screenshot capture or screenshot-overlay facility.
- No first-class "dump resolved layout to JSON file" CLI/helper.
- No packaged multi-viewport snapshot runner.
- No higher-level LLM handoff artifact format combining layout, DOM, and screenshot.
- Text inspection is contract-driven rather than snapshot-driven.

## Leviathan Frontend Gap Analysis

### Current strengths

- Frontend build is healthy.
- Test suite is fast and green.
- Shell dispatch and route handling are explicit.
- Scheduling components already have some static-render tests with realistic DTO-shaped mock data.
- The Machina shell architecture is readable and deterministic.

### Biggest Leviathan gaps for AI-assisted UI work

1. Scheduling does not currently share the Machina inspector runtime path.

- `buildSchedulingLayout(...)` is only `root` plus one `schedulingHome` slot.
- There is no Scheduling debug inspector slot in the live route.
- The most important current product surface therefore lacks the strongest existing AI-facing debug artifact.

2. Scheduling runtime is mostly opaque to the shell snapshot model.

- `ShellState` does not carry Scheduling page state.
- The current snapshot model is oriented around Ariadne sessions, not booking/setup flows.
- A headless agent cannot retrieve provider setup, selected slot, active hold, booking list selection, audit state, or lifecycle state from the existing shell snapshot.

3. Scheduling views are testable as components but not cataloged as full route fixtures.

- The existing tests use `renderToStaticMarkup()` on individual components.
- There is no screen catalog or story-like route matrix for provider setup, public slots, confirmation, bookings, blocked admin gate, or ownership failure states.

4. Route-level DOM verification is missing.

- There is no browser harness that loads `/apps/scheduling` or `/book/:providerSlug`.
- The repo cannot currently prove route-level DOM shape, CSS interactions, or responsive behavior headlessly.

5. Backend-dependent flows lack a cheap fixture renderer.

- Important Scheduling flows depend on backend setup and API responses.
- There is no fixture host or mocked route mode that lets Codex render the whole booking flow without booting backend state.

6. Geometry inside Scheduling is only partly visible from Machina.

- The outer Scheduling shell is Machina-owned.
- Most internal Scheduling composition is ordinary React markup inside a single large slot.
- That means Machina can tell Codex where the Scheduling screen container is, but not the geometry of its internal subregions.

7. Dispatch traceability is uneven.

- Shell/Ariadne dispatch is traceable.
- Scheduling-specific interactions are not captured in a comparable event trace.

### Practical result

Codex can already help safely with:

- layout code review
- static component/UI copy tweaks
- route/state logic fixes
- Machina row-level layout work
- shell dispatch behavior

Codex is less safe today for:

- responsive Scheduling UX changes
- route-level visual polish
- verifying CSS geometry regressions
- full booking-flow UI behavior without a prepared local backend

## Recommended Codex UI Workflow

### Default workflow for future UI/UX tasks

1. Read milestone docs and the specific app/layout source.
2. Run `npm install`, `npm run build`, and `npm test -- --run`.
3. Identify whether the task is:
   - pure Machina layout
   - component render/state bug
   - route-level workflow bug
   - mobile/narrow layout issue
   - Capacitor/Android shell issue
4. Prefer fixture-driven or static-render verification first.
5. If a browser harness exists for the task, collect:
   - screenshot
   - DOM summary
   - Machina snapshot JSON
   - dispatch trace
6. Make the smallest targeted change.
7. Re-run build/tests and regenerate the same artifacts.
8. Report what was verified versus inferred.

### Workflow: pure layout tweak

Use when the task is mainly row geometry, spacing, breakpoint behavior, or slot placement.

1. Inspect relevant `LayoutRow[]` builder.
2. Resolve layout headlessly for target viewport sizes.
3. Compare layout node ids, debug labels, and rects before/after.
4. Update row definitions.
5. Re-run layout-focused tests or add a small structural assertion if missing.

This is the safest current AI workflow in Leviathan.

### Workflow: app state/rendering bug

Use when a component renders wrong copy, wrong status, wrong links, wrong prompt mapping, or wrong conditional block.

1. Reproduce from source and current tests.
2. Add or update a component-level static-render test.
3. If Machina-owned, also inspect resolved layout nodes for the same screen.
4. Make the targeted render/state fix.
5. Re-run Vitest and build.

### Workflow: end-to-end booking flow UI bug

Use when the issue spans provider setup, public booking, hold/confirm, or provider bookings.

Current best path:

1. Read Scheduling docs and API endpoints.
2. Prefer fixture DTOs and component-level tests first.
3. If true route-level verification is needed, run backend + frontend locally and use a future Playwright harness once added.
4. Capture screenshot, DOM summary, and Scheduling/Machina snapshot bundle once that tooling exists.

Current warning:

- This is not yet a strong fully headless workflow in the repo as-is.

### Workflow: mobile/narrow layout tweak

1. Resolve layout at multiple root rect sizes.
2. Check responsive variants or width-based layout branches.
3. If browser tooling exists, capture narrow-width screenshot and DOM summary.
4. Re-run build/tests and compare the same viewport presets.

### Workflow: Android/Capacitor visual issue

1. Treat web verification as prerequisite.
2. Run `npm run cap:sync` after frontend changes.
3. Use `npm run cap:android` or `npm run android:open` only when native shell inspection is actually required.
4. Do not claim visual verification unless an emulator/device/browser session was actually exercised.

## Recommended Tooling Additions

Recommended additions are intentionally small and dev-only.

1. Add a minimal Playwright setup for local route smoke tests and screenshot capture.
2. Add a tiny helper that saves `document.documentElement.outerHTML` or a structured DOM summary for selected routes.
3. Add viewport presets for desktop/tablet/mobile snapshot runs.
4. Add one script that bundles:
   - screenshot path
   - DOM snapshot path
   - Machina snapshot path
   - route
   - viewport
5. Add at least one fixture-driven full-screen renderer for Scheduling states.

Recommended non-goals for this milestone:

- no Storybook mandate yet
- no heavy visual regression platform
- no vendor modifications

## Recommended MachinaLayout.JS Improvements

These are vendor-level ideas, not changes made in this milestone.

1. Standardize a `dumpResolvedLayout()` helper that returns a stable flattened schema.
2. Document the adapter `data-machina-*` attributes as an explicit debug contract for browser automation.
3. Provide a canonical screenshot/debug overlay mode that shows rects and labels cleanly.
4. Provide a viewport matrix helper for responsive snapshot generation.
5. Define a compact serialized `MachinaDebugSnapshot` schema at the library level.
6. Provide a helper that combines resolved layout, rendered DOM annotations, and optional screenshot metadata into one handoff bundle.

## Recommended Leviathan Improvements

1. Extend the Scheduling route to expose a real inspector/debug snapshot path.
2. Define a Scheduling-specific snapshot model that includes:
   - provider/setup context
   - selected service/slot
   - hold state
   - confirmation state
   - selected booking
   - audit summary
   - lifecycle summary
3. Add fixture-driven Scheduling screen renderers so whole screens can be rendered without live backend setup.
4. Add route-level browser smoke coverage once a tiny Playwright setup exists.
5. Add viewport preset verification for narrow/mobile layouts.
6. Add a machine-readable handoff bundle per UI task:
   - changed source files
   - screenshot
   - DOM summary
   - Machina snapshot
   - test/build results

## Risks / Limitations

- No manual browser verification was performed in this milestone.
- No repo-local headless browser/screenshot tooling was verified because none is configured today.
- Scheduling is the most strategically important current UI surface, but it is not yet covered by the live Machina inspector path.
- The current shell snapshot model is Ariadne-oriented and does not capture Scheduling runtime details.
- `docs/m21-scheduling-notification-policy-skeleton.md` is missing, so notification-policy context could not be surveyed from that document.
- Capacitor commands exist, but Android visual verification remains manual unless later automation is added.

## Suggested M22 Scope

Recommended M22 implementation scope:

1. Add a tiny dev-only Playwright route smoke setup for Leviathan Web.
2. Add a headless snapshot bundle helper for:
   - screenshot
   - DOM summary
   - Machina snapshot JSON
3. Extend the Scheduling route so it can produce useful debug snapshots comparable to RustSimulator.
4. Add fixture-driven Scheduling render states for the major local/demo screens.
5. Keep all changes local to tooling/debug surfaces; do not redesign Scheduling UI and do not add product features.

This would materially improve Codex UI assistance without changing the product architecture or touching `vendor/`.

## Verification

Commands run from `src/Leviathan.Web`:

```bash
npm install
npm run build
npm test -- --run
```

Results:

- `npm install`: succeeded; dependencies already up to date; 0 vulnerabilities reported.
- `npm run build`: succeeded; Vite production build completed.
- `npm test -- --run`: succeeded; 6 test files passed, 34 tests passed.

Backend repo health commands were not run because this milestone stayed within frontend/docs/source inspection and did not require backend file modification or backend build verification.
