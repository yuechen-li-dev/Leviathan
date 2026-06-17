# M5: .NET 10 Migration and Persistence Hardening

## Summary

M5 keeps Leviathan architecture unchanged while hardening the M4 Dominatus chunk persistence path. The backend now targets .NET 10, uses the Dominatus/Ariadne v0.3 package line, keeps the root `Leviathan.slnx` as the canonical .NET solution, and adds focused restart/restore tests around RustSimulator local sessions.

## .NET 10 migration notes

- `src/Leviathan.Server/Leviathan.Server.csproj` targets `net10.0`.
- `tests/Leviathan.Server.Tests/Leviathan.Server.Tests.csproj` targets `net10.0`.
- `global.json` pins the repo to SDK `10.0.109` with `latestFeature` roll-forward because that exact SDK is installed in the local environment.
- No Android, Gradle, or Node toolchain migration was performed for M5.

## Package versions used

The server uses exact NuGet package versions:

- `Dominatus.Core` `0.3.0`
- `Dominatus.OptFlow` `0.3.0`
- `Ariadne.OptFlow` `0.3.0`

No centralized package management files are present as of M5.

## `Leviathan.slnx` status and commands

`Leviathan.slnx` exists at the repository root and is the canonical .NET solution for M5. It includes:

- `src/Leviathan.Server/Leviathan.Server.csproj`
- `tests/Leviathan.Server.Tests/Leviathan.Server.Tests.csproj`

The installed .NET 10 SDK supports building the `.slnx` directly:

```bash
dotnet restore
dotnet build Leviathan.slnx
dotnet test
```

## Dominatus v0.3 upgrade notes

The v0.3 package line restored and built successfully against the existing Leviathan API usage. No database-backed persistence was introduced. Dominatus save chunks remain the runtime truth for Ariadne/RustSimulator sessions.

## RustSimulator linked source status

The temporary linked-source fallback remains:

```xml
<Compile Include="../../vendor/Dominatus/src/Ariadne.Console/Scripts/RustSimulator.cs" Link="Ariadne/VendoredReference/RustSimulator.cs" />
```

NuGet package search found `Dominatus.Core`, `Dominatus.OptFlow`, and `Ariadne.OptFlow` `0.3.0`, but did not find a host-neutral `Ariadne.Console` or `Ariadne.ConsoleApp` package. Leviathan still does not reference vendored `.csproj` files and does not modify anything under `vendor/`.

## Persistence hardening tests

`tests/Leviathan.Server.Tests/AriadnePersistenceTests.cs` covers:

1. Creating a RustSimulator session writes `manifest.json` and `checkpoint.dom1`.
2. A new in-process host instance pointed at the same data directory restores the same session id from disk.
3. A restored session reports `WasRestored` and can continue through the current prompt.
4. The local session list endpoint returns safe persisted metadata.
5. A corrupt checkpoint returns a controlled `500 ProblemDetails` response.
6. Unknown sessions return `404 NotFound`.

These tests simulate restart/restore without adding a database or a large external integration harness.

## Local session debug endpoint

`GET /api/ariadne/sessions` remains a local/debug endpoint and now returns safe list-item metadata:

- session id
- app id
- created at
- updated at
- completion status
- whether `checkpoint.dom1` exists
- whether `manifest.json` exists

This endpoint has no account, auth, feed, notification, payment, or social semantics.

## Run/build/test commands

Backend:

```bash
dotnet --version
dotnet --list-runtimes
dotnet restore
dotnet build Leviathan.slnx
dotnet test
```

Frontend:

```bash
cd src/Leviathan.Web
npm install
npm run build
npm test -- --run
```

Capacitor Android sync was not required by source changes because no frontend build artifact or native shell behavior changed.

## Known limitations

- The RustSimulator linked source fallback remains until a host-neutral package is published.
- M5 tests use in-process `WebApplicationFactory` restart simulation, not a manual OS process restart.
- Manual browser/backend restart verification was not performed as part of this automated pass.

## Recommended M6

Recommended M6 direction is app registry contract hardening if platform core remains the priority. If the first commercial app becomes the priority, Scheduling app Pre-M0 should start separately without mixing scheduling implementation into M5 hardening work.
