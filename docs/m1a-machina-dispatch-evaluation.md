# M1a Machina Layout and Dispatch Evaluation

## Summary verdict

M1a finds the Machina thesis **directionally true for the current Leviathan app shell, with guardrails**.

- **Claim 1: Mostly true.** MachinaLayout represents shell geometry as `LayoutRow[]` records and resolved `Rect` documents. In Leviathan, the apps and RustSimulator shell regions are inspectable from TypeScript because `layouts.ts` owns root, header, transcript, prompt, and debug panel frames. The claim weakens anywhere CSS creates layout inside a Machina slot.
- **Claim 2: Mostly true for the current shell.** The shell needs route, app list, Ariadne screen, status, error, and text input state. Those transitions are currently centralized in one dispatch function. Zustand/Redux would be premature. MachinaDispatch tables can replace the simple synchronous route/status/text transitions, but async API orchestration should remain explicit host logic.
- **Claim 3: Partially enforced.** React renders slot components and CSS styles inside rectangles, while Machina owns app-shell layout. React still owns runtime adapter state through `useState` because the current implementation has not adopted the `machinalayout/dispatch` table runtime yet.

## Evidence inspected

### Machina reference source and docs

- `vendor/MachinaLayout.JS/docs/row-model.md` states that `LayoutRow[]` is the canonical authoring model, with stable ids, parent ids, frame primitives, arrange strategies, renderer slots/views, debug labels, and deterministic sibling ordering.
- `vendor/MachinaLayout.JS/src/types.ts` defines `Rect`, `LayoutRow`, `RootFrame`, `FixedFrame`, `FillFrame`, `AnchorFrame`, stack/grid arrange specs, z/layer metadata, and variants.
- `vendor/MachinaLayout.JS/src/react/MachinaReactView.tsx` renders resolved nodes as absolutely positioned wrappers and passes slot props including `id`, `rect`, `node`, `debugLabel`, `viewData`, and `nodeData`.
- `vendor/MachinaLayout.JS/docs/machina-dispatch.md` describes MachinaDispatch as a tiny pure table-driven dispatcher for field transitions, explicitly not a router, store, middleware layer, async framework, hook, provider, or browser-history runtime.

### Current Leviathan frontend

- `src/Leviathan.Web/src/machina/layouts.ts` is the shell geometry authority. It creates the root row, apps header/list rows, RustSimulator nav/content rows, transcript region, prompt/debug side panel, and responsive wide/narrow stack axis.
- `src/Leviathan.Web/src/machina/MachinaHost.tsx` owns the runtime adapter: viewport tracking, boot dispatch, layout resolution, browser history mirroring, API calls, and state updates.
- `src/Leviathan.Web/src/machina/views.tsx` renders React components inside Machina slots. Slot views receive `viewData` and `nodeData.dispatch`; they do not compute app-shell geometry.
- `src/Leviathan.Web/src/styles.css` now styles panels, typography, controls, and slot internals. It intentionally does not define the primary shell grid/flex layout.

## Package dependency findings

### Backend

Leviathan now references published NuGet packages for the available Dominatus/Ariadne runtime pieces: `Dominatus.Core` 0.2.1, `Dominatus.OptFlow` 0.2.1, and `Ariadne.OptFlow` 0.2.1. NuGet flat-container lookup found those versions. The attempted adventure package names `Ariadne.Console` and `Ariadne.ConsoleApp` returned NuGet HTTP 404 from `https://api.nuget.org/v3-flatcontainer/{package}/index.json`, so the authored RustSimulator graph is temporarily linked as the smallest remaining fallback source until a host-neutral package exists.

### Frontend

Leviathan now references the published npm package `machinalayout` 0.2.0. `npm view machinalayout version dist-tags --json` returned latest `0.2.0`, and `npm install machinalayout@0.2.0` succeeded. Vite and TypeScript aliases into `vendor/MachinaLayout.JS/src` were removed.

## Claim 1: explicit geometry from code alone

### Where positions, sizes, and regions are represented

Positions and sizes are represented in three layers:

1. **Authored layout rows** in `src/Leviathan.Web/src/machina/layouts.ts`.
   - Root uses `{ kind: 'root' }` and receives caller-provided viewport geometry.
   - Apps header uses a fixed height.
   - RustSimulator nav uses a fixed height.
   - RustSimulator content uses fill sizing and stack arrangement.
   - Transcript, side panel, prompt, and debug regions use fill/fixed frames with explicit weights, widths, heights, gaps, and padding.
2. **Resolved layout documents** from `resolveLayoutRows(doc.rows, rootRect)` in `MachinaHost.tsx`.
3. **React adapter slot props** from `MachinaReactView`, where each view receives the resolved rectangle for its slot.

### Are layout rows and resolved documents explicit enough to inspect?

Yes, for app-shell geometry. An LLM can inspect `layouts.ts` and determine that:

- `/apps` contains an apps header above an apps list.
- `/apps/rust-simulator` contains a nav bar above a content area.
- The content area is horizontal at widths `>= 860` and vertical below that.
- The transcript is the main fill region.
- Prompt/debug live in a side panel with fixed width on wide screens.

The resolved document is also explicit because `resolveLayoutRows` turns row records into node rectangles, and `MachinaReactView` exposes `rect` to slot components.

### Does Leviathan preserve explicitness?

Mostly. The shell geometry remains in `layouts.ts`, not CSS. The React views render content inside named slots and emit typed dispatch events. CSS does not decide whether the app has a header, side panel, transcript panel, or prompt panel.

### Where CSS still obscures geometry

CSS still affects geometry inside slots:

- `.panel` adds padding, border, border-radius, and overflow behavior.
- Button/input margins and input widths affect prompt internals.
- Transcript line spacing and scroll behavior are CSS-owned.

This is acceptable if Leviathan treats slot-internal layout as component styling, not app-shell geometry. It becomes a problem if CSS starts defining shell-level flex/grid, absolute positions, viewport heights, or responsive breakpoints that duplicate or override Machina rows.

### What must be true for Claim 1 to hold

- All shell-level regions must be named Machina rows with stable ids and debug labels.
- Breakpoints must live in Machina layout builders, not CSS media queries.
- CSS may style inside slots but must not reposition shell slots.
- Resolved layout documents should remain easy to log or inspect when debugging.
- Slot components should not infer shell layout from DOM/CSS.

### Required Leviathan patterns

- Keep one small layout builder per route/screen.
- Prefer named constants/helpers for recurring dimensions.
- Use stable row ids (`transcript`, `prompt`, `debug`) rather than generated ids.
- Pass shell data through `viewData` and dispatch through `nodeData`.
- For any new shell region, add it to Machina rows first; only then style its internal React view.

## Claim 2: Machina Dispatch replacing React state patterns

### What state the current shell needs

The current shell needs:

- route: apps list or RustSimulator
- app manifests
- current Ariadne screen DTO
- status: idle/loading/starting/submitting/error
- error text
- current text input value
- root viewport rectangle

### How state is currently represented

`ShellState` is a TypeScript object in `src/Leviathan.Web/src/machina/types.ts`. `MachinaHost.tsx` stores it in React `useState`, plus a separate `rootRect` adapter state.

### How dispatch events mutate or transition state

`LeviathanDispatch` is a discriminated union. `handleDispatch` centralizes transitions:

- `open-apps-list` mirrors `/apps`, loads app manifests, and updates route/status/apps/error.
- `open-rust-simulator-app` mirrors `/apps/rust-simulator`, clears screen state, and starts Ariadne.
- `start-ariadne-session` POSTs to the server and stores the returned screen.
- prompt events POST to Ariadne endpoints and store the next screen.
- `set-text-input` updates a single field.

This is already much closer to MachinaDispatch than scattered React hooks or Zustand slices.

### Which React hooks remain

React hooks remain as adapter/runtime hooks:

- `useState` stores shell state and viewport rectangle.
- `useEffect` attaches the resize listener and performs boot dispatch.
- `useCallback` stabilizes the dispatch callback.
- `useMemo` memoizes resolved layout and per-node dispatch data.

These hooks are acceptable at the adapter boundary, but app-specific transition logic should not spread into view components.

### State that may still benefit from local React state

Only ephemeral slot-local UI state should use React local state, such as an uncontrolled input draft, hover disclosure, focus affordance, or temporary animation state. Current `textInput` is shell state because it participates in typed Ariadne submission events and debug/replay semantics; keeping it in dispatch state is reasonable.

### Is Zustand/Redux-style global state unnecessary?

Yes for M1a. The current app shell has one route, one app manifest list, one Ariadne session screen, and simple status/error fields. Adding a global state library would add indirection without solving a current problem.

### Recommended state boundaries

- **Machina dispatch state:** shell route, visible app/screen selection, status, error, input values that participate in commands.
- **React component-local state:** focus, hover, animation, temporary visual affordances, internal form draft only when not semantically part of dispatch.
- **Server/session state:** Ariadne world/session state, transcript, prompt revision, validation of stale prompts.
- **Browser URL/history state:** mirror of dispatch route for share/back/refresh behavior, not the conceptual owner of routing.

## Claim 3: React as component/style adapter

### Does the implementation enforce this?

Mostly. React components in `views.tsx` do not own shell geometry or routing. They render inside slots and emit typed dispatch events. CSS styles panels and controls but no longer owns the shell layout.

### Where React still owns too much

`MachinaHost.tsx` still combines several responsibilities:

- dispatch transition logic,
- async API effects,
- URL mirroring,
- layout resolution,
- React state storage.

This is acceptable for M1a but should be split before more screens are added.

### Recommended changes

- Move pure synchronous transitions to MachinaDispatch tables or a pure reducer-like module.
- Keep async API calls in named effect/command handlers, not in React views.
- Keep URL mirroring in a browser adapter module.
- Keep layout building in route-specific layout modules.
- Add tests for dispatch transitions and prompt event mapping before adding features.

## Counterarguments and risks

- MachinaLayout makes shell rectangles explicit, but it cannot reveal geometry hidden inside arbitrary React/CSS slot content.
- The current implementation uses the Machina dispatch pattern but not the `machinalayout/dispatch` package API yet.
- Linked RustSimulator source remains a backend temporary workaround until Ariadne publishes a host-neutral package for authored adventures.
- Async effects do not belong in MachinaDispatch tables; forcing them there would make the design worse.
- Browser history can drift from dispatch state unless back/forward handling is added deliberately.

## Recommended coding rules

1. Shell layout must be authored in Machina `LayoutRow[]`, never CSS grid/flex at the app-shell level.
2. Every shell row must have a stable `id` and useful `debugLabel`.
3. React views may render controls and style content inside their assigned rectangle only.
4. View components must emit typed dispatch events; they must not call app APIs directly.
5. URL changes mirror dispatch state; they do not define conceptual routes.
6. Async server/session work lives in host command handlers.
7. Use React local state only for slot-local ephemeral UI.
8. Do not introduce Zustand/Redux until there are multiple independent durable client domains that cannot be represented as small dispatch state.

## Recommended M1b/M2 follow-up

- M1b: adopt `machinalayout/dispatch` for pure route/status/input transitions and keep async effects as explicit host commands.
- M1b: add small frontend tests for dispatch transitions and Ariadne prompt event mapping.
- M1b: add browser back/forward handling that dispatches route events rather than making URL parsing the owner.
- M2: replace the temporary linked RustSimulator source when a host-neutral Ariadne adventure package is published.
- M2: add a debug-only resolved layout inspector or console trace to make geometry inspection trivial for humans and LLMs.
