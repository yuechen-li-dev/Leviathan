# Leviathan M26A: MachinaLayout.JS 0.3.0 Low-Risk Adoption

## Purpose

M26A adopts the lowest-risk MachinaLayout.JS 0.3.0 helpers that directly reduce Leviathan-local layout arithmetic and Playwright metadata boilerplate without changing product behavior, handoff schema, or debug overlay defaults.

Scope kept intentionally narrow:

- adopt stack geometry helpers in Scheduling layout code;
- adopt stack geometry helpers in shared Machina / RustSimulator layout code;
- adopt viewport matrix helpers in Playwright snapshot metadata;
- preserve current screenshot, DOM summary, Machina snapshot, and `handoff.json` contracts.

Explicitly out of scope in M26A:

- `summarizeMachinaDom`
- `writeMachinaHandoffBundle`
- handoff artifact folder renames
- handoff JSON shape changes
- debug overlay mode rollout
- product feature work

## Stack geometry helpers adopted

Adopted helpers:

- `getArrangeContentRect`
- `getStackContentRect`
- `getStackMainAxisMetrics`
- `getRemainingStackRect`

Applied in:

- `src/Leviathan.Web/src/apps/scheduling/layouts.ts`
- `src/Leviathan.Web/src/machina/layouts.ts`

What changed:

- Scheduling now resolves a minimal shell layout first, then queries the root/content stack geometry to size the sidebar and narrow footer rail from real remaining rects instead of local `rootRect - hero - inspector - 32` math.
- RustSimulator now resolves the nav/content shell first, then queries the content stack geometry to size the side panel from the resolved content rect instead of local `rootRect - nav - 32` math.
- Inspector height still uses the existing local clamp because that is product-owned shell policy, not a Machina query concern.

## Files changed

- `src/Leviathan.Web/src/apps/scheduling/layouts.ts`
- `src/Leviathan.Web/src/apps/scheduling/layouts.test.ts`
- `src/Leviathan.Web/src/machina/layouts.ts`
- `src/Leviathan.Web/src/machina/layouts.test.ts`
- `src/Leviathan.Web/src/machina/uiSnapshotMatrix.test.ts`
- `src/Leviathan.Web/tests/support/uiSnapshotMatrix.ts`
- `src/Leviathan.Web/tests/ui-snapshot.spec.ts`
- `docs/m25-machina-0_3-inventory-adoption-plan.md`
- `docs/m26a-machina-0_3-low-risk-adoption.md`

## Before/after workaround summary

Reduced local workarounds:

- Scheduling wide sidebar height no longer depends on local `contentHeight - 32`.
- Scheduling narrow sidebar width no longer depends on local `rootRect.width - 32`.
- RustSimulator wide side panel height no longer depends on local `contentHeight - 32`.
- RustSimulator narrow side panel width no longer depends on local `rootRect.width - 32`.
- Playwright no longer keeps a fully hand-written responsive snapshot case matrix.

Still intentionally local after M26A:

- shell policy constants such as hero height, sidebar width clamp, inspector height clamp, and narrow-panel height clamp
- current DOM summary extraction in `tests/support/uiSnapshot.ts`
- current `handoff.json` writer and artifact folder naming
- current route and fixture conventions

## Viewport matrix helper adoption

M26A moved the Playwright snapshot matrix to Machina 0.3.0 metadata helpers:

- `createViewportMatrix("standard-responsive")` provides canonical responsive viewport ordering and keys.
- `defineMachinaViewports(...)` remaps those viewport keys to Leviathan's existing screenshot sizes so artifact outputs stay stable.
- `defineMachinaScreens(...)` expresses the route/fixture screen catalog used by the snapshot suite.
- `expandScreenViewportTasks(...)` expands the catalog into deterministic screen+viewport tasks for the Playwright loop.

Compatibility preserved:

- Playwright test names remain `apps-route-desktop`, `scheduling-landing-phone`, and so on.
- artifact folders remain based on those legacy names because the existing handoff helper still receives `name: "${screenKey}-${viewportKey}"`.
- handoff JSON shape remains unchanged.

## Handoff and DOM migration status

Deferred to M26B:

- DOM summary extraction migration to `summarizeMachinaDom`
- handoff bundle manifest writing migration to `writeMachinaHandoffBundle`
- any compatibility-field or artifact-name transition plan

M26A intentionally leaves `src/Leviathan.Web/tests/support/uiSnapshot.ts` functionally unchanged.

## Tests run

Frontend:

- `cd src/Leviathan.Web`
- `npm install`
- `npm run build`
- `npm test -- --run`
- `npm run test:e2e`
- `npm run test:e2e:real`

Backend:

- not run; no backend files changed

Observed results:

- `npm install`: passed
- `npm run build`: passed
- `npm test -- --run`: passed
- `npm run test:e2e`: passed
- `npm run test:e2e:real`: passed

## Screenshot and e2e verification

Verified via Playwright artifacts and passing assertions:

- `/apps` still renders on desktop, tablet, and phone.
- `/apps/scheduling` landing still renders on desktop, tablet, and phone.
- Scheduling desktop/tablet/phone captures still render for the existing fixture-backed cases.
- public booking still renders on desktop, tablet, and phone.
- real backend smoke still reaches confirmation and cancellation.

Observed artifact roots remained unchanged:

- fixture snapshots: `src/Leviathan.Web/test-results/ui-snapshots/`
- real smoke snapshots: `src/Leviathan.Web/test-results/ui-snapshots-real/`

Note:

- the real smoke run reused an existing preview server on `127.0.0.1:4173`; Playwright still passed the full journey in this environment.

## Remaining local workarounds

- hero/sidebar/panel clamp policy still lives in Leviathan layout code
- current docked inspector panel still exists as a layout region
- snapshot handoff writer and DOM summary extractor remain Leviathan-local
- Scheduling route/query preservation and fixture resolution remain app-local

## Recommended M26B

1. Migrate DOM summary extraction to `summarizeMachinaDom` while preserving the current useful excerpts and route context.
2. Migrate handoff manifest writing to `writeMachinaHandoffBundle` while keeping compatibility fields or legacy artifact naming where downstream expectations still exist.
3. Add screen catalog metadata beside the current fixture routing in a way that does not change runtime route behavior.
4. Decide whether debug overlay adoption complements or replaces the current docked inspector before changing debug ergonomics globally.
