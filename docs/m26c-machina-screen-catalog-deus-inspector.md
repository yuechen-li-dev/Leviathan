# Leviathan M26C: Machina Screen Catalog and DeusMachina Inspector Evaluation

## Purpose

M26C makes Machina screen metadata first-class in Leviathan and evaluates whether MachinaLayout.JS / DeusMachina should own inspector behavior modes without breaking the current route behavior, snapshot bridge, artifact names, or docked inspector workflow.

Scope stayed intentionally narrow:

- no vendor edits
- no Scheduling redesign
- no backend behavior changes
- no artifact folder renames
- no removal of the existing docked inspector
- no removal of the Leviathan debug snapshot bridge

## Files changed

- `src/Leviathan.Web/src/machina/screenCatalog.ts`
- `src/Leviathan.Web/src/machina/screenCatalog.test.ts`
- `src/Leviathan.Web/src/machina/inspectorBehavior.ts`
- `src/Leviathan.Web/src/machina/inspectorBehavior.test.ts`
- `src/Leviathan.Web/src/machina/MachinaHost.tsx`
- `src/Leviathan.Web/tests/support/uiSnapshotMatrix.ts`
- `src/Leviathan.Web/tests/support/uiSnapshot.ts`
- `src/Leviathan.Web/tests/ui-snapshot.spec.ts`
- `src/Leviathan.Web/tests/scheduling-real-backend-smoke.spec.ts`
- `src/Leviathan.Web/src/machina/uiSnapshotMatrix.test.ts`
- `src/Leviathan.Web/src/machina/uiSnapshotCompat.test.ts`
- `docs/m26c-machina-screen-catalog-deus-inspector.md`
- `docs/m26b-machina-handoff-dom-adoption.md`
- `docs/m25-machina-0_3-inventory-adoption-plan.md`

## Screen catalog metadata added

M26C adds a canonical Machina screen catalog in `src/Leviathan.Web/src/machina/screenCatalog.ts` using:

- `defineMachinaScreens`
- `defineMachinaViewports`
- `createViewportMatrix`
- `expandScreenViewportTasks`

Covered named screens:

- `apps-route`
- `scheduling-landing`
- `provider-setup`
- `public-booking`
- `booking-confirmation`
- `cancelled-rescheduled`
- `payment-required`
- `notification-summary`

Each screen now carries first-class metadata for:

- `screenKey`
- `title`
- `route`
- `fixture` when applicable
- `tags`
- viewport coverage
- legacy screen artifact base name
- `productArea`
- `captureSource`
- `supportsLiveRoute`
- expected snapshot assertions used by the local Playwright suite
- optional snapshot-only `debugOverlayByViewport`

This catalog is metadata-only. It does not replace:

- the current Scheduling fixture resolver in `fixtures.ts`
- route parsing
- live route persistence
- Playwright execution

## Mapping to current fixture/live routes

The catalog keeps the current route families intact:

- `/apps`
- `/apps/scheduling`
- `/apps/scheduling/setup`
- `/book/:providerSlug`
- `/book/:providerSlug/confirmed/:bookingId`
- `/apps/scheduling/bookings`

Fixture-backed snapshot routes still use the existing `fixture=` convention. Live backend smoke still drives the real app-local routes and now optionally adds `debugOverlay=nonInteractiveOverlay` only in test mode.

## Playwright and handoff changes

`tests/support/uiSnapshotMatrix.ts` now consumes the shared Machina screen catalog instead of defining a separate app-local screen list.

Preserved:

- legacy case names such as `apps-route-desktop` and `public-booking-phone`
- legacy artifact folders under `test-results/ui-snapshots/` and `test-results/ui-snapshots-real/`
- compatibility artifact files:
  - `screenshot.png`
  - `dom-summary.json`
  - `machina-snapshot.json`
  - `handoff.json`

Added:

- catalog-derived tags in handoff output
- catalog-derived metadata in handoff output
- direct test assertions against the generated `handoff.json`

Observed current `public-booking-phone/handoff.json` still contains the existing compatibility keys plus new metadata:

- existing keys preserved: `testName`, `route`, `capturedRoute`, `fixture`, `viewport`, `screenshotPath`, `domSummaryPath`, `machinaSnapshotPath`, `visibleTextExcerpt`, `machinaNodeCount`
- existing M26B compatibility structures preserved: `artifacts`, top-level `machina`, `dom-summary.json` `machina`
- new additive fields used by M26C: `screenKey`, `viewportKey`, `tags`, `artifactBaseName`, `metadata`

## Artifact naming preservation

Artifact naming stayed stable.

Verified examples:

- `test-results/ui-snapshots/apps-route-desktop/`
- `test-results/ui-snapshots/public-booking-phone/`
- `test-results/ui-snapshots-real/real-confirmed-booking/`

The screen catalog keeps a legacy per-screen artifact base name in metadata, but the final bundle folder names and final compatibility file names remain unchanged.

## `nonInteractiveOverlay` evaluation

### What was evaluated

M26C found the `MachinaReactView` instantiation in `src/Leviathan.Web/src/machina/MachinaHost.tsx` and verified that the upstream controlled `debugOverlay` prop can be passed safely.

M26C then added a test-only query path:

- `?debugOverlay=nonInteractiveOverlay`

Behavior adopted:

- overlay is not enabled by default
- overlay is only requested explicitly in snapshot/test routes
- the current docked inspector remains the default `?debug=1` experience
- the snapshot bridge still runs because `?debug=1` is unchanged

### Result

Adoption is safe for test/snapshot use.

Verified:

- overlay labels and borders render on selected snapshot cases
- overlay does not consume layout space
- overlay uses pointer-events none via the upstream Machina overlay behavior
- the real backend smoke flow completes with `debugOverlay=nonInteractiveOverlay`, which gives practical evidence that overlay mode did not block the live booking/setup/cancel path

Selected overlay-enabled cases:

- `apps-route-desktop`
- `public-booking-phone`
- real backend smoke route family while running `npm run test:e2e:real`

## DeusMachina inspector-state evaluation

### Current behavior inventory

Before M26C, Leviathan owned inspector state with two local booleans:

- `debugEnabled`
- `inspectorOpen`

The docked inspector panel also doubled as a layout region, so switching fully to upstream overlay behavior would have been more invasive than the milestone allowed.

### M26C outcome

M26C adopts a small adapter in `src/Leviathan.Web/src/machina/inspectorBehavior.ts`.

The adapter:

- parses `debugOverlay` query intent
- keeps existing `?debug=1` behavior as the docked interactive panel
- maps the chosen mode through `getMachinaDebugOverlayBehavior`
- returns a small typed result:
  - `mode`
  - `showDockedPanel`
  - `showOverlay`
  - `overlayPointerMode`
  - `consumesLayoutSpace`
  - `showLabels`
  - `showBorders`

Mode mapping now behaves as:

- normal route: `collapsed`
- `?debug=1`: `interactivePanel`
- `?debug=1&debugOverlay=nonInteractiveOverlay`: `nonInteractiveOverlay`

### Adopted or deferred?

Partially adopted.

Adopted now:

- upstream Deus behavior contract via `getMachinaDebugOverlayBehavior`
- a Leviathan-local adapter that standardizes the mode decision

Deferred:

- replacing the current docked panel with a pure Deus state machine
- migrating the existing panel toggle and persistence to `createMachinaDebugOverlayMachine`

Reason for deferral:

- the current docked inspector is still a real layout region and a product-adjacent debugging surface
- a full machine migration would have mixed evaluation work with a larger rendering/state refactor
- M26C converges cleanly with the adapter and verified overlay test path

## Screenshot verification status

Manually inspected generated screenshots for:

- `apps-route-desktop`
- `scheduling-landing-desktop`
- `public-booking-phone`
- `real-confirmed-booking`

Observed:

- `apps-route-desktop` shows the non-interactive overlay labels and borders without the docked inspector panel
- `scheduling-landing-desktop` still shows the existing docked inspector under plain `?debug=1`
- `public-booking-phone` still reads cleanly on phone and was not visually worsened by the overlay
- `real-confirmed-booking` renders the real confirmation path with overlay labels and preserved handoff artifacts

## Tests run

Frontend verification run on Windows:

- `cd src/Leviathan.Web`
- `npm install`
- `npx playwright install chromium`
- `npm run build`
- `npm test -- --run`
- `npm run test:e2e`
- `npm run test:e2e:real`

Observed results:

- `npm install`: passed
- `npx playwright install chromium`: passed
- `npm run build`: passed
- `npm test -- --run`: passed
- `npm run test:e2e`: passed
- `npm run test:e2e:real`: passed

Backend verification:

- not run
- no backend files were changed

## Known limitations

- the canonical screen catalog currently drives the Playwright snapshot metadata layer, not runtime route resolution
- real backend smoke bundles still use route-derived names such as `real-confirmed-booking` rather than catalog task keys
- the docked inspector and overlay are intentionally dual-mode for now instead of fully unified
- overlay enablement is query-driven and test-oriented, not a generalized user-facing debug mode selector

## Recommended next milestone

Recommended next step:

- `M26D`: deeper inspector overlay/docked panel unification if the team wants to push beyond the current adapter-based evaluation

Other viable next steps:

- `M27`: Scheduling provider UX polish using standardized handoff artifacts
- `M27 alternative`: mobile real-backend smoke plus reschedule browser coverage
