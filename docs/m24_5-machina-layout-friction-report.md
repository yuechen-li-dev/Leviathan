# M24.5 MachinaLayout.JS Friction Report

## Summary

Leviathan's M22-M24 Scheduling work confirmed that MachinaLayout.JS is already a strong deterministic layout core for headless and LLM-assisted UI work, but the surrounding workflow still has recurring friction at the exact points where a layout engine becomes part of an inspection, screenshot, automation, and handoff toolchain.

The highest-leverage gaps were not "make the solver more powerful" requests. They were:

- helper support for computing remaining interactive rects after fixed siblings, padding, and gaps;
- a canonical screen catalog / fixture screen model for route-sized UI states;
- a first-class viewport matrix runner for screenshot and inspection tasks;
- a standard handoff bundle schema for screenshot + DOM summary + layout snapshot;
- better overlay and inspector ergonomics for real automation and mobile inspection.

These gaps were observed during:

- M22 headless inspection workbench setup;
- M23 fixture-backed Scheduling UI polish;
- M24 real-backend Scheduling smoke and handoff capture.

## Context: How Leviathan Uses MachinaLayout

Leviathan uses MachinaLayout as a deterministic shell/layout authority for React views. Layouts are authored as `LayoutRow[]`, resolved in the browser from viewport-sized `rootRect`, and rendered through the Machina React adapter's absolutely positioned wrappers.

Relevant Leviathan references:

- [src/Leviathan.Web/src/machina/MachinaHost.tsx](C:\Users\yuech\source\repos\Leviathan\src\Leviathan.Web\src\machina\MachinaHost.tsx)
- [src/Leviathan.Web/src/machina/layouts.ts](C:\Users\yuech\source\repos\Leviathan\src\Leviathan.Web\src\machina\layouts.ts)
- [src/Leviathan.Web/src/apps/scheduling/layouts.ts](C:\Users\yuech\source\repos\Leviathan\src\Leviathan.Web\src\apps\scheduling\layouts.ts)
- [src/Leviathan.Web/src/machina/debugInspector.ts](C:\Users\yuech\source\repos\Leviathan\src\Leviathan.Web\src\machina\debugInspector.ts)
- [src/Leviathan.Web/tests/support/uiSnapshot.ts](C:\Users\yuech\source\repos\Leviathan\src\Leviathan.Web\tests\support\uiSnapshot.ts)

The key usage pattern during M22-M24 was:

1. Resolve Machina layouts at desktop/tablet/phone viewports.
2. Render fixture-backed or real-backend Scheduling screens.
3. Capture screenshot, compact DOM summary, and debug snapshot JSON.
4. Hand that bundle to Codex/ChatGPT for targeted UI iteration.

## Friction 1: Fixed Children / Remaining Rect Calculation

Priority: `P0`

Problem:

- Leviathan repeatedly had to hand-compute the effective size for fixed children living inside padded and gapped stack parents while another fixed shell region like the debug inspector also consumed vertical space.
- In [src/Leviathan.Web/src/apps/scheduling/layouts.ts](C:\Users\yuech\source\repos\Leviathan\src\Leviathan.Web\src\apps\scheduling\layouts.ts), `contentHeight`, sidebar height, narrow sidebar height, and inspector height are all manually derived from the viewport and each other.
- The same pattern exists in [src/Leviathan.Web/src/machina/layouts.ts](C:\Users\yuech\source\repos\Leviathan\src\Leviathan.Web\src\machina\layouts.ts) for the RustSimulator shell.

Why it matters for headless/LLM UI work:

- This is exactly the sort of arithmetic that is easy for humans and models to get subtly wrong.
- The engine correctly rejects overflow, but the author still has to reverse-engineer "what rect is actually left for this child after siblings, padding, and gaps?"
- LLM-assisted layout edits become brittle when a harmless-looking inspector or sidebar tweak forces several manual height/width recalculations.

Proposed upstream helper:

- A helper that derives the remaining child rect or remaining main-axis space for a stack parent after accounting for fixed siblings, padding, and gaps.
- Optional helpers for "content rect of parent" and "remaining rect after known sibling ids".

API sketch:

```ts
const contentRect = getStackContentRect(layoutDoc, "scheduling-content");
const remaining = getRemainingStackRect(layoutDoc, {
  parentId: "root",
  axis: "vertical",
  afterChildren: ["scheduling-hero"],
  beforeChildren: ["debug-inspector"],
});
```

## Friction 2: Responsive Viewport Matrix Support

Priority: `P1`

Problem:

- M22 started with one desktop path, then M23 manually expanded into a desktop/tablet/phone matrix in Playwright.
- The matrix currently lives in Leviathan test code instead of a reusable Machina-oriented helper.
- Real-backend smoke in M24 intentionally stayed on a single desktop path because a broader matrix is still expensive to hand-maintain.

Where it occurred:

- [src/Leviathan.Web/tests/ui-snapshot.spec.ts](C:\Users\yuech\source\repos\Leviathan\src\Leviathan.Web\tests\ui-snapshot.spec.ts)
- [docs/m22-headless-ui-inspection-workbench.md](C:\Users\yuech\source\repos\Leviathan\docs\m22-headless-ui-inspection-workbench.md)
- [docs/m23-scheduling-ui-polish-handoff.md](C:\Users\yuech\source\repos\Leviathan\docs\m23-scheduling-ui-polish-handoff.md)

Why it matters:

- Responsive UI work is much easier when "rerun the same route/screen set across standard viewports" is built in.
- Models can reason about named viewport presets more reliably than ad hoc width/height constants scattered through test files.

Proposed upstream helper:

- A canonical viewport preset matrix and runner abstraction suitable for screenshot and debug-snapshot workflows.

API sketch:

```ts
const matrix = createViewportMatrix("standard-responsive");

for (const viewport of matrix) {
  await captureMachinaScreen({ route, viewport });
}
```

## Friction 3: Screen Catalog / Fixture State Support

Priority: `P1`

Problem:

- M23 had to invent a route + `fixture=` convention for full-screen Scheduling states.
- M22 explicitly called out the lack of a screen catalog or story-like route matrix.
- This worked well, but it is still app-local convention rather than an upstream pattern.

Where it occurred:

- [src/Leviathan.Web/src/apps/scheduling/fixtures.ts](C:\Users\yuech\source\repos\Leviathan\src\Leviathan.Web\src\apps\scheduling\fixtures.ts)
- [docs/m22-headless-ui-inspection-workbench.md](C:\Users\yuech\source\repos\Leviathan\docs\m22-headless-ui-inspection-workbench.md)
- [docs/m23-scheduling-ui-polish-handoff.md](C:\Users\yuech\source\repos\Leviathan\docs\m23-scheduling-ui-polish-handoff.md)

Why it matters:

- Headless UI iteration gets much cheaper when named screens are first-class and discoverable.
- LLM workflows benefit from a stable mapping between route, fixture key, expected nodes, viewport set, and artifact output.

Proposed upstream helper:

- A screen catalog abstraction that pairs a route-sized layout state with metadata, fixtures, and viewport expectations.

API sketch:

```ts
const screens = defineMachinaScreens([
  {
    key: "provider-setup",
    route: "/apps/scheduling/setup",
    fixture: "provider-setup",
    viewports: ["desktop", "tablet", "phone"],
    tags: ["scheduling", "setup"],
  },
]);
```

## Friction 4: Standard Handoff Bundle Schema

Priority: `P1`

Problem:

- Leviathan created a useful bundle format with `screenshot.png`, `dom-summary.json`, `machina-snapshot.json`, and `handoff.json`.
- The format is proving valuable, but it is an app-local contract rather than a documented upstream schema.

Where it occurred:

- [src/Leviathan.Web/tests/support/uiSnapshot.ts](C:\Users\yuech\source\repos\Leviathan\src\Leviathan.Web\tests\support\uiSnapshot.ts)
- [docs/m22-headless-ui-inspection-workbench.md](C:\Users\yuech\source\repos\Leviathan\docs\m22-headless-ui-inspection-workbench.md)
- [docs/m24-scheduling-real-backend-smoke.md](C:\Users\yuech\source\repos\Leviathan\docs\m24-scheduling-real-backend-smoke.md)

Why it matters:

- "Give another model enough context to continue UI work" is now a common workflow.
- A standard schema lowers friction across apps and repos and avoids every adopter reinventing slightly different artifact names and metadata.

Proposed upstream helper:

- A documented bundle schema and optional helper to produce bundle metadata around screenshots, layout snapshots, and compact DOM summaries.

API sketch:

```ts
await writeMachinaHandoffBundle({
  outputDir,
  screenshot,
  domSummary,
  layoutSnapshot,
  metadata: { route, viewport, tags: ["real-backend"] },
});
```

## Friction 5: Debug Inspector / Overlay Ergonomics

Priority: `P1`

Problem:

- The debug inspector is useful, but during M24 real-browser automation it could intercept pointer interactions unless collapsed first.
- The live smoke currently calls `closeInspector(...)` before the journey starts.

Where it occurred:

- [src/Leviathan.Web/tests/scheduling-real-backend-smoke.spec.ts](C:\Users\yuech\source\repos\Leviathan\src\Leviathan.Web\tests\scheduling-real-backend-smoke.spec.ts)
- [src/Leviathan.Web/src/machina/MachinaHost.tsx](C:\Users\yuech\source\repos\Leviathan\src\Leviathan.Web\src\machina\MachinaHost.tsx)

Why it matters:

- Inspection UI should help automation, not create a second source of input-state fragility.
- A stable "inspection mode" needs an explicit answer to whether overlays consume layout, consume pointer events, or both.

Proposed upstream feature:

- Standard inspector/overlay modes with explicit pointer behavior:
  - `collapsed`
  - `nonInteractiveOverlay`
  - `interactivePanel`

API sketch:

```ts
<MachinaReactView
  layout={layout}
  views={views}
  debugOverlay={{ mode: "nonInteractiveOverlay", labels: true, borders: true }}
/>
```

## Friction 6: DOM Summary / Data Attribute Standardization

Priority: `P1`

Problem:

- The Machina React adapter already emits `data-machina-*` attributes, which made Leviathan's DOM summary practical.
- But the compact DOM summary shape itself is still local convention.
- M22 also flagged that the adapter attributes are useful enough to deserve more explicit debug-contract status.

Where it occurred:

- [vendor/MachinaLayout.JS/docs/react-adapter.md](C:\Users\yuech\source\repos\Leviathan\vendor\MachinaLayout.JS\docs\react-adapter.md)
- [src/Leviathan.Web/tests/support/uiSnapshot.ts](C:\Users\yuech\source\repos\Leviathan\src\Leviathan.Web\tests\support\uiSnapshot.ts)

Why it matters:

- Browser automation and LLM workflows need a stable semantic surface smaller than full HTML and richer than raw screenshots.
- Standardizing the summary shape would make downstream tools interoperable.

Proposed upstream helper:

- Document `data-machina-*` as a browser-debug contract.
- Provide a canonical DOM summary extractor that returns root ids, node ids, view/slot labels, rects, text excerpts, and accessibility metadata.

API sketch:

```ts
const domSummary = summarizeMachinaDom(document, {
  includeTextExcerpt: true,
  includeA11y: true,
});
```

## Friction 7: Scheduling-Specific Pain Points

Priority: `P2`

Problem:

- Scheduling used a wide split with hero, main panel, sidebar, and optional inspector. This exposed repeated needs for per-slot padding/gap derivation and predictable "footer rail" or "sidebar" sizing.
- Real-backend flows also stretched the route model because setup, public booking, confirmation, and provider bookings all share one shell route family with query-driven state.

Where it occurred:

- [src/Leviathan.Web/src/apps/scheduling/layouts.ts](C:\Users\yuech\source\repos\Leviathan\src\Leviathan.Web\src\apps\scheduling\layouts.ts)
- [src/Leviathan.Web/src/apps/scheduling/views.tsx](C:\Users\yuech\source\repos\Leviathan\src\Leviathan.Web\src\apps\scheduling\views.tsx)
- [docs/m24-scheduling-real-backend-smoke.md](C:\Users\yuech\source\repos\Leviathan\docs\m24-scheduling-real-backend-smoke.md)

Why it matters:

- This kind of "shell region + inspector region + stateful route family" pattern is common in tool UIs.
- Small helper conventions here would reduce app-local layout arithmetic and screen metadata glue.

Proposed upstream helpers:

- per-slot padding/gap helpers for stack content math;
- inspector-specific region patterns;
- route/screen fixture metadata conventions;
- mobile inspector ergonomics for narrow-width shells.

API sketch:

```ts
const shell = defineInspectorShell({
  hero: { height: 168 },
  content: { gap: 14, padding: 16 },
  inspector: { mode: "dock-bottom", minHeight: 230, maxHeight: 320 },
});
```

## Proposed Upstream Features

1. Remaining-rect helpers for fixed children, stack padding, and gaps.
2. Canonical screen catalog / fixture-screen support.
3. Viewport matrix helpers for responsive inspection runs.
4. Standard handoff bundle schema and optional writer helper.
5. Screenshot + overlay mode with stable rect borders and labels.
6. Non-intercepting debug overlay / inspector behavior for automation.
7. Canonical DOM summary helper based on adapter annotations.
8. Per-slot padding/gap utilities for shell-region sizing math.
9. Inspector-specific shell layout patterns.
10. Better mobile inspector ergonomics.
11. Route/screen fixture metadata conventions.

## Proposed API Sketches

```ts
const screens = defineMachinaScreens([...]);
const matrix = createViewportMatrix("standard-responsive");
const summary = summarizeMachinaDom(document);
const remaining = getRemainingStackRect(layout, { parentId: "root", afterChildren: ["hero"] });

await captureMachinaArtifacts({
  screen: screens["provider-setup"],
  viewportMatrix: matrix,
  overlay: { mode: "nonInteractiveOverlay", borders: true, labels: true },
  outputDir,
});
```

## Priority Ranking

- `P0`: remaining rect / fixed-child sizing helpers.
- `P1`: screen catalog, viewport matrix, handoff schema, overlay ergonomics, DOM summary helper.
- `P2`: per-slot padding/gap helpers, inspector shell patterns, mobile inspector ergonomics, route metadata conventions.
- `P3`: polish around presentation defaults and built-in labels/theme niceties.

## Minimal Repro / Leviathan References

- Remaining-rect arithmetic:
  - [src/Leviathan.Web/src/apps/scheduling/layouts.ts](C:\Users\yuech\source\repos\Leviathan\src\Leviathan.Web\src\apps\scheduling\layouts.ts)
  - [src/Leviathan.Web/src/machina/layouts.ts](C:\Users\yuech\source\repos\Leviathan\src\Leviathan.Web\src\machina\layouts.ts)
- Viewport matrix / fixture screen capture:
  - [src/Leviathan.Web/tests/ui-snapshot.spec.ts](C:\Users\yuech\source\repos\Leviathan\src\Leviathan.Web\tests\ui-snapshot.spec.ts)
- Real-backend overlay friction:
  - [src/Leviathan.Web/tests/scheduling-real-backend-smoke.spec.ts](C:\Users\yuech\source\repos\Leviathan\src\Leviathan.Web\tests\scheduling-real-backend-smoke.spec.ts)
- DOM summary + handoff schema:
  - [src/Leviathan.Web/tests/support/uiSnapshot.ts](C:\Users\yuech\source\repos\Leviathan\src\Leviathan.Web\tests\support\uiSnapshot.ts)
- Inspector snapshot export:
  - [src/Leviathan.Web/src/machina/debugInspector.ts](C:\Users\yuech\source\repos\Leviathan\src\Leviathan.Web\src\machina\debugInspector.ts)
- Source docs that originally surfaced these issues:
  - [docs/m22-headless-ui-inspection-workbench.md](C:\Users\yuech\source\repos\Leviathan\docs\m22-headless-ui-inspection-workbench.md)
  - [docs/m23-scheduling-ui-polish-handoff.md](C:\Users\yuech\source\repos\Leviathan\docs\m23-scheduling-ui-polish-handoff.md)
  - [docs/m24-scheduling-real-backend-smoke.md](C:\Users\yuech\source\repos\Leviathan\docs\m24-scheduling-real-backend-smoke.md)

## Open Questions

1. Should remaining-rect helpers live in core, or in a higher-level inspector/test utility package?
2. Should the standard handoff bundle be DOM-adapter-neutral, or explicitly start with the React adapter contract?
3. Should viewport matrix helpers belong to Machina core docs, adapter docs, or a separate testing companion package?
4. Should overlay and inspector behavior be purely adapter-level, or exposed through a shared debug contract?
5. Should screen catalog metadata be route-framework-agnostic, or can it assume browser route strings as a first-class case?
