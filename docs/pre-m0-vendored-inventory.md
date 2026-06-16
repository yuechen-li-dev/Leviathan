# Leviathan Pre-M0 Vendored Inventory

## Summary

Leviathan is currently a repository shell with vendored source only. The only non-vendor top-level project files found are `.gitignore`, `LICENSE`, and this report under `docs/`.

The vendored Dominatus tree contains the useful runtime pieces for Ariadne: `Dominatus.Core`, `Ariadne.OptFlow`, and `Ariadne.Console`. RustSimulator already exists as a C# HFSM script at `vendor/Dominatus/src/Ariadne.Console/Scripts/RustSimulator.cs` and is registered in `AdventureCatalog` under id `rust_simulator`.

The current Ariadne host is console-bound. Ariadne emits output through `DiagLineCommand`, `DiagAskCommand`, and `DiagChooseCommand` actuation commands, which are handled by `Ariadne.Console` handlers that call `ConsoleUi`. This is the right seam for a future web host, but there is not yet an Ariadne web/session DTO or HTTP control API.

`Dominatus.Server` exists, but it is an inspection/read-only Minimal API package for `AiWorld`; it is not an app host and does not expose write/control endpoints for choices. It can inform server hosting but does not by itself play RustSimulator in a browser.

`MachinaLayout.JS` contains TypeScript source and React rendering adapters, but the vendored copy has no root `package.json`, so it is not directly installable/buildable from this checkout as an npm workspace/package. Its `src/index.ts` re-exports core, React, and text APIs. A Leviathan React app can likely consume it by local source import or by adding proper package/workspace glue later.

Recommended M0: create the smallest host-neutral Ariadne session adapter outside `vendor/`, plus a Leviathan browser page that starts `rust_simulator`, renders the current screen, and submits advance/choice/input commands. Do not build social features, APK packaging, persistence, auth, feeds, federation, or LLM integrations in M0.

## Current Repo Shape

Top-level non-vendor files/directories observed:

- `.gitignore`
- `LICENSE`
- `docs/pre-m0-vendored-inventory.md`
- `vendor/Dominatus/`
- `vendor/MachinaLayout.JS/`

No root solution, root package manifest, root `src/`, Leviathan frontend app, Leviathan backend app, or CI/test config was found outside `vendor/`.

Vendored directories:

- `vendor/Dominatus/docs/`
- `vendor/Dominatus/src/`
- `vendor/MachinaLayout.JS/docs/`
- `vendor/MachinaLayout.JS/samples/`
- `vendor/MachinaLayout.JS/src/`

## Dominatus Inventory

### Solution/project structure

No `.sln` file was found under `vendor/Dominatus` during inventory. Project files found:

- `vendor/Dominatus/src/Ariadne.Console/Ariadne.ConsoleApp.csproj`
- `vendor/Dominatus/src/Ariadne.OptFlow/Ariadne.OptFlow.csproj`
- `vendor/Dominatus/src/Dominatus.Actuators.Standard/Dominatus.Actuators.Standard.csproj`
- `vendor/Dominatus/src/Dominatus.Assets.Toml/Dominatus.Assets.Toml.csproj`
- `vendor/Dominatus/src/Dominatus.Core/Dominatus.Core.csproj`
- `vendor/Dominatus/src/Dominatus.Server/Dominatus.Server.csproj`
- `vendor/Dominatus/src/Dominatus.UtilityLite/Dominatus.UtilityLite.csproj`

`vendor/Dominatus/src/` also contains a `src` directory entry in the directory listing, but no additional analysis was needed for RustSimulator hosting.

### Core runtime pieces

Useful Dominatus runtime/public concepts found for a web host:

- `AiWorld`, `AiAgent`, `AiCtx`, `ActuatorHost`, `IActuationCommand`, `IActuatorHandler<T>`, `ActuationId`, `ActuationDispatchResult`, `ActuationCompleted`, `ActuationCompleted<T>` in `vendor/Dominatus/src/Dominatus.Core/Runtime/`.
- `HfsmGraph`, `HfsmInstance`, `HfsmOptions`, `HfsmStateDef`, `HfsmTransition` in `vendor/Dominatus/src/Dominatus.Core/Hfsm/`.
- `BbKey<T>`, `Blackboard`, and blackboard snapshots/persistence helpers in `vendor/Dominatus/src/Dominatus.Core/Blackboard/` and `vendor/Dominatus/src/Dominatus.Core/Persistence/`.
- `IAiTraceSink` and `TextWriterTraceSink` in `vendor/Dominatus/src/Dominatus.Core/Trace/`.

These are reusable for a host process/session model. The existing runtime is not inherently console-specific; the Ariadne command handlers are.

### Existing docs that constrain the design

Relevant Dominatus docs found:

- `vendor/Dominatus/docs/server/DOMINATUS_SERVER_M0.md`: `Dominatus.Server` is read-only ASP.NET Core infrastructure for inspecting an `AiWorld`; explicitly not a dashboard/client/control endpoint package.
- `vendor/Dominatus/docs/server/DOMINATUS_SERVER_M1_STREAMS.md` and `DOMINATUS_SERVER_M2_STREAM_SSE.md`: later LLM stream registry/SSE work exists, but it is not Ariadne gameplay control.
- `vendor/Dominatus/docs/user/ARCHITECTURE.md`: general architecture reference.
- `vendor/Dominatus/docs/user/PERSISTENCE_CHECKPOINT_REVIEW.md`: useful later for save/session work, but not necessary for minimal M0.
- `vendor/Dominatus/docs/user/STRIDECONN_M1_RUST_SIMULATOR.md`: RustSimulator-related Stride connector doc exists and should be read before any 3D/Stride work, but Stride is not needed for browser text M0.

## Ariadne Inventory

### Ariadne-related projects

- `vendor/Dominatus/src/Ariadne.Console/`: console app and current playable Ariadne host.
- `vendor/Dominatus/src/Ariadne.OptFlow/`: reusable dialogue command/step helpers.

### Ariadne.Console status and purpose

`Ariadne.Console` is the only complete Ariadne gameplay host found. It displays a console menu, lets the user choose an adventure, builds an `AiWorld`, registers console dialogue handlers, registers HFSM states from the selected `AdventureDefinition`, adds an `AiAgent`, and ticks until `System.AdventureComplete` is set.

Important files:

- `Program.cs`: current host loop and world setup.
- `AdventureCatalog.cs`: adventure registry.
- `AdventureDefinition.cs`: manifest-like record with id/title/description/register callback.
- `ConsoleUi.cs`: console rendering/input helper.
- `DialogueHandlers.cs`: bridge from Ariadne dialogue commands to console UI.
- `Scripts/*.cs`: authored adventures.

### How Ariadne scripts/adventures are registered

`AdventureDefinition` is a record containing:

- `Id`
- `Title`
- `Description`
- `Action<HfsmGraph> RegisterStates`

`AdventureCatalog.All` currently registers:

- `demo` → `DemoDialogue.Register`
- `thread_of_night` → `AriadneThreadOfNight.Register`
- `rust_simulator` → `RustSimulator.Register`

For M0, `AdventureCatalog` is the closest existing app manifest source. It is inside the console project, so a non-console host either needs to reference the project as-is or extract/recreate a tiny registry outside vendor. Hard rule says do not modify vendored source, so M0 should avoid extraction until an explicit implementation milestone.

### How Ariadne currently emits output

Ariadne scripts call helpers from `Ariadne.OptFlow.Diag`:

- `Diag.Line(text, speaker?)` creates `DiagSteps.LineStep`, which dispatches `DiagLineCommand` and waits for `ActuationCompleted`.
- `Diag.Ask(prompt, storeAs)` creates `DiagSteps.AskStep`, which dispatches `DiagAskCommand`, waits for `ActuationCompleted<string>`, and stores the returned string in the blackboard.
- `Diag.Choose(prompt, options, storeAs)` creates `DiagSteps.ChooseStep`, which dispatches `DiagChooseCommand`, waits for `ActuationCompleted<string>`, and stores the returned choice key in the blackboard.

The current console output path is:

`RustSimulator` / other scripts → `Diag.*` step → `Diag*Command` → `ActuatorHost` → `Diag*Handler` in `Ariadne.Console` → `ConsoleUi`.

### How Ariadne currently accepts input/choices

Input is synchronous and console-bound today:

- `DiagLineHandler` prints a line and calls `ConsoleUi.WaitAdvance()`.
- `DiagAskHandler` calls `ConsoleUi.Ask(prompt)` and returns the typed string as completed payload.
- `DiagChooseHandler` calls `ConsoleUi.Choose(prompt, options)` and returns the selected option key as completed payload.

For a web host, these handlers should be replaced by session-aware handlers that enqueue a pending screen/request and complete only after HTTP input arrives.

### Existing host-neutral runtime boundary

Partial boundary exists:

- Good: Ariadne scripts use `IActuationCommand` records and Dominatus actuation semantics rather than directly using console APIs.
- Good: `Ariadne.OptFlow` is separate from `Ariadne.Console`.
- Missing: no explicit `IAriadneSession`, `AriadneScreenDto`, web command endpoint, or host-neutral app/session package was found.
- Missing: `AdventureCatalog` and RustSimulator live in `Ariadne.Console`, which makes the current registry console-project-bound even though the script code itself mostly uses runtime/OptFlow concepts.

### Existing DTOs/events/commands/traces/sessions/state useful for web host

Useful existing command objects:

- `DiagLineCommand(string Text, string? Speaker)`
- `DiagAskCommand(string Prompt)`
- `DiagChooseCommand(string Prompt, IReadOnlyList<DiagChoice> Options)`
- `DiagChoice(string Key, string Text)`

Useful runtime events:

- `ActuationCompleted`
- `ActuationCompleted<T>`

Useful state:

- `Blackboard` / `BbKey<T>` for script/session state.
- RustSimulator keys such as `RustSim.Level`, `RustSim.Confidence`, `RustSim.Sanity`, `RustSim.TechDebt`, and `System.AdventureComplete`.

Useful server DTOs from `Dominatus.Server`:

- `DominatusHealthDto`
- `DominatusWorldDto`
- `DominatusAgentDto`
- `DominatusBlackboardDto`
- `DominatusBlackboardEntryDto`
- `DominatusAgentPathDto`
- `DominatusAgentSnapshotDto`

Missing for Ariadne web play:

- session DTOs
- pending prompt DTOs
- transcript/screen DTOs
- submit-command DTOs
- stable app manifest DTOs

### Existing tests relevant to Ariadne/server hosting

No test project was found under `vendor/Dominatus` with the safe file search used for this inventory. No Ariadne-specific test project was found. Existing verification is therefore limited by missing `dotnet` in the environment and the absence of visible test projects.

## RustSimulator Path

RustSimulator lives at:

`vendor/Dominatus/src/Ariadne.Console/Scripts/RustSimulator.cs`

Key observations:

- Public class: `Ariadne.ConsoleApp.Scripts.RustSimulator`.
- Registration: `AdventureCatalog` maps id `rust_simulator` to `RustSimulator.Register`.
- State is stored in blackboard keys under names such as `RustSim.Level`, `RustSim.Confidence`, `RustSim.Sanity`, `RustSim.TechDebt`, and `System.AdventureComplete`.
- It emits text and prompts via `Diag.Line` and `Diag.Choose`; a puzzle free-text key exists as `RustSim.L1.PuzzleAnswer`.
- The current content is playable through the console host only.

## Dominatus.Server Inventory

`vendor/Dominatus/src/Dominatus.Server/` contains:

- `Dominatus.Server.csproj`
- `DominatusServerRuntime.cs`
- `DominatusServerServiceCollectionExtensions.cs`
- `DominatusServerEndpointRouteBuilderExtensions.cs`
- `DominatusLlmStreamRegistry.cs`
- DTO files under `Dtos/`
- mapper under `Internal/`

Status/purpose:

- ASP.NET Core Minimal API integration.
- Thread-safe wrapper around `AiWorld` via `DominatusServerRuntime`.
- Read-only world/agent/blackboard/path/snapshot inspection endpoints.
- LLM stream registry endpoints and SSE support are present.
- No gameplay write endpoints.
- No Ariadne app/session host.
- No static frontend/dashboard.
- The project file references `..\Dominatus.Llm.OptFlow\Dominatus.Llm.OptFlow.csproj`, but no `Dominatus.Llm.OptFlow` project was found in the current `vendor/Dominatus/src/` listing. This may be a vendored inconsistency or missing project and should be resolved before relying on `Dominatus.Server` builds.

Existing mapped endpoints include:

- `GET /dominatus/health`
- `GET /dominatus/world`
- `GET /dominatus/world/blackboard`
- `GET /dominatus/agents`
- `GET /dominatus/agents/{id}`
- `GET /dominatus/agents/{id}/blackboard`
- `GET /dominatus/agents/{id}/path`
- `GET /dominatus/agents/{id}/snapshot`
- `GET /dominatus/streams`
- `GET /dominatus/streams/{streamId}`
- `GET /dominatus/streams/{streamId}/chunks`
- `GET /dominatus/streams/{streamId}/events`
- `GET /dominatus/snapshots`

## MachinaLayout.JS Inventory

### Package/build structure

Observed directories:

- `vendor/MachinaLayout.JS/src/`
- `vendor/MachinaLayout.JS/docs/`
- `vendor/MachinaLayout.JS/samples/`

No `vendor/MachinaLayout.JS/package.json` was found. Because of that, `npm test`/`npm run build` cannot run directly from the vendored checkout. Docs mention package metadata and npm publishing work, but the current vendored files do not include the package manifest.

### React support status

React support exists in source:

- `src/react/MachinaReactView.tsx`
- `src/react/index.ts`
- root `src/index.ts` re-exports `./react`

`MachinaReactView` renders a `ResolvedLayoutDocument` using absolutely positioned DOM wrappers. Views are supplied via a registry. Slot props include `id`, `rect`, `debugLabel`, `node`, `viewKey`, `viewData`, and `nodeData`.

### Existing parser/layout/rendering APIs

Root exports in `src/index.ts` include:

- Types/errors/validation helpers.
- `compileLayoutRows`
- `selectLayoutRowsForRoot`
- `resolveFrame`
- `resolveLayoutDocument`
- `resolveLayoutRows`
- `toResolvedTree`
- `flattenResolvedTree`
- `formatRect`
- React adapter exports.
- Text parser/React text exports.
- interpolation helpers.

MachinaText source exists under `src/text/`, including parser and React renderer:

- `parseMachinaText`
- `parseMachinaTextInline`
- `MachinaTextView`

### Docs that describe intended usage

Relevant docs:

- `docs/m0-contract.md`: flat `LayoutRow[]` → compile → resolve → render adapter pipeline.
- `docs/react-adapter.md`: React adapter model and data channels.
- `docs/machina-text-parser.md`: text parser details.
- `docs/machina-text-react.md`: React text renderer details.
- `docs/frames-and-stack.md`, `docs/grid-arrange.md`, `docs/responsive-variants.md`: layout primitives.
- `docs/forbidden-concepts.md`: no DOM measurement/CSS layout authority/core routing/state.

### Samples closest to Ariadne/text-adventure UI

Closest samples:

- `samples/control-room/`: React + `MachinaReactView`, view registry, `viewData`, `nodeData`, interactive controls.
- `samples/dispatch-counter/`: small event/dispatch sample.
- `samples/music-player/`: UI sample, less relevant to text adventure.

No sample specifically implements a text adventure/chat/transcript UI, but `control-room` is the closest integration pattern for a React app using Machina layout records and view components.

### Usable directly from a Leviathan React app?

Partially:

- Source imports are possible if Leviathan config aliases/imports from `vendor/MachinaLayout.JS/src/index.ts` and compiles TS/TSX from vendor.
- Package consumption is not directly possible from the vendored checkout because there is no `package.json` or built `dist/`.
- The React adapter is present and likely usable after project/build glue is added.

### Likely integration glue needed

- A Leviathan frontend package/app manifest (`package.json`, Vite or equivalent, TypeScript config).
- Module alias or local workspace/package setup for Machina source.
- CSS for the RustSimulator page.
- A small Machina layout row definition for transcript/prompt/choices/status panels.
- View registry components for transcript, prompt controls, and status.
- API client for Ariadne session endpoints.

## Leviathan Local Inventory

Current non-vendor Leviathan status:

- No app shell source exists yet.
- No backend project exists yet.
- No frontend project exists yet.
- No root build/test tooling exists yet.
- No app manifest exists yet.
- No docs existed before this report except through vendored docs.

Gaps before M0 can begin:

- Choose and create Leviathan host project(s), likely a .NET backend and React/Vite frontend.
- Decide whether M0 references vendored C# projects directly or copies/extracts Ariadne host-neutral contracts into non-vendor code.
- Decide how to consume `MachinaLayout.JS` source without modifying vendor.
- Define Ariadne web session DTO and command lifecycle.
- Add basic automated tests once project skeleton exists.

## Existing Build/Test Commands

Commands attempted from `/workspace/Leviathan`:

| Command | Result |
| --- | --- |
| `find . -maxdepth 3 -type f ...` | Passed; showed only `.gitignore`, `LICENSE`, and vendor files before this report. |
| `find vendor/Dominatus -maxdepth 3 -type f \( -name '*.sln' -o -name '*.csproj' -o -name '*Tests*' \) -print` | Passed; found seven `.csproj` files and no `.sln`/test project in that search. |
| `find vendor/Dominatus -maxdepth 5 -type f | rg 'Tests|Test|\.sln$|Directory.Build|global.json'` | Passed with no matching output. |
| `dotnet --info` | Failed: `/bin/bash: line 1: dotnet: command not found`. |
| `dotnet build vendor/Dominatus/src/Ariadne.Console/Ariadne.ConsoleApp.csproj --no-restore` | Failed: `/bin/bash: line 1: dotnet: command not found`. |
| `dotnet build vendor/Dominatus/src/Dominatus.Server/Dominatus.Server.csproj --no-restore` | Failed: `/bin/bash: line 1: dotnet: command not found`. |
| `npm --version` | Passed with npm `11.4.2`, with warning `Unknown env config "http-proxy"`. |
| `(cd vendor/MachinaLayout.JS && npm test -- --run)` | Failed because `vendor/MachinaLayout.JS/package.json` is missing. |

No build/test success is claimed for vendored .NET or Machina packages because required tooling/manifests were unavailable.

## Useful Existing Contracts

Existing contracts to reuse:

- `AdventureDefinition`: `Id`, `Title`, `Description`, `RegisterStates`.
- `AdventureCatalog.All`: current source of registered adventures, including RustSimulator.
- `DiagChoice`: choice key/text pair.
- `DiagLineCommand`: text/speaker output unit.
- `DiagAskCommand`: free-text prompt unit.
- `DiagChooseCommand`: choice prompt/options unit.
- Dominatus actuation completion model: command dispatch returns/awaits `ActuationCompleted` or `ActuationCompleted<T>`.
- Dominatus blackboard: stores game/session state and completion flags.
- `DominatusServerRuntime`: thread-safe read/write wrapper around `AiWorld`.
- `Dominatus.Server` read-only DTOs for optional debug/inspection panels.
- Machina `LayoutRow[]` → `ResolvedLayoutDocument` → `MachinaReactView` adapter contract.
- MachinaText parser/React renderer for safe-ish text rendering inside rectangles.

## Missing Contracts

Missing for RustSimulator in browser:

- Leviathan app manifest model.
- Ariadne app/session list endpoint.
- Start-session endpoint.
- Get-current-screen endpoint.
- Submit-input/choice/advance endpoint.
- Session storage/lifetime policy.
- Pending prompt/request model.
- Transcript model.
- HTTP error model for invalid session, invalid choice, stale prompt, completed session.
- Frontend routes.
- Frontend API client.
- Buildable Leviathan backend/frontend projects.
- Vendored Machina package manifest/build output.

## Proposed Minimal App Host Contract

Scope: only RustSimulator display/play in browser.

### App manifest shape

```json
{
  "id": "rust_simulator",
  "kind": "ariadne.adventure",
  "title": "Rust Simulator",
  "description": "A black-comedy descent through compile-time suffering.",
  "runtime": "dominatus-hfsm",
  "startMode": "new-session",
  "capabilities": ["line", "advance", "choice", "text-input"]
}
```

Initial source can be `AdventureCatalog.All`, mapped into DTOs. Since `AdventureCatalog` lives in a console project, M0 may either reference it directly or create a non-vendor manifest mirror in Leviathan with a clear TODO to move host-neutral Ariadne packaging upstream later.

### Session lifecycle

1. Frontend loads app manifest/list.
2. User opens `/apps/rust-simulator`.
3. Frontend calls `POST /api/ariadne/sessions` with `{ "appId": "rust_simulator" }`.
4. Server creates session:
   - `ActuatorHost` with web dialogue handlers.
   - `AiWorld`.
   - `HfsmGraph { Root = "Root" }`.
   - selected adventure `RegisterStates(graph)`.
   - `HfsmInstance` with `KeepRootFrame = true`.
   - `AiAgent` added to world.
5. Server ticks until a pending UI event exists or adventure completes.
6. Frontend polls/loads `GET /api/ariadne/sessions/{sessionId}/screen`.
7. User submits advance/choice/text.
8. Server completes the pending actuation payload, ticks to next pending UI event/completion, and returns updated screen.
9. Session completes when `System.AdventureComplete` is true or the runtime reports no more playable state.

### What can reuse existing code

- RustSimulator script as-is.
- `Ariadne.OptFlow` commands and steps as-is.
- Dominatus HFSM/runtime/blackboard/actuation as-is.
- `AdventureCatalog` as an initial registry if referencing `Ariadne.Console` is acceptable for M0.
- Machina React components/layout source as a frontend rendering foundation.

### What must be newly built

- Non-vendor Leviathan backend project.
- Web Ariadne session manager.
- Web dialogue handlers that suspend on pending UI requests.
- Session DTOs and API endpoints.
- Non-vendor Leviathan frontend project.
- RustSimulator page and Machina layout/view components.
- Tests around session state transitions and DTO mapping.

### Explicitly deferred

- Social feeds/spaces/federation.
- APK wrapping.
- Auth/accounts.
- Persistence/save files.
- Multiplayer/shared sessions.
- Live LLM calls or stream integration.
- Dominatus.Server write API generalization beyond Ariadne M0.
- Refactoring vendored projects.

## Proposed Ariadne Screen DTO

Minimal DTO shape:

```json
{
  "sessionId": "ses_123",
  "appId": "rust_simulator",
  "title": "Rust Simulator",
  "status": "waiting-for-choice",
  "revision": 7,
  "transcript": [
    {
      "id": "evt_1",
      "kind": "line",
      "speaker": "Narrator",
      "text": "2:13 AM..."
    }
  ],
  "prompt": {
    "id": "act_42",
    "kind": "choice",
    "prompt": "What now?",
    "options": [
      { "key": "l1", "text": "Level 1 - The Borrow Checker Says No" },
      { "key": "status", "text": "Check your condition" },
      { "key": "quit", "text": "Abandon your career and leave" }
    ]
  },
  "state": {
    "level": 1,
    "confidence": 2,
    "sanity": 3,
    "techDebt": 0,
    "adventureComplete": false
  }
}
```

Status enum:

- `starting`
- `waiting-for-advance`
- `waiting-for-choice`
- `waiting-for-input`
- `running`
- `completed`
- `error`

Prompt variants:

```json
{ "id": "act_1", "kind": "advance" }
{ "id": "act_2", "kind": "input", "prompt": "..." }
{ "id": "act_3", "kind": "choice", "prompt": "...", "options": [{ "key": "...", "text": "..." }] }
```

## Proposed API Surface

Minimal endpoints:

- `GET /api/apps`
  - returns available app manifests; initially RustSimulator only.
- `GET /api/apps/{appId}`
  - returns a manifest or `404`.
- `POST /api/ariadne/sessions`
  - body: `{ "appId": "rust_simulator" }`
  - returns: `{ "sessionId": "...", "screen": AriadneScreenDto }`.
- `GET /api/ariadne/sessions/{sessionId}/screen`
  - returns current `AriadneScreenDto`.
- `POST /api/ariadne/sessions/{sessionId}/advance`
  - body: `{ "promptId": "act_...", "revision": 7 }`
  - completes a line/advance prompt.
- `POST /api/ariadne/sessions/{sessionId}/choose`
  - body: `{ "promptId": "act_...", "revision": 7, "choiceKey": "l1" }`
  - completes a choice prompt.
- `POST /api/ariadne/sessions/{sessionId}/input`
  - body: `{ "promptId": "act_...", "revision": 7, "text": "..." }`
  - completes a free-text prompt.
- Optional debug only: `GET /api/ariadne/sessions/{sessionId}/blackboard`
  - returns selected public/debug state; do not expose as primary UI contract.

M0 should not expose generalized arbitrary Dominatus write/control endpoints.

## Proposed Frontend Routes

Minimal route shape:

- `/`
  - simple Leviathan shell/index.
- `/apps`
  - list available hosted apps; initially only RustSimulator.
- `/apps/rust-simulator`
  - starts or resumes a local browser session and renders RustSimulator.
- `/apps/rust-simulator/sessions/:sessionId`
  - direct session route, optional but useful for reload/debug.

The RustSimulator page should use Machina for deterministic screen regions, for example:

- root shell
- title/status strip
- transcript panel
- prompt/choice panel
- debug state panel hidden by default

## Reuse Plan

### Dominatus/Ariadne

Reuse directly:

- `RustSimulator.Register` and authored states.
- `Ariadne.OptFlow.Diag*` command model.
- Dominatus HFSM/agent/world runtime.
- Blackboard keys for status panel.

Replace/augment outside vendor:

- Replace `DialogueHandlers.cs` with web session handlers in Leviathan code.
- Wrap console `AdventureCatalog` into a Leviathan manifest mapper or create a non-vendor manifest mirror.
- Add session lifecycle manager in Leviathan.

Do not modify in Pre-M0/M0 unless explicitly planned later:

- `vendor/Dominatus/src/Ariadne.Console/Scripts/RustSimulator.cs`
- `vendor/Dominatus/src/Ariadne.OptFlow/*`
- `vendor/Dominatus/src/Dominatus.Core/*`

### MachinaLayout.JS

Reuse directly if build config supports source import:

- `resolveLayoutRows`
- `MachinaReactView`
- `MachinaTextView` if transcript lines benefit from MachinaText formatting.

Build in Leviathan:

- app-specific layout rows
- view registry components
- API client and React state management

Avoid:

- modifying vendored Machina source
- using CSS/DOM measurement as geometry authority
- adding routing/state into Machina core

## Deferred Work

Explicitly deferred until after RustSimulator is playable in browser:

- Social media features: feeds, spaces, federation, profiles, follow graph, moderation.
- APK wrapping/mobile packaging.
- Durable saves/checkpoints.
- Auth/authz/user accounts.
- Real-time multi-session/multiplayer.
- LLM calls, LLM streams, model/provider config.
- General Dominatus control-plane API.
- Asset pipeline for non-text games.
- Stride/Godot/3D integration.
- Upstream refactors to split Ariadne scripts out of `Ariadne.Console`.
- npm publishing or packaging of Machina unless needed for local consumption.

## M0 Recommendation

### Goal

Create the smallest real integration where RustSimulator displays in a browser through Leviathan and accepts at least line advance and menu choice input through a Leviathan API.

### Files/projects likely touched

New non-vendor files only, likely:

- `src/Leviathan.Server/Leviathan.Server.csproj`
- `src/Leviathan.Server/Program.cs`
- `src/Leviathan.Server/Ariadne/*`
- `src/Leviathan.Server/Apps/*`
- `src/Leviathan.Web/package.json`
- `src/Leviathan.Web/src/*`
- `src/Leviathan.Web/vite.config.ts`
- `src/Leviathan.Web/tsconfig*.json`
- root solution/build files as needed
- tests under non-vendor `tests/` or project-specific test folders

Vendored source should remain untouched.

### Concrete implementation steps

1. Add a non-vendor Leviathan backend project.
2. Reference required vendored C# projects without editing them.
3. Implement `AriadneSessionManager`:
   - create world/agent/HFSM from RustSimulator.
   - tick until pending prompt/completion.
   - expose current transcript/screen.
4. Implement web dialogue handlers for `DiagLineCommand`, `DiagAskCommand`, and `DiagChooseCommand`.
5. Add minimal app manifest endpoint for RustSimulator.
6. Add session create/screen/advance/choose/input endpoints.
7. Add a non-vendor Leviathan React app.
8. Configure the React app to consume Machina source or a local wrapper without modifying vendor.
9. Render the RustSimulator transcript and current prompt.
10. Add tests for manifest mapping, session creation, first screen, and choice submission.
11. Run available build/tests and document environment limits.

### Tests to add or run

Backend tests:

- Start session for `rust_simulator` returns screen title and first pending advance/choice state.
- Submitting advance updates transcript/revision.
- Submitting a valid choice progresses the session.
- Invalid choice key returns `400`.
- Unknown session returns `404`.

Frontend tests:

- RustSimulator route renders title/transcript/prompt from mocked API.
- Choice click calls `choose` endpoint with prompt id/revision/key.
- Advance button calls `advance` endpoint.

Build/check commands once projects exist:

- `dotnet restore`
- `dotnet build`
- `dotnet test`
- `npm install` or `npm ci` in frontend
- `npm run build`
- `npm test` if configured

### Expected outcome

At the end of M0, a developer can run Leviathan locally, open a browser page, see RustSimulator text, click/submit through prompts, and progress through the existing RustSimulator adventure without changing vendored source.

### Non-goals

- Production UI polish.
- Mobile/APK.
- Persistence.
- Authentication.
- Social features.
- LLM features.
- Refactoring upstream Dominatus/Ariadne/Machina projects.

## Risks / Unknowns

- `.NET` SDK is missing in this environment, so Dominatus projects were not actually built here.
- `Dominatus.Server.csproj` references `Dominatus.Llm.OptFlow`, which was not found under `vendor/Dominatus/src`; this may block server builds until resolved.
- `MachinaLayout.JS` has no `package.json` in this vendored checkout, so direct npm build/test/package usage is unavailable.
- `AdventureCatalog` and RustSimulator are inside `Ariadne.Console`; referencing a console app project from a server may be awkward. M0 can tolerate this if it works, but a later upstream split into an Ariadne content/library project would be cleaner.
- Current console handlers complete synchronously. A web handler needs a robust pending-actuation model so world ticks do not spin or duplicate prompts.
- `Diag` callsite ids are source-line-based by default, which docs warn can shift if content is edited after saves exist. M0 can ignore durable saves, but persistence milestones must address stable prompt ids.
- No Ariadne tests were found, so M0 should add tests before changing behavior around the hosting seam.

## Verification

Inventory commands run from `/workspace/Leviathan`:

```bash
pwd && find .. -name AGENTS.md -print
find . -maxdepth 3 -type f | sed 's#^./##' | sort | head -200
find vendor/Dominatus -maxdepth 3 -type f \( -name '*.sln' -o -name '*.csproj' -o -name '*Tests*' \) -print | sort
rg -n "RustSimulator|AdventureCatalog|Ariadne|MapDominatus|endpoint|record|class|interface" vendor/Dominatus/src/Ariadne.Console vendor/Dominatus/src/Ariadne.OptFlow vendor/Dominatus/src/Dominatus.Server -g '*.cs'
find vendor/Dominatus -maxdepth 5 -type f | rg 'Tests|Test|\.sln$|Directory.Build|global.json'
find vendor/MachinaLayout.JS -maxdepth 4 -type f | sort | head -250
find vendor/MachinaLayout.JS -maxdepth 2 -type f -name 'package.json' -print
find . -maxdepth 2 -type f -not -path './.git/*' -print | sort
dotnet --info
dotnet build vendor/Dominatus/src/Ariadne.Console/Ariadne.ConsoleApp.csproj --no-restore
dotnet build vendor/Dominatus/src/Dominatus.Server/Dominatus.Server.csproj --no-restore
npm --version
(cd vendor/MachinaLayout.JS && npm test -- --run)
```

Results:

- No `AGENTS.md` file was found.
- Vendor inventories completed with `find` and `rg`.
- No Dominatus `.sln` or test project was found in the searched paths.
- `.NET` commands could not run because `dotnet` is not installed in this container.
- npm is installed (`11.4.2`), but Machina tests could not run because `vendor/MachinaLayout.JS/package.json` is missing.
- This report modifies only `docs/pre-m0-vendored-inventory.md`.
