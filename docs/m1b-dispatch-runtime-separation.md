# M1b Dispatch Runtime Separation

## Summary verdict

M1b separates Leviathan's frontend shell runtime into explicit modules. `MachinaHost.tsx` is now a React adapter for state storage, viewport measurement, dispatch/command invocation, layout resolution, and `MachinaReactView` rendering. Route/status/text/screen transitions are testable outside React, async server work is command-driven, URL/history mirroring is isolated, and Ariadne prompt action mapping is pure TypeScript.

## Before: mixed host responsibilities

Before M1b, `src/Leviathan.Web/src/machina/MachinaHost.tsx` owned all of these concerns in one component:

- initial URL interpretation,
- React state storage,
- route/status/error/text transitions,
- browser `history.pushState` mirroring,
- app manifest loading,
- Ariadne session start/advance/choose/input API calls,
- prompt result state updates,
- viewport measurement,
- layout selection/resolution,
- `MachinaReactView` rendering.

That was workable for M1a but hid the Machina dispatch/state architecture inside a host component.

## After: responsibility split

- `shellState.ts` owns `ShellState`, route/status types, and initial state construction.
- `shellEvents.ts` owns the typed Leviathan dispatch/event union and route-event helpers.
- `shellDispatch.ts` owns pure synchronous transitions.
- `shellCommands.ts` owns async server interactions and dispatches result events.
- `browserHistoryAdapter.ts` owns URL interpretation, URL mirroring, unknown-route fallback, and `popstate` dispatch bridging.
- `ariadneMapping.ts` maps Ariadne screens/prompts to renderable prompt actions without React.
- `MachinaHost.tsx` remains the runtime adapter: React state, viewport listener, dispatch-to-reducer wiring, command invocation, popstate adapter attachment, layout resolution, and rendering.
- `views.tsx` renders slot content and emits mapped dispatch events; it does not call APIs or own shell routes.

## Machinalayout dispatch usage

M1b uses the published `machinalayout/dispatch` API directly in `shellDispatch.ts`:

```ts
import { defineDispatchTables, dispatchEvent } from "machinalayout/dispatch";
```

The package tables are used for simple field assignments that fit MachinaDispatch semantics:

- route assignment (`route.apps`, `route.rust-simulator`),
- status assignment (`status.idle`, `status.loading-apps`, `status.starting-session`, `status.submitting`, `status.error`),
- error clearing (`error.clear`).

The reducer wraps those table transitions for multi-field app events such as opening RustSimulator, receiving app manifests, receiving Ariadne screens, clearing input after text submission, and preserving or clearing errors.

## Why async commands stay outside pure dispatch

MachinaDispatch is intentionally a pure table-driven field transition helper. API calls require effects, request bodies, current session lookup, error handling, and result-event dispatch. Putting those concerns into dispatch tables would make the transition layer impure and harder to test. M1b keeps async effects in `shellCommands.ts`, where each command accepts the triggering event, a state getter, and a dispatch callback.

## State ownership boundaries

- **Shell dispatch state:** route, app manifests, current Ariadne screen, status, error, and semantic text input.
- **Host adapter state:** React storage for `ShellState` and viewport rectangle only.
- **Machina layout:** explicit shell geometry through `LayoutRow[]` and `resolveLayoutRows`.
- **React views:** component rendering and DOM events inside Machina slots.
- **Browser URL/history:** mirror of dispatch-owned route state, not the conceptual route owner.
- **Server:** Ariadne session/world state and validation of prompt revisions.

## Browser history model

The dispatch state is the route owner. The browser adapter provides three behaviors:

1. Initial location is interpreted into a starting route.
2. Dispatch-owned route state mirrors to `/apps` or `/apps/rust-simulator`.
3. Browser back/forward emits route dispatch events from `popstate`.

Unknown routes fall back to `/apps` through the adapter and subsequent dispatch flow. URL parsing is an adapter boundary, not the application router model.

## Test coverage

Frontend Vitest coverage now includes:

- opening the apps route sets route/status correctly,
- opening RustSimulator sets route/status and crosses the command boundary,
- text input events update shell state,
- successful Ariadne session results update screen/status,
- API failure creates error state,
- invalid prompt action lookup is rejected by returning no event,
- line/choice/text-input Ariadne prompt mapping emits correct dispatch events.

## Verification

Commands run during M1b:

```bash
cd src/Leviathan.Web
npm install
npm run build
npm test
dotnet restore
dotnet build src/Leviathan.Server/Leviathan.Server.csproj
```

The .NET commands were run from the repository root after frontend verification.

## Known limitations

- Browser playability was build/test verified, but no manual browser end-to-end session was claimed in M1b.
- Command tests are still mostly covered through transition and mapping boundaries; deeper command tests with mocked request dependencies would be useful if command branching grows.
- `MachinaHost.tsx` still coordinates command invocation because React is the runtime process boundary, but app-specific transition and API details are no longer embedded there.
- Prompt revision staleness is still ultimately enforced by the server; frontend mapping rejects unknown local prompt actions but cannot prove server freshness.

## Recommended M2

- Add an optional debug-only resolved layout/state event inspector.
- Add mocked command tests for request URLs and result events if more commands are introduced.
- Replace temporary RustSimulator backend source linkage when a host-neutral Ariadne adventure package becomes available.
- Keep new screens on the same boundaries: pure state events, command handlers for effects, browser adapter for history, and React as slot rendering only.
