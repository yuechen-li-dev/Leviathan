# Leviathan M26B: MachinaLayout.JS 0.3 Handoff and DOM Adoption

## Purpose

M26B adopts the upstream MachinaLayout.JS 0.3 inspection and handoff helpers in Leviathan while preserving the artifact contract already used by the local ChatGPT/Codex screenshot handoff workflow.

Adopted upstream pieces:

- `summarizeMachinaDom`
- `writeMachinaHandoffBundle`

Still intentionally local:

- Playwright browser launch and screenshot capture
- real backend startup
- route and query persistence
- Leviathan shell/debug snapshot bridge
- Scheduling-specific state semantics

## Current artifact contract before migration

Before M26B, each bundle directory contained:

- `screenshot.png`
- `dom-summary.json`
- `machina-snapshot.json`
- `handoff.json`

Legacy bundle directories already in use included names such as:

- `apps-route-desktop`
- `provider-setup-desktop`
- `public-booking-phone`
- `real-confirmed-booking`
- `real-booking-cancelled`

### Legacy `dom-summary.json` top-level fields

Before migration, `dom-summary.json` contained:

- `route`
- `generatedAt`
- `rootIds`
- `visibleTextExcerpt`
- `nodes`

Legacy DOM node entries contained:

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
- `textExcerpt`
- `boundingBox`

### Legacy `machina-snapshot.json` top-level fields

The current Machina debug snapshot file continued to contain Leviathan-local shell/debug data:

- `snapshot`
- `shellSummary`
- `layoutNodes`
- `recentEvents`
- `fullState`
- `inspectorOpen`

M26B does not replace or remove this file.

### Legacy `handoff.json` top-level fields

Before migration, `handoff.json` contained:

- `testName`
- `route`
- `capturedRoute`
- `generatedAt`
- `viewport`
- `screenshotPath`
- `domSummaryPath`
- `machinaSnapshotPath`
- `visibleTextExcerpt`
- `machinaNodeCount`

## Upstream helpers adopted

### DOM summary

Leviathan now routes DOM summary generation through `summarizeMachinaDom`.

Implementation notes:

- Playwright still gathers the real browser page HTML and the measured browser rect data.
- Leviathan runs `summarizeMachinaDom` against the captured DOM markup.
- Leviathan patches the upstream summary rects with the real browser `getBoundingClientRect()` values gathered during the Playwright capture pass.
- Leviathan keeps the legacy flat node list so downstream prompts and docs do not break.

### Handoff writer

Leviathan now routes bundle writing through `writeMachinaHandoffBundle`.

Implementation notes:

- Playwright still captures the screenshot locally.
- Leviathan still captures `machina-snapshot.json` through the existing debug snapshot bridge.
- The upstream writer runs in a temporary bundle staging directory.
- Leviathan writes the final stable bundle files back to the existing artifact names:
  - `screenshot.png`
  - `dom-summary.json`
  - `machina-snapshot.json`
  - `handoff.json`

This preserves the local artifact names while still adopting the upstream writer and manifest shape.

## New artifact contract after migration

### `dom-summary.json`

After M26B, `dom-summary.json` keeps the legacy Leviathan fields and adds the upstream Machina summary:

- `schemaVersion`
- `rootSelector`
- `route`
- `generatedAt`
- `rootIds`
- `visibleTextExcerpt`
- `nodes`
  - still the legacy flat Leviathan node array
- `machina`
  - upstream hierarchical `summarizeMachinaDom` output

Compatibility notes:

- existing consumers can keep reading `nodes`, `route`, `visibleTextExcerpt`, and `rootIds` exactly as before
- new consumers can read `machina.nodes` for the upstream tree shape
- route/text/rect/debug-label data were preserved rather than dropped

### `handoff.json`

After M26B, `handoff.json` preserves the legacy Leviathan path and metadata fields while also carrying the upstream manifest:

- `schemaVersion`
- `createdAt`
- `generatedAt`
- `testName`
- `route`
- `capturedRoute`
- `fixture` when available
- `screenKey` when a `MachinaScreenViewportTask` is available
- `viewportKey` when a `MachinaScreenViewportTask` is available
- `viewport`
- `tags` when upstream task metadata is available
- `artifactBaseName`
- `artifacts`
- `screenshotPath`
- `domSummaryPath`
- `machinaSnapshotPath`
- `visibleTextExcerpt`
- `machinaNodeCount`
- `machina`
  - upstream-compatible manifest metadata

Compatibility notes:

- existing consumers can keep using `testName`, `route`, `capturedRoute`, `viewport`, the three relative artifact paths, `visibleTextExcerpt`, and `machinaNodeCount`
- the upstream-compatible manifest data now lives in both top-level standardized fields and nested `machina`
- final `artifacts` are compatibility-mapped to the stable Leviathan file names instead of the upstream slugged defaults

## Artifact naming preservation

Preserved:

- artifact root folder names remain under:
  - `src/Leviathan.Web/test-results/ui-snapshots/`
  - `src/Leviathan.Web/test-results/ui-snapshots-real/`
- per-case folder names remain unchanged, e.g.:
  - `apps-route-desktop`
  - `provider-setup-desktop`
  - `public-booking-phone`
  - `real-confirmed-booking`
  - `real-booking-cancelled`
- artifact file names remain unchanged:
  - `screenshot.png`
  - `dom-summary.json`
  - `machina-snapshot.json`
  - `handoff.json`

## Example generated bundles

Verified examples:

- `src/Leviathan.Web/test-results/ui-snapshots/apps-route-desktop/`
- `src/Leviathan.Web/test-results/ui-snapshots/provider-setup-desktop/`
- `src/Leviathan.Web/test-results/ui-snapshots/public-booking-phone/`
- `src/Leviathan.Web/test-results/ui-snapshots-real/real-confirmed-booking/`
- `src/Leviathan.Web/test-results/ui-snapshots-real/real-booking-cancelled/`

Observed current provider-setup desktop `handoff.json` keys:

- `schemaVersion`
- `createdAt`
- `generatedAt`
- `testName`
- `route`
- `capturedRoute`
- `fixture`
- `screenKey`
- `viewportKey`
- `viewport`
- `tags`
- `artifactBaseName`
- `artifacts`
- `screenshotPath`
- `domSummaryPath`
- `machinaSnapshotPath`
- `visibleTextExcerpt`
- `machinaNodeCount`
- `machina`

Observed current provider-setup desktop `dom-summary.json` keys:

- `schemaVersion`
- `rootSelector`
- `route`
- `generatedAt`
- `rootIds`
- `visibleTextExcerpt`
- `nodes`
- `machina`

## Tests run

Frontend verification run for M26B:

- `cd src/Leviathan.Web`
- `npm install`
- `npx playwright install chromium`
- `npm run build`
- `npm test -- --run`
- `npm run test:e2e`
- `npm run test:e2e:real`

Observed results:

- `npm install`: already satisfied in this workspace
- `npx playwright install chromium`: completed
- `npm run build`: passed
- `npm test -- --run`: passed
- `npm run test:e2e`: passed
- `npm run test:e2e:real`: passed

Note:

- one earlier `npm run test:e2e:real` attempt hit a transient local preview port `4173` reuse/refusal race; the rerun passed cleanly and produced the expected real-backend artifacts

## Local Playwright screenshot verification

Verified with real generated artifacts:

- mocked snapshot suite captured desktop/tablet/phone screenshots for `/apps`, `/apps/scheduling`, and public booking
- real backend smoke captured setup, slots, hold/intake, payment-required, confirmed, audit/lifecycle, and cancelled booking bundles
- inspected bundles confirmed:
  - `screenshot.png` exists
  - `dom-summary.json` contains useful Machina node data
  - `machina-snapshot.json` still exists
  - `handoff.json` still includes route/viewport/screenshot metadata
  - artifact folder names remained stable

## Remaining local responsibilities

Still owned by Leviathan rather than upstream Machina:

- Playwright browser runner setup
- screenshot capture timing and full-page options
- real backend lifecycle startup and teardown
- route/query persistence
- Leviathan debug snapshot export
- Scheduling route semantics and fixture conventions

## Recommended M26C / M27

Recommended next milestone:

- `M26C`: adopt screen catalog metadata beside current fixture routing and evaluate `nonInteractiveOverlay`

Other viable next steps:

- `M27`: Scheduling provider UX polish using standardized handoff artifacts
- `M27 alternative`: mobile real-backend smoke plus reschedule browser coverage
