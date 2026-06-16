# Leviathan M0: RustSimulator Browser Host

## Architecture summary

M0 adds two non-vendor projects:

- `src/Leviathan.Server`: an ASP.NET Core Minimal API host for Ariadne sessions.
- `src/Leviathan.Web`: a Vite + React + TypeScript browser client.

The backend references the smallest practical vendored C# projects needed for real RustSimulator execution:

- `vendor/Dominatus/src/Dominatus.Core/Dominatus.Core.csproj`
- `vendor/Dominatus/src/Ariadne.OptFlow/Ariadne.OptFlow.csproj`
- `vendor/Dominatus/src/Ariadne.Console/Ariadne.ConsoleApp.csproj`

`Ariadne.ConsoleApp.csproj` is referenced because `AdventureCatalog`, `AdventureDefinition`, and the authored `RustSimulator.Register` graph are currently located there. M0 does not modify vendor code and does not copy the RustSimulator script into Leviathan.

The key host seam is Dominatus actuation. Leviathan registers web handlers for:

- `DiagLineCommand`
- `DiagAskCommand`
- `DiagChooseCommand`

These handlers never call `Console`. Instead, they create a pending prompt in an `AriadneSession`. HTTP requests complete the pending actuation and the session ticks the real HFSM until the next prompt, completion, error, or max-tick guard.

## Run backend

```bash
dotnet run --project src/Leviathan.Server/Leviathan.Server.csproj --urls http://localhost:5188
```

## Run frontend

```bash
cd src/Leviathan.Web
npm install
npm run dev
```

Then open:

- `http://localhost:5173/apps`
- `http://localhost:5173/apps/rust-simulator`

The Vite dev server proxies `/api` to `http://localhost:5188`.

## HTTP API

### `GET /api/apps`

Returns the RustSimulator app manifest.

### `POST /api/ariadne/sessions`

Body:

```json
{ "appId": "rust_simulator" }
```

Creates a session and returns the first screen.

### `GET /api/ariadne/sessions/{sessionId}/screen`

Returns the current screen.

### `POST /api/ariadne/sessions/{sessionId}/advance`

Body:

```json
{ "promptId": "prompt-1", "revision": 0 }
```

Completes a line/advance prompt.

### `POST /api/ariadne/sessions/{sessionId}/choose`

Body:

```json
{ "promptId": "prompt-4", "revision": 3, "choiceKey": "l1" }
```

Completes a choice prompt.

### `POST /api/ariadne/sessions/{sessionId}/input`

Body:

```json
{ "promptId": "prompt-10", "revision": 9, "text": "drop(player);" }
```

Completes a free-text prompt.

## Limitations and non-goals

- No feeds, spaces, comments, federation, auth, payments, notifications, APK packaging, or social surface.
- No live LLM calls.
- No persistence: sessions are in memory and disappear when the backend exits.
- No MachinaLayout integration yet; the M0 client uses plain React to keep the path small and stable.
- `Ariadne.ConsoleApp.csproj` is referenced even though it is an executable project because the current vendored tree keeps `RustSimulator` and `AdventureCatalog` there. This should be cleaned up in a later upstream/vendor boundary change rather than by editing vendor in M0.
- Backend test automation was not added because the container lacks the .NET SDK, so C# compilation and test execution could not be verified here.

## Verification results

- `dotnet build src/Leviathan.Server/Leviathan.Server.csproj` could not run in this container because `dotnet` is not installed.
- `npm install && npm run build` passes for `src/Leviathan.Web`.

## Recommended M1

- Move Ariadne adventure definitions/scripts into a host-neutral vendored library upstream, then reference that library instead of the console executable.
- Add a backend test project once .NET SDK execution is available in CI/dev containers.
- Add a simple Playwright smoke test for: app list → start RustSimulator → advance intro lines → choose Level 1.
- Decide whether MachinaLayout should be consumed via a package/workspace boundary or a source alias.
- Add optional session persistence/checkpoint support after the web control loop is proven.
