# Leviathan M26A: MachinaLayout.JS 0.3.0 Low-Risk Adoption

## Purpose

M26A adopts the low-risk portions of MachinaLayout.JS 0.3.0 that M25 identified as ready for Leviathan:

- stack geometry helpers for local shell/layout arithmetic;
- viewport matrix helpers for Playwright snapshot metadata.

This milestone intentionally avoids product changes, Scheduling redesign, backend behavior changes, and any handoff/DOM schema migration.

## Stack geometry helpers adopted

M26A adopted these helpers in Leviathan layout code or validation tests:

- `getArrangeContentRect`
- `getStackContentRect`
- `getStackMainAxisMetrics`
- `getRemainingStackRect`

`getArrangeContentRect` is now used by Scheduling and shared Machina layout builders to express padding/content-region sizing directly instead of repeating raw padding subtraction. The resolved-layout helpers are covered in tests so the real resolved stack content and remaining regions stay explicit.

## Files changed

- `src/Leviathan.Web/src/apps/scheduling/layouts.ts`
- `src/Leviathan.Web/src/machina/layouts.ts`
- `src/Leviathan.Web/src/machina/layouts.test.ts`
- `src/Leviathan.Web/tests/ui-snapshot.spec.ts`
- `src/Leviathan.Web/tests/support/uiSnapshotMatrix.ts`
- `src/Leviathan.Web/src/machina/uiSnapshotMatrix.test.ts`
- `docs/m25-machina-0_3-inventory-adoption-plan.md`
- `docs/m26a-machina-0_3-low-risk-adoption.md`

## Before/after local workaround summary

### Scheduling

Before M26A, Scheduling manually derived content and sidebar dimensions with direct subtraction such as root height minus hero/inspector heights and fixed `32` padding compensation.

After M26A, Scheduling keeps the existing visual constants but routes content-region sizing through Machina stack geometry:

- inspector height remains unchanged;
- hero height remains unchanged;
- root remaining height is isolated in `getSchedulingRemainingHeight`;
- content padding compensation comes from `getArrangeContentRect` instead of handwritten `- 32` calculations;
- debug labels and stable row ids remain unchanged.

### Shared Machina / RustSimulator

Before M26A, RustSimulator side panel sizing manually subtracted the navigation height and shell padding.

After M26A, RustSimulator keeps equivalent behavior while using Machina's arrange content rect to size the side panel from the stack content region. The shell route/state/dispatch logic was not touched.

## Viewport matrix helper adoption

Playwright snapshot metadata now uses Machina 0.3.0 viewport/screen helpers:

- `defineMachinaViewports`
- `createViewportMatrix`
- `defineMachinaScreens`
- `expandScreenViewportTasks`

The local viewport dimensions intentionally preserve the prior Leviathan snapshot contract:

- desktop: `1440x1024`
- tablet: `768x1024`
- phone: `390x844`

The upstream task metadata is mapped back to the existing hyphenated snapshot names so artifact folder names remain stable, e.g. `scheduling-landing-desktop` rather than the upstream default `scheduling-landing__desktop`.

## Handoff/DOM migration deferred to M26B

M26A does **not** migrate `tests/support/uiSnapshot.ts` to `writeMachinaHandoffBundle`, and it does **not** replace Leviathan's custom DOM extraction with `summarizeMachinaDom`.

The following remain intentionally unchanged for compatibility:

- handoff artifact folder names;
- handoff JSON shape;
- custom DOM summary extraction;
- Machina snapshot capture contract.

## Tests run

- `cd src/Leviathan.Web && npm install`
- `cd src/Leviathan.Web && npm run build`
- `cd src/Leviathan.Web && npm test -- --run`
- `cd src/Leviathan.Web && npm run test:e2e` (blocked by missing Playwright browser executable after browser download was forbidden)
- `cd src/Leviathan.Web && npm run test:e2e:real` (script-level run skipped; explicit `LEVIATHAN_REAL_SMOKE=1 npx playwright test tests/scheduling-real-backend-smoke.spec.ts` was blocked by the same missing browser executable)

## Screenshots/e2e verification status

Playwright snapshot verification was attempted after the layout helper adoption, but this environment could not download or launch the Playwright Chromium executable. Unit coverage verifies that the snapshot matrix still covers:

- `/apps` desktop/tablet/phone;
- `/apps/scheduling` landing desktop/tablet/phone;
- provider setup;
- public booking desktop/tablet/phone;
- confirmation;
- cancellation/reschedule;
- payment required;
- notification summary.

Generated screenshots and handoff artifacts were treated as verification output and were not intentionally committed.

## Remaining local workarounds

- Scheduling and RustSimulator still retain product-specific breakpoints and visual constants because M26A is not a UI redesign.
- Apps shell inspector sizing still uses its prior local formula because it was outside the Scheduling/RustSimulator low-risk target.
- Handoff and DOM summary code remains custom until M26B.
- Snapshot screen metadata still maps to existing fixture routes rather than introducing a broader screen catalog convention.

## Recommended M26B

M26B should migrate the higher-contract inspection/handoff pieces together:

- migrate DOM summary extraction to `summarizeMachinaDom`;
- migrate handoff manifest writing to `writeMachinaHandoffBundle`;
- preserve compatibility fields and artifact naming during the migration;
- add screen catalog metadata beside current fixture routing.
