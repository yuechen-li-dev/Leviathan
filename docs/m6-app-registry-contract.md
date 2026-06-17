# Leviathan M6: App Registry Contract Hardening

## Purpose

M6 turns the RustSimulator host into the first statically registered Leviathan app instead of the shape every future app must copy. Leviathan remains a shared platform/SDK layer: app discovery, runtime/session binding, frontend/backend contracts, and Dominatus-backed local persistence live in Leviathan, while app-specific authored content stays behind a registered app definition.

## Why the registry is platform infrastructure

The registry is the contract between platform shell, backend session runtime, and app-specific implementation. It gives Leviathan a stable place to answer: what apps exist, where the frontend should route them, which runtime can host them, what persistence scope they own, and which prompt/session capabilities they expose.

## Backend app manifest model

Backend manifests are represented by `LeviathanAppManifest`:

- `appId`: stable API id such as `rust_simulator`.
- `displayName`: human-facing app name.
- `kind`: product/app category, currently `ariadne.adventure`.
- `description`: list/card copy.
- `runtime`: backend runtime binding family, currently `ariadne.optflow`.
- `frontendRoute`: route the shell can open for the app.
- `persistenceScope`: slash-delimited storage scope under the Leviathan data root.
- `capabilities`: prompt/session abilities such as `line`, `advance`, `choice`, and `text-input`.
- `metadata`: small string metadata for compatibility notes and implementation hints.

`LeviathanAppId` exists as a small value-object boundary for future hardening, but M6 keeps endpoint route values as strings to avoid broad churn.

## Runtime/session binding model

M6 adds a static registry:

- `ILeviathanAppDefinition` exposes a manifest.
- `ILeviathanSessionApp` binds a manifest to session start/restore functions.
- `LeviathanAppRegistry` indexes statically registered `ILeviathanSessionApp` services.

This deliberately avoids plugin loading, reflection scanning, dynamic assemblies, an app store, or remote execution.

## API surface

New app-aware endpoints:

```http
GET  /api/apps
GET  /api/apps/{appId}
POST /api/apps/{appId}/sessions
GET  /api/apps/{appId}/sessions
GET  /api/apps/{appId}/sessions/{sessionId}/screen
POST /api/apps/{appId}/sessions/{sessionId}/advance
POST /api/apps/{appId}/sessions/{sessionId}/choose
POST /api/apps/{appId}/sessions/{sessionId}/input
```

Transitional aliases remain for compatibility with M0-M5 clients:

```http
POST /api/ariadne/sessions
GET  /api/ariadne/sessions
GET  /api/ariadne/sessions/{sessionId}/screen
POST /api/ariadne/sessions/{sessionId}/advance
POST /api/ariadne/sessions/{sessionId}/choose
POST /api/ariadne/sessions/{sessionId}/input
```

The aliases target `rust_simulator` and should be treated as legacy compatibility, not the endpoint shape for new apps.

## Frontend manifest consumption

The web app list loads `GET /api/apps` and renders cards from manifest fields. Opening a card emits a generic `open-app` dispatch event with the manifest `appId`. Runtime rendering is still explicitly the RustSimulator/Ariadne screen because it is the only implemented app screen in M6.

Unknown browser routes still normalize back to `/apps`. Future app routes should add a route-to-manifest lookup instead of hardcoding product screens into the list.

## Persistence scope rules

Persistence remains Dominatus chunk persistence. No database is introduced. The persistence layer now receives the app manifest and derives storage from `persistenceScope`:

```text
<data-root>/<persistenceScope>/sessions/<sessionId>/checkpoint.dom1
<data-root>/<persistenceScope>/sessions/<sessionId>/manifest.json
```

RustSimulator uses `ariadne/rust_simulator`, which preserves the M4/M5 local save path.

## RustSimulator registration

`RustSimulatorAppDefinition` registers:

- `appId`: `rust_simulator`
- `displayName`: `Rust Simulator`
- `kind`: `ariadne.adventure`
- `runtime`: `ariadne.optflow`
- `frontendRoute`: `/apps/rust-simulator`
- `persistenceScope`: `ariadne/rust_simulator`
- capabilities: `line`, `advance`, `choice`, `text-input`

The authored RustSimulator graph is still linked from the vendored Dominatus tree because no host-neutral Ariadne package exists for that authored script yet. M6 isolates that fallback inside the RustSimulator app definition and the existing project reference comment.

## Future scheduling app registration, high level

A future scheduling app should add a new statically registered `ILeviathanSessionApp` or a sibling non-Ariadne runtime binding once its runtime contract is known. It would provide a unique app id, frontend route, runtime id, persistence scope, and capabilities, then expose sessions through the same `/api/apps/{appId}/sessions` family.

## Non-goals

- No scheduling implementation.
- No auth or accounts.
- No payments or entitlements.
- No social feeds/spaces/federation/comments.
- No database or cloud sync.
- No live LLM calls.
- No vendor edits.
- No replacement for MachinaLayout/MachinaDispatch.
- No replacement for Dominatus chunk persistence.

## Known limitations

- Only RustSimulator has a concrete frontend runtime view.
- Browser route parsing still knows the RustSimulator URL explicitly.
- Legacy `/api/ariadne` aliases remain and should be retired only after clients move to app-aware endpoints.
- App id validation is registry-based but still stringly typed at HTTP boundaries.

## Recommended M7

Scheduling App Pre-M0: design the first commercial Leviathan app using this registry contract before implementing scheduling features.
