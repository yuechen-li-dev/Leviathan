# Leviathan M25: MachinaLayout.JS 0.3.0 Inventory and Adoption Plan

## Purpose

M25 inventories the updated vendored MachinaLayout.JS 0.3.0 capability surface, compares it against the M24.5 friction report, and defines a safe Leviathan adoption order.

This milestone stays inventory-first:

- no vendor source edits;
- no Scheduling UI redesign;
- no broad refactor to new Machina APIs;
- no removal of existing Leviathan helpers/workarounds without separate verification.

## Version and source inventory

### Confirmed package/version state

- Vendored reference tree: `vendor/MachinaLayout.JS`
- Vendored tree contents: `docs/`, `samples/`, `src/`
- Vendored tree does not include its own `package.json`, so version metadata is not embedded in the vendored folder itself.
- Leviathan frontend dependency before M25: `machinalayout:^0.2.0`
- Installed frontend package before M25: `machinalayout@0.2.0`
- Published npm latest confirmed during M25: `machinalayout@0.3.0`
- Leviathan frontend dependency after M25 verification update: `machinalayout:^0.3.0`
- Installed frontend package after `npm install`: `machinalayout@0.3.0`

### Public export summary

Root export surface in the vendored `src/index.ts` includes:

- core layout/types/errors/validation helpers;
- row compilation and root selection;
- frame/layout resolution;
- tree conversion and formatting helpers;
- `stackGeometry` helpers;
- React adapter exports;
- MachinaText exports;
- interpolation helpers;
- screen catalog / viewport helpers.

New 0.3.0 subpath exports confirmed from the published package metadata:

- `machinalayout/inspect`
- `machinalayout/handoff`
- `machinalayout/deus`

Existing Leviathan imports remain valid:

- `machinalayout`
- `machinalayout/react`
- `machinalayout/text/react`
- `machinalayout/dispatch`

No Leviathan import rename was required for the 0.3.0 compile/build path.

### New source files vs Leviathan's prior 0.2.0 package

The vendored 0.3.0 tree contains these notable new source areas relative to the previously installed 0.2.0 package:

- `src/stackGeometry.ts`
- `src/screenCatalog.ts`
- `src/inspect/*`
- `src/handoff/*`
- `src/deus/*`

These directly map to the M24.5 requested capability areas.

### Changed docs vs Leviathan's prior 0.2.0 package

New docs present in the vendored 0.3.0 tree:

- `docs/stack-geometry-helpers.md`
- `docs/screen-catalog-and-viewports.md`
- `docs/inspection-and-handoff.md`
- `docs/deusmachina.md`

Docs changed relative to the prior installed package:

- `docs/react-adapter.md`
- `docs/error-codes.md`

The changed docs matter because they document:

- controlled debug overlay modes;
- stable DOM debug attributes as inspection input;
- new error codes for stack queries and screen/viewport metadata.

### Tests added/changed

- No vendored upstream test directory was present in `vendor/MachinaLayout.JS`.
- M25 therefore inventories upstream capability from vendored `src/` and `docs/`, not from vendored test files.
- Leviathan added one local compatibility test:
  - `src/Leviathan.Web/src/machina/machinaLayout030Compat.test.ts`

## New upstream features relevant to Leviathan

### 1. Remaining-rect helpers after fixed siblings, padding, and gaps

Solved in upstream 0.3.0:

- `getArrangeContentRect`
- `getStackContentRect`
- `getStackMainAxisMetrics`
- `getRemainingStackRect`

Relevant files:

- `vendor/MachinaLayout.JS/src/stackGeometry.ts`
- `vendor/MachinaLayout.JS/docs/stack-geometry-helpers.md`

These are the clearest match for the M24.5 `P0` arithmetic pain in Scheduling and RustSimulator shells.

### 2. Screen catalog / fixture-screen support

Partially solved:

- `defineMachinaScreens`
- `MachinaScreen`
- `MachinaScreenCatalog`

Relevant files:

- `vendor/MachinaLayout.JS/src/screenCatalog.ts`
- `vendor/MachinaLayout.JS/docs/screen-catalog-and-viewports.md`

Upstream now standardizes screen metadata shape, but not Leviathan's route-to-screen resolution runtime.

### 3. Viewport matrix helpers

Solved for metadata, not for execution:

- `createViewportMatrix`
- `defineMachinaViewports`
- `expandScreenViewportTasks`

Relevant files:

- `vendor/MachinaLayout.JS/src/screenCatalog.ts`
- `vendor/MachinaLayout.JS/docs/screen-catalog-and-viewports.md`

Upstream intentionally does not run Playwright or drive browsers.

### 4. Handoff bundle schema

Solved:

- `writeMachinaHandoffBundle`
- `MachinaHandoffBundleManifest`
- `MachinaScreenViewportTask` composition

Relevant files:

- `vendor/MachinaLayout.JS/src/handoff/types.ts`
- `vendor/MachinaLayout.JS/src/handoff/writeMachinaHandoffBundle.ts`
- `vendor/MachinaLayout.JS/docs/inspection-and-handoff.md`

### 5. Screenshot/layout overlay mode

Partially solved:

- controlled `debugOverlay` prop on `MachinaReactView`
- `nonInteractiveOverlay` mode
- optional labels and borders

Relevant files:

- `vendor/MachinaLayout.JS/src/react/MachinaReactView.tsx`
- `vendor/MachinaLayout.JS/src/deus/debugOverlay.ts`
- `vendor/MachinaLayout.JS/docs/react-adapter.md`

Upstream does not capture screenshots itself; it only standardizes overlay rendering behavior.

### 6. Debug overlay with rect borders and labels

Solved at adapter level:

- label rendering
- border rendering
- pointer mode separation

Relevant files:

- `vendor/MachinaLayout.JS/src/react/MachinaReactView.tsx`
- `vendor/MachinaLayout.JS/src/deus/debugOverlay.ts`

### 7. DOM summary helpers

Solved:

- `summarizeMachinaDom`
- standardized summary schema

Relevant files:

- `vendor/MachinaLayout.JS/src/inspect/types.ts`
- `vendor/MachinaLayout.JS/src/inspect/summarizeMachinaDom.ts`
- `vendor/MachinaLayout.JS/docs/inspection-and-handoff.md`

### 8. Per-slot padding/gap helpers

Partially solved:

- stack content rect and main-axis metrics expose padding/gap effects cleanly;
- there is not a distinct "per-slot shell helper" abstraction.

Relevant files:

- `vendor/MachinaLayout.JS/src/stackGeometry.ts`

### 9. Inspector-specific layout region patterns

Not addressed as a shell abstraction.

Upstream provides:

- overlay behavior semantics;
- query helpers for shell math.

Upstream does not provide:

- `defineInspectorShell(...)`
- a shell-specific layout DSL for hero/content/sidebar/inspector regions.

### 10. Mobile inspector ergonomics

Partially solved:

- `nonInteractiveOverlay` reduces automation friction;
- no mobile-specific inspector dock/placement ergonomics were found.

### 11. Route/screen fixture metadata conventions

Partially solved:

- screen metadata now has `route`, `fixture`, `viewports`, `tags`, `title`, `metadata`;
- route parsing, query conventions, and screen selection remain app-local.

## Mapping against the M24.5 friction report

| Friction / requested feature | Status in MachinaLayout.JS 0.3.0 | Relevant files / exports / docs | Leviathan currently has workaround? | Recommended adoption step | Risk | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| Remaining interactive rect after fixed siblings, padding, and gaps | solved | `stackGeometry.ts`, `getStackContentRect`, `getStackMainAxisMetrics`, `getRemainingStackRect`, `docs/stack-geometry-helpers.md` | yes; manual height/width math in Scheduling and RustSimulator layouts | adopt first in M26 inside layout helpers only | low | P0 |
| Canonical screen catalog / fixture-screen support | partially solved | `screenCatalog.ts`, `defineMachinaScreens`, `docs/screen-catalog-and-viewports.md` | yes; fixture key and route conventions in `fixtures.ts` and Playwright specs | add screen catalog alongside existing fixture routing, do not replace runtime resolution yet | low | P1 |
| Responsive viewport matrix support | solved | `createViewportMatrix`, `defineMachinaViewports`, `expandScreenViewportTasks` | yes; viewport constants and case lists in `tests/ui-snapshot.spec.ts` | adopt in Playwright metadata generation first, keep exact route assertions | low | P1 |
| Standard handoff bundle schema | solved | `machinalayout/handoff`, `writeMachinaHandoffBundle`, `docs/inspection-and-handoff.md` | yes; custom `handoff.json` generation in `tests/support/uiSnapshot.ts` | adopt after viewport task metadata to preserve artifact naming continuity | medium | P1 |
| Screenshot + overlay mode | partially solved | `MachinaReactView` `debugOverlay`, `docs/react-adapter.md` | yes; Leviathan has separate debug inspector UI and no Machina overlay usage | evaluate in snapshot-only path first; avoid mixing with existing panel immediately | medium | P1 |
| Non-intercepting debug overlay / inspector behavior | solved for overlay, not Leviathan panel | `deus/debugOverlay.ts`, `MachinaReactView.tsx` | yes; smoke test manually collapses inspector before interaction | keep local collapse workaround for current panel; consider overlay migration later | medium | P1 |
| Canonical DOM summary helper | solved | `machinalayout/inspect`, `summarizeMachinaDom`, `inspect/types.ts`, `docs/inspection-and-handoff.md` | yes; custom DOM extraction in `tests/support/uiSnapshot.ts` | adopt after handoff schema so both artifacts move together | medium | P1 |
| Per-slot padding/gap helpers | partially solved | `getStackMainAxisMetrics`, `getStackContentRect` | yes; manual `- 32`, content height and sidebar math | absorb indirectly when remaining-rect helpers land | low | P2 |
| Inspector-specific region patterns | not addressed | none found beyond overlay behavior | yes; explicit `debug-inspector` row and size math | keep local helper pattern | low | P2 |
| Mobile inspector ergonomics | partially solved | `nonInteractiveOverlay` mode only | yes; current inspector remains a docked fixed region | revisit only after overlay strategy decision | medium | P2 |
| Route / screen fixture metadata conventions | partially solved | `MachinaScreen` metadata fields | yes; `fixture=` and path inference in `fixtures.ts` | map current convention into screen catalog metadata without changing route behavior | low | P2 |

## Local Leviathan workaround inventory

| Local workaround | What it does today | Upstream 0.3.0 overlap | Recommendation |
| --- | --- | --- | --- |
| `src/Leviathan.Web/src/apps/scheduling/layouts.ts` manual `contentHeight`, sidebar height, narrow sidebar height, inspector height | hand-computes remaining shell space for wide/narrow Scheduling layouts | strong overlap via `getStackContentRect` and `getRemainingStackRect` | keep in M25, replace first in M26 |
| `src/Leviathan.Web/src/machina/layouts.ts` manual RustSimulator side-panel math | manually sizes content and side panel inside padded/gapped shell | strong overlap via stack geometry helpers | keep in M25, replace with same pattern as Scheduling in M26 |
| `src/Leviathan.Web/tests/ui-snapshot.spec.ts` desktop/tablet/phone constants and repeated case metadata | local viewport matrix and route matrix | strong overlap via `createViewportMatrix` and `expandScreenViewportTasks` | keep behavior, adopt metadata helpers in M26 |
| `src/Leviathan.Web/tests/support/uiSnapshot.ts` custom DOM summary extraction | emits local DOM summary JSON from `data-machina-*` nodes | strong overlap via `summarizeMachinaDom` | keep until handoff schema and DOM summary move together |
| `src/Leviathan.Web/tests/support/uiSnapshot.ts` custom `handoff.json` writer | writes local screenshot/summary/snapshot manifest | strong overlap via `writeMachinaHandoffBundle` | keep in M25, replace after artifact naming migration plan |
| `src/Leviathan.Web/src/apps/scheduling/fixtures.ts` `fixture=` route convention and scenario catalog | app-local screen catalog with path inference fallback | partial overlap via `defineMachinaScreens` metadata | keep runtime behavior, add parallel metadata catalog later |
| `src/Leviathan.Web/tests/scheduling-real-backend-smoke.spec.ts` `closeInspector(page)` | collapses Leviathan inspector so it does not interfere with automation | partial overlap; Machina overlay has `pointer-events: none`, but Leviathan inspector is still separate UI | keep until Leviathan debug panel strategy changes |
| `src/Leviathan.Web/src/apps/scheduling/views.tsx` query-preserving helpers and live route context storage | carries route/query identity across setup, booking, confirmation, bookings | only weak overlap via screen metadata | keep; upstream does not replace this |
| `src/Leviathan.Web/src/machina/debugInspector.ts` local snapshot bridge and shell summary contract | exports Leviathan-specific debug snapshot JSON | weak overlap; upstream standardizes DOM summary/handoff, not full shell-state debug bridge | keep |

### Workarounds that look removable later

Most likely removable or reducible after M26 adoption:

- manual remaining-space math in `src/Leviathan.Web/src/apps/scheduling/layouts.ts`
- manual remaining-space math in `src/Leviathan.Web/src/machina/layouts.ts`
- local viewport preset constants in `src/Leviathan.Web/tests/ui-snapshot.spec.ts`
- custom DOM summary extraction in `src/Leviathan.Web/tests/support/uiSnapshot.ts`
- custom handoff manifest writing in `src/Leviathan.Web/tests/support/uiSnapshot.ts`

Workarounds that still appear app-specific even after 0.3.0:

- live Scheduling route/query persistence;
- fixture routing fallback logic;
- Leviathan-specific debug snapshot bridge;
- inspector-as-layout-panel UI pattern.

## Compatibility status

### Compile/import status

- Existing Leviathan imports compiled unchanged against `machinalayout@0.3.0`.
- No import path rename was required.
- New upstream helper availability was verified locally with:
  - `src/Leviathan.Web/src/machina/machinaLayout030Compat.test.ts`

### Compatibility verification change performed

M25 performed only these code changes:

- bumped `src/Leviathan.Web/package.json` from `machinalayout:^0.2.0` to `machinalayout:^0.3.0`;
- refreshed `src/Leviathan.Web/package-lock.json` via `npm install`;
- added a small compat test proving the 0.3.0 screen/viewport helpers resolve and behave as expected.

### Tiny adoption spike

No production adoption spike was performed.

Reason:

- the safest M25 outcome is inventory + dependency verification without changing Scheduling behavior or replacing existing test artifact contracts midstream.

## Recommended M26 adoption order

1. Adopt remaining-rect helpers in Scheduling shell/layouts and then RustSimulator shell/layouts.
2. Adopt viewport matrix helpers in Playwright snapshot metadata while keeping existing route assertions and artifact folders stable.
3. Adopt the standardized handoff bundle schema, ideally in the same pass as DOM summary migration so artifact contracts move together.
4. Add a parallel Machina screen catalog for Scheduling fixtures and live-screen metadata without replacing current runtime route resolution yet.
5. Revisit debug overlay / phone inspector ergonomics only after deciding whether Leviathan keeps a docked inspector panel, switches to Machina overlay mode, or supports both.

## M26A follow-up

M26A adopted the low-risk 0.3.0 helpers only:

- Scheduling layout and RustSimulator shell math now query resolved stack geometry instead of carrying local `- 32` remaining-rect arithmetic.
- Playwright snapshot metadata now expands from Machina screen + viewport helpers while preserving the existing legacy snapshot names and handoff artifact folders.

Still deferred to M26B:

- DOM summary migration to `summarizeMachinaDom`
- handoff manifest writing migration to `writeMachinaHandoffBundle`
- any handoff JSON shape or artifact naming changes
- broader screen catalog conventions beyond the snapshot metadata layer

## Remaining upstream gaps

- no upstream Playwright/browser runner;
- no upstream screenshot capture;
- no upstream visual diff workflow;
- no shell-specific `hero/content/sidebar/inspector` layout abstraction;
- no route/query preservation helper for live multi-screen flows;
- no mobile inspector docking or narrow-shell inspector pattern;
- no replacement for Leviathan's full debug snapshot bridge.

## Risks

- handoff schema migration can silently break downstream artifact expectations if file names or JSON fields change in one pass;
- DOM summary migration should preserve the existing useful data surface Leviathan relies on, especially route context and text excerpts;
- overlay adoption could create duplicate debug surfaces if Leviathan keeps its current inspector panel and also enables Machina overlay rendering;
- viewport helper adoption is low-risk, but route matrices still need app-local assertions and mock/live split awareness;
- remaining-rect helper adoption is safest when done in one isolated layout file at a time with screenshot verification.

## Tests run

Frontend:

- `cd src/Leviathan.Web`
- `npm install`
- `npm run build`
- `npm test -- --run`
- `npm run test:e2e`
- `npm run test:e2e:real`

Backend:

- `dotnet restore Leviathan.slnx`
- `dotnet build Leviathan.slnx`
- `dotnet test Leviathan.slnx`

Observed results in this environment:

- `npm install`: passed
- `npm run build`: passed
- `npm test -- --run`: passed
- `npm run test:e2e`: passed
- `npm run test:e2e:real`: passed
- `dotnet restore Leviathan.slnx`: passed
- `dotnet build Leviathan.slnx`: passed with existing xUnit analyzer warnings only
- `dotnet test Leviathan.slnx`: passed

## Outcome

M25 reached success:

- Leviathan is now verified against published `machinalayout@0.3.0`;
- the biggest M24.5 friction items are concretely mapped to upstream 0.3.0 helpers;
- the next safe adoption steps are isolated without forcing a broad refactor.

## M26B follow-up

M26B adopted the higher-contract Machina 0.3 helpers identified in this plan:

- custom DOM summary extraction now routes through `summarizeMachinaDom` with a Leviathan compatibility wrapper that preserves the existing flat node list and route/text/rect fields
- handoff writing now routes through `writeMachinaHandoffBundle` with compatibility-mapped final artifact names and preserved legacy `handoff.json` fields
- upstream task metadata now surfaces in `handoff.json` when a `MachinaScreenViewportTask` is available without changing the existing bundle folder names

Still deferred beyond M26B:

- broader screen catalog conventions outside the current snapshot workflow
- any deliberate debug overlay migration such as `nonInteractiveOverlay`
- shell-specific layout abstractions and route/query helpers that remain app-local

## M26C follow-up

M26C closes part of the remaining gap called out here:

- the screen catalog is now first-class in Leviathan metadata rather than living only inside the snapshot matrix helper
- `nonInteractiveOverlay` was evaluated and adopted for explicit snapshot/test routes
- inspector mode selection now routes through a small Deus-aware adapter while the existing docked inspector remains intact

See:

- `docs/m26c-machina-screen-catalog-deus-inspector.md`
