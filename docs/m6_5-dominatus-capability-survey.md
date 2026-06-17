# M6.5 Dominatus Capability Survey

## Summary

Leviathan should continue to treat Dominatus as the runtime/workflow substrate and Leviathan as the product/app shell. The refreshed vendored Dominatus source materially expands the available substrate beyond the M6 packages Leviathan currently uses: it includes read-only server inspection endpoints, TOML asset loading, standard actuators, LLM context/orchestration helpers, Semantic Kernel and Home Assistant integration layers, and a WIP payments contract/fake-provider actuator.

The most important finding for the first commercial scheduling/service-booking app is that Dominatus already covers several generic workflow primitives that Leviathan should not reinvent: HFSM/runtime state, blackboards, actuation boundaries, chunk checkpoint persistence, read-only world inspection DTOs, TOML asset-pack loading, calendar-file writing, time/HTTP/process/file actuators, auditable LLM call wrappers, context packets, and provider-neutral payment contracts. Leviathan still needs to own app manifests, product/session APIs, scheduling domain state, provider/service configuration, availability rules, account/auth integration later, customer-facing frontend flows, and production persistence policy.

Payments are not ready to depend on for a commercial app. The vendored `Dominatus.Actuators.Payments` project contains provider-neutral command/result contracts, validation, a provider registry, an actuation handler, registration helpers, and a fake in-memory provider, but no Stripe, Block/Square, or PayPal SDK adapter, no webhook handling, no reconciliation model, no persisted payment ledger, and no verified NuGet publication.

## Current Leviathan Integration

Leviathan currently references these Dominatus packages directly from the backend:

- `Dominatus.Core` `0.3.0`.
- `Dominatus.OptFlow` `0.3.0`.
- `Ariadne.OptFlow` `0.3.0`.

The backend also links one vendored source file, `vendor/Dominatus/src/Ariadne.Console/Scripts/RustSimulator.cs`, as a temporary source fallback because no host-neutral RustSimulator/Ariadne adventure package is available. This is a reference-source exception; Leviathan does not reference vendored Dominatus projects at build time.

Current Leviathan-owned platform pieces:

- Static app registry contract: `LeviathanAppManifest`, `ILeviathanAppDefinition`, `ILeviathanSessionApp`, `LeviathanAppRegistry`, and `RustSimulatorAppDefinition`.
- RustSimulator app manifest with route, runtime id, persistence scope, and capabilities.
- Ariadne session adapter and web dialogue handlers.
- Dominatus chunk checkpoint save/restore wrapper with a Leviathan session manifest.
- Companion UI chunk `leviathan.ariadne.ui` for transcript/revision/prompt continuity.
- Minimal API endpoints for `/api/apps`, `/api/apps/{appId}/sessions`, and transitional `/api/ariadne/sessions` aliases.
- Frontend app-list/session clients, route dispatch, RustSimulator screen rendering, local last-session storage, debug inspector state, and Machina layout/dispatch usage.

This code should remain Leviathan-owned for now because Dominatus does not provide a product app registry, scheduling-specific session API, authenticated tenant/account model, customer-facing frontend contract, or Ariadne web session host.

## Vendored Dominatus Project Inventory

| Project | Purpose and useful public surface | Package/project status observed | Leviathan usage | Scheduling relevance |
| --- | --- | --- | --- | --- |
| `Dominatus.Core` | Core runtime: `AiWorld`, `AiAgent`, `AiCtx`, `ActuatorHost`, `IActuationCommand`, `IActuationHandler<T>`, `ActuationCompleted<T>`, HFSM graph/instance/state types, blackboard keys/snapshots, decision policies/reports, trace sink, event bus, checkpoint/chunk persistence (`SaveFile`, `DominatusSave`, `DominatusCheckpointBuilder`, `ISaveChunkContributor`). | Vendored project targets `net8.0;net10.0`; package metadata says `0.2.1`, while Leviathan restores package `0.3.0`. | Used directly for runtime, HFSM, blackboard, actuation, and persistence. | High: should back booking workflows, audit/checkpoint boundaries, and deterministic state. |
| `Dominatus.OptFlow` | Authoring helpers over Dominatus Core: concise state/control-flow/command/wait/utility syntax via `Ai` and policy helpers. | Vendored metadata `0.2.1`; Leviathan restores `0.3.0`. | Referenced by backend and used indirectly by linked RustSimulator/Ariadne authoring. | Medium/high: useful if scheduling workflows are authored as Dominatus HFSMs. |
| `Ariadne.OptFlow` | Dialogue/text UI commands and steps (`Diag.Line`, `Diag.Ask`, `Diag.Choose`, `DiagLineCommand`, `DiagAskCommand`, `DiagChooseCommand`, `DiagChoice`, step helpers). | Vendored metadata `0.2.1`; Leviathan restores `0.3.0`. | Used by Ariadne web handlers and RustSimulator script. | Low for scheduling core; useful for assistant/chat-style app surfaces or onboarding flows. |
| `Dominatus.Server` | ASP.NET Core Minimal API integration for read-only `AiWorld` inspection plus LLM stream listing/chunk/SSE endpoints. Public surface includes `DominatusServerRuntime`, `AddDominatusServer`, `MapDominatusServer`, and `DominatusLlmStreamRegistry`. | Vendored metadata `0.2.1-preview`; exact NuGet search showed `0.3.0` available. | Not currently used. Leviathan has its own app/session API. | Medium later for operator/debug panels; not a replacement for scheduling APIs. |
| `Dominatus.UtilityLite` | Lightweight utility/condition helpers (`When`, `Utility`) for readable utility scoring and decisions. | Vendored metadata `0.2.1`; NuGet exact search did not verify a `0.3.0` package. | Not used. | Low/medium; useful if scheduling prioritization/agent choices become utility-scored. |
| `Dominatus.Assets.Toml` | Typed TOML single-file and asset-pack loading, source maps, diagnostics, validators, `AssetId`, `AssetRef<T>`, localization table helpers, reload reports. | Vendored metadata `0.2.1`; exact NuGet search showed `0.3.0` available. | Not used. | High later for provider/service definitions, availability templates, and possibly app manifests. |
| `Dominatus.Llm.Context` | Explicit LLM context store/packet/container models and JSON persistence for inspectable, versioned context chunks. | Vendored metadata `0.1.0-preview`; exact NuGet search showed `0.3.0` available. | Not used. | Medium later for LLM-legible booking state and assistant context. |
| `Dominatus.Llm.OptFlow` | LLM clients and actuation handlers: fake, OpenAI Responses, Anthropic Messages, Gemini, OpenRouter, ranked routing, cassettes, request hashing, text/stream/decision/MAGI handlers, prompt/context packet helpers. | Vendored metadata `0.2.1-preview`; exact NuGet search showed `0.3.0` available. | Not used. | Medium later; avoid live LLM integration in scheduling Pre-M0. |
| `Dominatus.Actuators.Standard` | Standard typed actuators for sandboxed files, UTC/local time, HTTP GET/POST, allowlisted process execution, ICS calendar-file writing/appending, HTTP WebSafety, and web-content safety filtering. | Vendored metadata `0.2.2`; exact NuGet search showed only older lines in short output, so `0.3.0` was not verified. | Not used. | Medium/high later: time and calendar-file helpers are directly relevant; HTTP/process/file actuators require strict allowlists. |
| `Dominatus.Actuators.SemanticKernel` | Semantic Kernel function actuator, function catalog, allowlisted capability profiles, and Microsoft Graph profile helpers. | Vendored metadata `0.1.1-preview`; exact NuGet search showed `0.3.0` available. | Not used. | Medium later for Outlook/Graph calendar/mail workflows; defer until auth/provider strategy exists. |
| `Dominatus.Actuators.HomeAssistant` | Allowlisted Home Assistant REST state reads/service calls plus websocket transport/event bridge. | Vendored metadata `0.2.1`; exact NuGet search showed older lines in short output, not `0.3.0`. | Not used. | Low for scheduling unless physical-location automation becomes a feature. |
| `Dominatus.Actuators.Payments` | Provider-neutral payment commands/results, validation, provider registry, fake provider, actuation handler, and registration helpers. | Vendored metadata `0.1.0`; exact NuGet search found no package. | Not used. | High eventually, but WIP and unsafe for real payments now. |
| `Ariadne.Console` | Console host and current authored adventures: `AdventureCatalog`, `AdventureDefinition`, console dialogue handlers, `RustSimulator`, demo scripts. | Console app project targets `net8.0`; exact NuGet search found no `Ariadne.Console` or `Ariadne.ConsoleApp` package. | Leviathan links only `RustSimulator.cs`; it mirrors enough adventure definition data in `RustSimulatorAppDefinition`. | Low for scheduling except as an example of app/adventure registration; should not become a runtime dependency. |

## NuGet / Package Availability

Verified current Leviathan package references with `dotnet list src/Leviathan.Server/Leviathan.Server.csproj package` after restore:

| Package | Current Leviathan requested/resolved version | Notes |
| --- | ---: | --- |
| `Dominatus.Core` | `0.3.0` / `0.3.0` | Current build proof of package availability. |
| `Dominatus.OptFlow` | `0.3.0` / `0.3.0` | Current build proof of package availability. |
| `Ariadne.OptFlow` | `0.3.0` / `0.3.0` | Current build proof of package availability. |

Additional exact package searches against nuget.org found:

- `Dominatus.Server` has a `0.3.0` package available.
- `Dominatus.Assets.Toml` has a `0.3.0` package available.
- `Dominatus.Actuators.SemanticKernel` has a `0.3.0` package available.
- `Dominatus.Llm.Context` has a `0.3.0` package available.
- `Dominatus.Llm.OptFlow` has a `0.3.0` package available.
- `Dominatus.Actuators.Payments` returned no exact package results and should be treated as unpublished/WIP.
- `Ariadne.Console` and `Ariadne.ConsoleApp` returned no exact package results.
- Short exact-search output for `Dominatus.Actuators.Standard`, `Dominatus.Actuators.HomeAssistant`, and `Dominatus.UtilityLite` did not verify `0.3.0`; the survey therefore does not claim current 0.3 availability for those packages.

No package references were added in M6.5.

## Dominatus.Server Findings

`Dominatus.Server` provides a reusable ASP.NET Core inspection layer, not a product app/session host. Its default `/dominatus` endpoint family includes health, world, world blackboard, agents, agent blackboards, active HFSM paths, public snapshots, LLM stream listing, stream details, chunks, and SSE stream events.

It is primarily read-only inspection plus durable/reconnectable LLM stream observation. It does not expose Ariadne prompt control, booking actions, app registry, session creation, save/restore manifests, authentication, authorization, or customer-facing product DTOs.

Leviathan should not replace its `/api/apps` and `/api/apps/{appId}/sessions` API with `Dominatus.Server` now. Leviathan should consider adopting `DominatusServerRuntime`/DTOs later for an authenticated local/operator debug panel, especially once multiple Dominatus-backed apps exist. The overlap with Leviathan debug/session endpoints is limited: Leviathan lists persisted app sessions and screens, while `Dominatus.Server` inspects live `AiWorld` internals.

## Persistence Findings

Leviathan is using the canonical Dominatus chunk checkpoint path for Ariadne/RustSimulator sessions: capture checkpoint chunks, add a custom `ISaveChunkContributor`, write with `SaveFile.Write`, read with `SaveFile.Read`, and restore via Dominatus checkpoint APIs.

The current Leviathan sidecar files are still justified:

- Dominatus checkpoint chunks remain runtime truth.
- Leviathan `manifest.json` stores product/session metadata: app id, created/updated timestamps, completion status, persistence format, and current checkpoint filename.
- The `leviathan.ariadne.ui` companion chunk stores UI transcript/revision/prompt-number state that is not canonical Dominatus runtime state and is needed for browser continuity.

No existing generic Dominatus session-manifest/file-layout helper was found in the vendored source. `ISaveChunkContributor` is the existing extension pattern for companion chunks, so Leviathan's UI chunk uses the correct seam.

Before multiple apps use persistence, Leviathan should harden:

1. A versioned app/session persistence contract independent of Ariadne names.
2. App-id and persistence-scope validation to prevent path ambiguity.
3. Atomic checkpoint/manifest writes or a repair policy for partially written sessions.
4. A migration story for companion chunks and manifests.
5. A common debug list format that can distinguish app kind/runtime/persistence format.
6. Tests for multiple registered apps sharing the same data root without scope collisions.

## Actuator Findings

### Standard

`Dominatus.Actuators.Standard` contains mature-looking typed actuators for common capabilities:

- Files: read/write/append/exists/list under sandboxed roots.
- Time: UTC/local clock commands.
- HTTP: allowlisted text/JSON commands and response models.
- Process: allowlisted process execution.
- Calendar: write/append ICS calendar event files.
- Safety: HTTP web-safety and web-content safety helpers.

Scheduling relevance is strongest for time and calendar-file export, and eventually HTTP if calling external calendar/SMS/email services. Leviathan should not expose process/file/HTTP actuators to user-controlled workflows without explicit allowlists and security review.

### SemanticKernel

`Dominatus.Actuators.SemanticKernel` exposes allowlisted Semantic Kernel plugin functions as Dominatus commands and provides function catalogs, capability profiles, risk levels, and Microsoft Graph profile helpers. This is potentially useful for future Outlook/Graph calendar and email integrations, but it should be deferred until Leviathan has auth, tenant consent, provider-token storage, and a clear operator/user permission model.

### HomeAssistant

`Dominatus.Actuators.HomeAssistant` provides allowlisted Home Assistant entity state reads, service calls, websocket transport, and event bridge. It is not relevant to the first scheduling app unless the product later coordinates physical spaces/devices.

### Payments

See the dedicated Payments section. The actuator is a useful contract/fake-provider layer but not a complete commercial payment integration.

## Payments Findings

Current abstractions/contracts found in `Dominatus.Actuators.Payments`:

- Money and platform-fee records: `PaymentMoney`, `PaymentPlatformFee`.
- Customer/line-item/provider selector records.
- Enums for capture method, payment status, checkout-session status, and refund status.
- Commands: create checkout session, create payment intent, capture payment, refund payment, cancel payment, get payment status.
- Results for the above operations.
- `IPaymentProvider`, `PaymentProviderRegistry`, validation helpers, `FakePaymentProvider`, `PaymentActuationHandler`, and registration helpers.

Integration status:

- Stripe: no adapter found.
- Block/Square: no adapter found.
- PayPal: no adapter found.
- Webhooks: none found.
- Provider API credentials/configuration: none beyond provider registration.
- Persistence/ledger/reconciliation: none found.
- Disputes, partial capture semantics beyond fake provider, tax, receipts, refunds across real providers, payout/platform-account onboarding, and PCI/compliance guidance: none found.
- NuGet publication: exact search found no `Dominatus.Actuators.Payments` package.

Conclusion: do not depend on Payments for the scheduling app yet except as a reference contract. Leviathan should design payment/deposit policy as a deferred domain boundary and wait for upstream real-provider adapters and webhook/ledger guidance before implementation.

## LLM / Semantic Kernel Findings

`Dominatus.Llm.Context` provides an explicit context-store/packet/container model with JSON serialization. This overlaps positively with Leviathan's long-term “LLM-legible app” ambition because context can be generated from structured state instead of opaque chat history.

`Dominatus.Llm.OptFlow` provides fake and real provider clients, cassettes, request hashing, text calls, streaming calls, decision scoring, MAGI-style judgment helpers, ranked client routing, and actuation handlers. This is a substantial reusable LLM boundary for future apps, especially when calls must be auditable and replayable.

`Dominatus.Actuators.SemanticKernel` provides a bridge to SK plugin functions and capability-risk profiles. It is useful for future tool integration, especially Microsoft Graph-related workflows, but it should remain out of the first scheduling milestone until auth/consent/token storage exist.

Leviathan should avoid live LLM calls in M7 Scheduling Pre-M0. It can, however, design scheduling state and traces so they can later produce Dominatus LLM context packets and inspection views.

## Assets / TOML Findings

`Dominatus.Assets.Toml` is directly relevant to future product configuration. It loads typed records/classes from TOML, validates individual assets and packs, reports stable diagnostics with source locations/key paths, and supports reload reports. It enforces a useful doctrine for Leviathan: TOML is data; C# owns behavior.

Possible uses:

- Scheduling provider profiles.
- Service catalog definitions.
- Availability-rule templates.
- Reminder policy templates.
- App manifest seed data.
- Test fixtures for scheduling workflow states.

Leviathan app manifests should not be converted to TOML immediately. The current static C# registry is small, explicit, and tested. TOML assets become attractive when non-developers need to edit app/service configuration or when many scheduling service definitions exist.

## Potential Wheel Reinvention in Leviathan

Current Leviathan wheel reinvention is limited and mostly intentional:

- App registry/manifests are Leviathan-owned because Dominatus has no product app registry.
- Session HTTP APIs are Leviathan-owned because Dominatus.Server is read-only inspection and has no app/session control endpoints.
- `manifest.json` is Leviathan-owned because Dominatus chunk saves do not include product app/session metadata.
- `leviathan.ariadne.ui` companion chunk is justified because Dominatus does not own browser transcript/prompt-revision state.
- Linked RustSimulator source is a temporary workaround. This remains the clearest integration gap and should be removed when Ariadne publishes a host-neutral adventure/script package.

Potential future duplication to avoid:

- Do not build a bespoke TOML asset loader if `Dominatus.Assets.Toml` can model scheduling service/provider config.
- Do not build custom generic LLM cassettes/context stores if Dominatus LLM packages fit the use case.
- Do not build generic standard actuators for time, HTTP, files, calendar-file export, or process execution unless the Dominatus standard pack cannot meet a specific security/product requirement.
- Do not build a separate read-only Dominatus world inspector without first evaluating `Dominatus.Server` DTOs/endpoints.

## Recommended Leviathan Adoptions

Near-term, low-risk adoptions:

1. Keep current Dominatus Core/OptFlow/Ariadne.OptFlow package usage.
2. Keep the app/session API separate from `Dominatus.Server`.
3. Generalize Ariadne-named persistence classes only when a second app needs persistence, not in M6.5.
4. Add `Dominatus.Server` only later behind explicit debug/operator routes and auth policy.
5. Evaluate `Dominatus.Assets.Toml` during scheduling Pre-M0 for service/provider configuration fixtures, not for runtime behavior.
6. Evaluate `Dominatus.Actuators.Standard` calendar/time helpers when scheduling needs calendar export or internal time commands.
7. Treat LLM and Semantic Kernel packages as future optional layers, not Scheduling Pre-M0 dependencies.

## Required Upstream Dominatus Work

Recommended upstream work before Leviathan depends more heavily on Dominatus:

1. Publish/verify host-neutral Ariadne adventure/script package so Leviathan can stop linking `Ariadne.Console/Scripts/RustSimulator.cs`.
2. Align vendored project versions with published `0.3.0` package metadata to reduce survey/build confusion.
3. Publish or verify `Dominatus.Actuators.Standard`, `Dominatus.Actuators.HomeAssistant`, and `Dominatus.UtilityLite` on the 0.3 line if they are expected to be generally available.
4. Complete `Dominatus.Actuators.Payments` real-provider adapters, webhook handling, idempotency/reconciliation guidance, and NuGet publication before commercial use.
5. Consider documenting a generic Dominatus save/session manifest convention if multiple hosts converge on similar file layouts.
6. Expand `Dominatus.Server` guidance for embedding inspection endpoints in product hosts with auth and multi-session/multi-world routing.

## Scheduling App Relevance Matrix

| Capability | Dominatus already provides | Leviathan already provides | Needs new Leviathan code | Needs upstream Dominatus work | Defer |
| --- | --- | --- | --- | --- | --- |
| Booking lifecycle state machine | HFSM/runtime, blackboard, decisions, actuation model | App/session shell can host runtime sessions | Booking states, transitions, validation, commands, tests | None required unless new workflow helpers are desired | No |
| Provider/service configuration | TOML typed asset substrate and validators | Static app manifest registry only | Service/provider domain records and validation; decide C# vs TOML seed | Maybe richer scheduling-specific asset examples later | No |
| Availability rules | Runtime can hold/evaluate state; time actuator exists | None domain-specific | Availability model, conflict checks, timezone policy | Possibly reusable calendar/availability primitives later | No |
| Persistence/checkpoints | Dominatus chunk checkpoints and companion chunks | Local session manifest, data-root layout, restore tests | Generalize beyond Ariadne when second app arrives | Optional generic save/session manifest convention | No |
| Audit trail/trace | Trace sink, event bus, cassettes/hashes for LLM, save chunks | Debug session list and screen state | Product audit events and booking history | Could add stronger trace/checkpoint docs/helpers upstream | No |
| Payment/deposit policy | WIP contracts/fake provider only | None | Domain payment policy placeholders later; no real payment flow now | Real providers, webhooks, ledger, NuGet publication | Yes |
| External calendar integration | ICS file writing; Semantic Kernel Graph profiles; HTTP actuator | None | Provider auth, calendar abstraction, token storage, sync jobs | Possibly first-class calendar provider actuators | Yes for live integrations |
| Reminder/notification | HTTP actuator can call allowlisted services; SK/Graph possible | None | Reminder scheduler, templates, delivery provider integration | Maybe notification actuators upstream | Yes |
| LLM assistant/context | LLM context store, cassettes, provider clients, decision/stream handlers | LLM-legible debug ambition only | State-to-context mapping and product UX | Package maturity/docs as needed | Yes for live calls |
| App registry/manifest | No product app registry | Static registry, app/session routes, RustSimulator manifest | Scheduling app manifest and runtime binding | Host-neutral Ariadne package only affects RustSimulator | No |
| Frontend dispatch/layout | Not a Dominatus concern | MachinaLayout/MachinaDispatch shell | Scheduling UI views, forms, routing, validation | None | No |

## Recommended M7

Recommended M7 remains **Scheduling App Pre-M0**, with one platform-hardening slice included only if it is needed to avoid brittle app work:

1. Define the scheduling domain contract without implementing payments/auth/live integrations.
2. Register a scheduling app manifest behind the existing Leviathan app registry.
3. Decide whether the first scheduling workflow is Dominatus HFSM-backed or a simpler Leviathan-owned state machine that can later be wrapped by Dominatus.
4. Define persistence boundaries and audit events before building customer features.
5. Evaluate `Dominatus.Assets.Toml` for service/provider configuration fixtures.
6. Defer real payments, external calendars, reminders, and live LLM calls.

If M7 exposes that Ariadne-specific persistence names block a second app, do a small platform hardening patch first: rename/generalize the persistence abstractions without changing behavior.

## Verification

Commands run during the survey:

- `find vendor/Dominatus/src -maxdepth 2 -type f \( -name '*.csproj' -o -name '*.cs' -o -name '*.md' \) | sort` — passed; identified vendored projects and source files.
- `rg "Dominatus|Ariadne|RustSimulator|checkpoint|session|registry|manifest|chunk|Payment|OptFlow" -n src docs --glob '!**/bin/**' --glob '!**/obj/**'` — passed; identified current Leviathan integration points and previous milestone docs.
- `dotnet list src/Leviathan.Server/Leviathan.Server.csproj package` — passed; verified current backend package references resolve to `0.3.0`.
- `dotnet package search ... --exact-match` for surveyed Dominatus/Ariadne package names — passed; verified several additional packages and confirmed no exact `Dominatus.Actuators.Payments`, `Ariadne.Console`, or `Ariadne.ConsoleApp` package results.
- `dotnet restore` — passed.
- `dotnet build Leviathan.slnx` — passed with pre-existing xUnit analyzer warnings about cancellation tokens in persistence tests.
- `dotnet test` — passed; 6 tests passed.


## M20 Scheduling payment actuator seam

M20 intentionally does not call payment actuators. It documents the future seam where authorized Leviathan payment commands can map to Dominatus payment actuator operations such as checkout/payment-intent creation, capture, status, and refund.
