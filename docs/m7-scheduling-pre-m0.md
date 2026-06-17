# M7 Scheduling App Pre-M0

## Summary

M7 is a specification milestone for Leviathan's first commercial app: a service scheduling and resource booking product. It does not implement scheduling code, add a database, add auth, add external calendar sync, add payments, add SMS, add social features, or add live LLM calls.

The recommended direction is to keep Leviathan as the shared platform/SDK layer and introduce Scheduling as a modular app domain beside Ariadne/RustSimulator. Scheduling should use the M6 app registry and app-aware API conventions, but it should not force all scheduling concepts into platform core. The first implementation milestone, M8, should create a small modular skeleton and implement local single-process slot generation, atomic holds, and confirmation rules for exclusive resources.

## Product Thesis

Scheduling should not be a Calendly clone whose core abstraction is a person with a synced calendar. The atomic entity is a bookable resource: a person, room, chair, vehicle, machine, court, booth, or other finite capacity item that can be exclusively claimed for a time interval.

The product should compete on correctness and inspectability:

- slot claims are typed transitions, not incidental calendar events;
- exclusive resources cannot be double-booked in the supported deployment model;
- availability and claim decisions are explainable through audit events;
- timezones are explicit in all stored and returned time ranges;
- solo/simple usage remains free or extremely cheap;
- multi-resource, team, payment, SMS, external calendar sync, branding, and export features become paid tiers later.

## Calendly Pain Points / Greenfield Response

The uploaded Calendly critique was not available at `/mnt/data/Claude on Calendly.txt` in this container, so this report incorporates the concrete critique points supplied in the M7 prompt.

| Pain point | Greenfield response |
| --- | --- |
| Fragile external calendar sync with poor diagnostics. | v0 uses internal availability as source of truth. Later sync emits inspectable `SyncEvent` audit records and never silently overwrites booking truth. |
| Possible double-booking or integrity failure. | v0 models claims as atomic transitions guarded by resource-scoped locks and interval overlap checks. |
| Account/person-centered model fails for multiple resources. | `Resource` is first-class and services can be assigned to one or more resources. Same time is allowed on different resources. |
| Timezone confusion. | `ZonedTimeRange` stores instant boundaries plus an IANA timezone id and display-local values. API inputs require timezone context. |
| Pricing fights simple use cases. | Free/simple tier is intentionally useful for one provider, one resource, and one or limited services. Paid tiers map to complexity and cost drivers. |
| Need SMS/payment later without corrupting core booking. | `BookingPolicy` reserves deposit, prepay, reminder, and cancellation policy concepts, but real providers are deferred. |

## Modular App Boundary

A second Leviathan app needs these platform seams to plug in cleanly:

- a static manifest with `appId`, route, runtime id, persistence scope, capabilities, and metadata;
- a backend app definition registered in DI;
- either a session runtime binding through the generic `/api/apps/{appId}/sessions` family or app-specific product APIs under `/api/apps/{appId}`;
- an app-owned persistence scope under the Leviathan data root;
- frontend routing that maps an app manifest route to an app-owned screen module;
- Machina layout/view/dispatch code that stays under the app folder when it is product-specific;
- debug/audit exposure following the M2 inspector pattern without making scheduling state global shell state.

Scheduling should use `scheduling` as the stable `appId`, `scheduling.booking` or `scheduling.resource-booking` as the app kind, `/apps/scheduling` as the provider-facing route, and a public route family such as `/book/{providerSlug}` for customer-facing booking.

## Backend Module Proposal

Two backend layouts were evaluated.

### Option A: folders inside `Leviathan.Server`

```text
src/Leviathan.Server/
  Platform/
    Apps/
    Sessions/
    Persistence/
    Api/
  Apps/
    Ariadne/
    Scheduling/
      Domain/
      Runtime/
      Api/
      Persistence/
      SchedulingAppDefinition.cs
```

Benefits:

- low ceremony for M8;
- easy for Codex/Claude to inspect and modify;
- no premature plugin architecture;
- keeps platform/app boundaries visible through namespaces and folders;
- avoids solution/project churn while the API is still taking shape.

Costs:

- requires discipline so app code does not creep into `Platform`;
- project-level dependencies cannot yet enforce app isolation;
- tests may need namespaces/folders rather than project boundaries.

### Option B: separate app projects

```text
src/Leviathan.Apps.Scheduling/
src/Leviathan.Apps.Ariadne/
src/Leviathan.Server/
```

Benefits:

- stronger compile-time separation;
- cleaner long-term package/reuse story;
- app-specific dependencies are easier to isolate.

Costs:

- more ceremony during a still-fluid implementation;
- solution/project churn before the shared app-hosting abstractions are stable;
- likely to require moving Ariadne code in the same milestone, increasing risk.

### Recommendation for M8

Use Option A first: create `src/Leviathan.Server/Apps/Scheduling/` and gradually move existing Ariadne code toward `src/Leviathan.Server/Apps/Ariadne/` only when useful. Also introduce `src/Leviathan.Server/Platform/` as platform code is generalized. Do not create separate app projects until Scheduling proves which interfaces deserve project-level enforcement.

M8 should add a `SchedulingAppDefinition` manifest and app-specific APIs without moving unrelated Ariadne files unless a small rename is necessary for clarity.

## Frontend Module Proposal

Recommended frontend structure:

```text
src/Leviathan.Web/src/platform/
  api/
  routing/
  shell/
  debug/
src/Leviathan.Web/src/machina/
  shared layout/dispatch primitives retained during migration
src/Leviathan.Web/src/apps/ariadne/
  RustSimulator views, mappings, app runtime client
src/Leviathan.Web/src/apps/scheduling/
  routes.ts
  api.ts
  layouts.ts
  views.tsx
  dispatch.ts
  types.ts
```

App-specific Machina layouts, view components, dispatch mappings, and app API clients should live under `src/Leviathan.Web/src/apps/scheduling/`. Shared shell state, manifest loading, app-card rendering, browser route normalization, debug inspector primitives, and reusable API base-url handling belong under `platform` or the existing `machina` shell during migration.

For M8, avoid a broad frontend refactor. Add the scheduling app folder and route mapping while leaving existing Machina shell code intact unless a small dispatch/router seam is needed.

## MVP Requirements

### Provider-facing MVP

- Create provider/business profile.
- Create bookable resource.
- Create service.
- Assign service to one or more resources.
- Define weekly availability.
- View bookings.
- Cancel booking.

### Customer-facing MVP

- Public booking page.
- Choose service.
- Choose available slot.
- Enter name, email, phone, and notes.
- Confirm booking.
- See confirmation.
- Downloadable or attached `.ics` can be M8 only if trivial; otherwise defer to M9.

### Engine MVP

- Generate available slots.
- Hold selected slot atomically for a short TTL.
- Confirm held slot into booking.
- Expire holds.
- Prevent double-booking for exclusive resources.
- Allow same time on different resources.
- Persist booking state.
- Log availability and claim decisions.

## Non-Goals

- No external Google/Microsoft calendar sync in v0.
- No SMS provider integration in v0.
- No real payment integration in v0.
- No auth/account system in v0 unless minimal local/dev identity is needed.
- No marketplace/discovery in v0.
- No social features in v0.
- No database in v0.
- No live LLM calls in v0.
- No vendor edits.

## Domain Model

### Provider

Business or operator profile that owns public booking surfaces and configuration. Fields: `ProviderId`, `Slug`, `DisplayName`, `Timezone`, `ContactEmail`, `PublicDescription`, `CreatedAt`, `UpdatedAt`.

### Resource

Bookable capacity unit. Fields: `ResourceId`, `ProviderId`, `DisplayName`, `ResourceType`, `Timezone`, `CapacityMode`, `IsActive`, metadata. `CapacityMode` starts with `Exclusive`; future modes may include pooled or capacity-counted resources.

### Service

Customer-selectable appointment type. Fields: `ServiceId`, `ProviderId`, `Name`, `Description`, `Duration`, `BufferBefore`, `BufferAfter`, `AssignedResourceIds`, `BookingPolicyId`, `IsPublic`.

### AvailabilityRule

Recurring or date-specific rule that says when a resource can be booked. Fields: `AvailabilityRuleId`, `ProviderId`, `ResourceId`, `Timezone`, `DaysOfWeek`, `LocalStartTime`, `LocalEndTime`, `EffectiveFrom`, `EffectiveUntil`, `Exceptions`.

### BookableSlot

Derived offer, not durable truth. Fields: `ServiceId`, `ResourceId`, `ZonedTimeRange`, `DecisionId`, `GeneratedAt`, `ExpiresAt`. Slots are regenerated from provider/resource/service config plus confirmed bookings and active holds.

### Hold

Temporary exclusive claim on a resource interval. Fields: `HoldId`, `ProviderId`, `ServiceId`, `ResourceId`, `ZonedTimeRange`, `CustomerDraft`, `Status`, `CreatedAt`, `ExpiresAt`, `ClaimToken`.

### Booking

Confirmed or terminal appointment record. Fields: `BookingId`, `ProviderId`, `ServiceId`, `ResourceId`, `CustomerContact`, `ZonedTimeRange`, `Status`, `PolicySnapshot`, `CreatedAt`, `UpdatedAt`, `ConfirmedAt`, `CancelledAt`.

### BookingPolicy

Rules for booking, confirmation, cancellation, payment, reminders, and buffers. v0 implements local rules only. Fields: `BookingPolicyId`, `ProviderId`, `HoldTtl`, `MinimumNotice`, `MaximumAdvanceWindow`, `CancellationWindow`, `RequiresDeposit`, `RequiresPrepay`.

### BookingEvent / AuditEvent

Append-only explanation record. Fields: `EventId`, `ProviderId`, `ResourceId`, `BookingId`, `HoldId`, `EventType`, `OccurredAt`, `Actor`, `CorrelationId`, `DecisionInputs`, `DecisionResult`, `Message`.

### CustomerContact

Customer-supplied contact info. Fields: `Name`, `Email`, `Phone`, `Notes`, consent flags later. v0 stores only what the customer enters and should avoid account semantics.

### TimeRange / ZonedTimeRange

`TimeRange` stores UTC instants: `StartUtc`, `EndUtc`. `ZonedTimeRange` adds `TimeZoneId`, `LocalStart`, `LocalEnd`, and timezone database/version metadata if available. IANA timezone ids are preferred at API boundaries.

### Invariants

- An exclusive resource interval cannot have two confirmed bookings that overlap.
- Active hold claims for the same exclusive resource cannot overlap each other or confirmed bookings.
- Hold creation and confirmation must be atomic for the resource interval in the supported deployment model.
- Expired holds release slots and emit audit events.
- Cancelled bookings release slots only according to `BookingPolicy`.
- Timezone is stored and returned explicitly for availability rules, slots, holds, and bookings.
- Every slot visibility and claim decision should be explainable from audit events or decision logs.

## Booking Lifecycle

Suggested lifecycle:

```text
OpenSlot -> Held -> IntakeSubmitted -> Confirmed -> Completed
Held -> Expired
Confirmed -> Cancelled
Confirmed -> NoShow
Confirmed -> Rescheduled
```

`OpenSlot` is derived from rules and conflicts; it does not need a durable state record. `Held`, `IntakeSubmitted`, `Confirmed`, `Completed`, `Expired`, `Cancelled`, `NoShow`, and `Rescheduled` should be represented in the booking lifecycle HFSM once the engine is Dominatus-backed.

Dominatus/HFSM should own lifecycle state, transition guards, checkpoint boundaries, and trace/audit correlation. Domain records should own provider/resource/service configuration, customer contact data, concrete time ranges, resource ids, and policy snapshots. Blackboard data can hold the current booking aggregate, selected service/resource, intake draft, active policy snapshot, and last decision report.

Application-level atomic transitions:

- create hold from generated slot;
- submit intake against a live hold;
- confirm held booking;
- cancel confirmed booking;
- expire hold;
- reschedule by cancelling/releasing one interval and claiming another according to policy.

Audit events:

- `SlotGenerated`, `SlotHidden`, `HoldRequested`, `HoldCreated`, `HoldRejectedConflict`, `HoldExpired`, `IntakeSubmitted`, `BookingConfirmed`, `BookingRejectedConflict`, `BookingCancelled`, `BookingCompleted`, `BookingNoShow`, `BookingRescheduled`, `PolicyApplied`.

## Dominatus Boundary

Scheduling v0 should be Dominatus-backed from day one for booking lifecycle sessions and checkpoint/audit boundaries, but not every CRUD record needs to be a Dominatus world.

Use Dominatus for:

- booking lifecycle HFSM;
- state/checkpoint persistence for booking sessions;
- trace/audit event boundaries;
- blackboard snapshots for explainable booking decisions;
- later calendar-file actuation if `Dominatus.Actuators.Standard` package availability and security fit;
- later payment actuation only after real providers, webhooks, idempotency, and ledger policy exist;
- later LLM context packets without live LLM calls.

Keep Leviathan/product code responsible for:

- app manifest and app-aware routing;
- provider/resource/service configuration APIs;
- availability rule storage;
- slot generation and conflict checks;
- customer/provider DTOs;
- local file layout and product metadata;
- auth/account integration later.

Do not use live LLMs in v0. Do not depend on WIP payments packages for commercial behavior.

## Availability and Atomic Claim Model

### Slot generation

At a high level:

1. Load provider timezone, service duration/buffers, assigned resources, availability rules, confirmed bookings, and active holds.
2. Expand availability rules into candidate local intervals over the requested date range.
3. Convert candidate intervals to UTC instants with explicit timezone handling.
4. Slice candidates into service-duration slots respecting buffers, minimum notice, and maximum advance window.
5. For each assigned resource, remove intervals that overlap confirmed bookings, active holds, rule exceptions, or policy blackout windows.
6. Emit `BookableSlot` DTOs with decision ids and optionally debug explanations.

### Overlap check

For exclusive resources, intervals conflict when `candidate.StartUtc < existing.EndUtc && existing.StartUtc < candidate.EndUtc`. Buffers should be applied before overlap comparison so adjacent appointments remain valid only when policy permits them.

### Hold creation atomicity

In local/file-backed v0, use a resource-scoped in-process lock keyed by `ProviderId + ResourceId`. Under that lock:

1. expire stale holds for the resource;
2. re-run overlap checks against confirmed bookings and active holds;
3. write the hold and audit event;
4. checkpoint if using a Dominatus session;
5. return a hold token.

Default hold TTL should be short, such as 10 minutes, configurable through `BookingPolicy`.

### Confirmation validation

Confirmation requires a live hold token, matching service/resource/time range, non-expired TTL, successful intake validation, and a final overlap check under the same resource lock. A conflict returns a typed error such as `slot_conflict` with a safe explanation and a prompt to pick another slot.

### Concurrency assumptions

M8/v0 is scoped to a single server process using in-process locks plus file-backed persistence. This can prevent double booking inside one Leviathan process, but it does not guarantee safety across multiple processes, containers, or servers sharing the same files. Multi-process or multi-server deployment will require a stronger lock/transaction primitive, such as database transactions, distributed locks, or an append-only event store with compare-and-swap semantics. That stronger persistence layer is intentionally out of scope for M7/M8.

## Calendar / Sync Strategy

v0 internal availability and booking records are the source of truth. No Google/Microsoft OAuth or external calendar sync is implemented in v0.

Later strategy:

- early `.ics` export may use `Dominatus.Actuators.Standard` calendar-file helpers if package availability, sandboxing, and security review fit;
- later Google/Microsoft push sync should use inspectable `SyncEvent` logs with provider event ids, sync direction, conflict status, and retry/error diagnostics;
- external calendars can create conflicts or annotations, but they must never silently override booking truth without an audit trail;
- provider-visible diagnostics should explain why a slot disappeared, why sync failed, and which external event caused a conflict.

## Payment Strategy

No real payment integration in v0.

Later strategy:

- represent deposit/prepay requirements as `BookingPolicy` fields;
- allow policy choices such as payment before hold confirmation, payment before final confirmation, or manual confirmation after payment;
- use Dominatus payment actuation only when real provider adapters, webhooks, persisted ledger/reconciliation, refunds, idempotency, and operational guidance are ready;
- fake payment providers can be useful for tests and demos later, but not for commercial payment handling.

## API Sketch

Scheduling should expose app-specific product APIs under `/api/apps/scheduling`. Generic `/api/apps/{appId}/sessions` remains useful for Dominatus-backed booking lifecycle/debug sessions, but provider setup, public booking, holds, and bookings need typed scheduling APIs.

```http
GET  /api/apps/scheduling
POST /api/apps/scheduling/providers
GET  /api/apps/scheduling/providers/{providerId}
POST /api/apps/scheduling/resources
POST /api/apps/scheduling/services
POST /api/apps/scheduling/services/{serviceId}/resources
POST /api/apps/scheduling/availability-rules
GET  /api/apps/scheduling/bookings?providerId=...

GET  /api/apps/scheduling/public/{providerSlug}
GET  /api/apps/scheduling/public/{providerSlug}/services
GET  /api/apps/scheduling/public/{providerSlug}/slots?serviceId=...&from=...&to=...&timeZone=...

POST /api/apps/scheduling/holds
POST /api/apps/scheduling/holds/{holdId}/intake
POST /api/apps/scheduling/bookings/confirm
GET  /api/apps/scheduling/bookings/{bookingId}
POST /api/apps/scheduling/bookings/{bookingId}/cancel
GET  /api/apps/scheduling/bookings/{bookingId}/audit
```

Potential session use:

```http
POST /api/apps/scheduling/sessions
GET  /api/apps/scheduling/sessions/{sessionId}/screen
```

Use sessions for lifecycle/debug surfaces, not as the only product API. The customer booking flow should be usable through product endpoints without requiring Ariadne-style prompt endpoints.

## Machina Screen Map

| Screen | Route | Layout regions | Responsibility | Dispatch events | Backend endpoints |
| --- | --- | --- | --- | --- | --- |
| Provider setup | `/apps/scheduling/setup/provider` | shell header, provider form, status/error panel | Scheduling app owns form and validation; shell owns app chrome | `scheduling.provider.create`, `scheduling.provider.saved`, `api.failed` | `POST /api/apps/scheduling/providers` |
| Service/resource setup | `/apps/scheduling/setup/services` | resource list, service editor, assignment panel | Scheduling app owns resource/service CRUD | `scheduling.resource.create`, `scheduling.service.create`, `scheduling.service.assign-resource` | `POST /resources`, `POST /services`, `POST /services/{serviceId}/resources` |
| Availability setup | `/apps/scheduling/setup/availability` | weekly grid, timezone banner, rule editor | Scheduling app owns rule editor; platform may supply timezone display utility | `scheduling.availability.save`, `scheduling.timezone.changed` | `POST /availability-rules` |
| Provider bookings list | `/apps/scheduling/bookings` | filters, bookings table, details drawer | Scheduling app owns list/detail/cancel flow | `scheduling.bookings.load`, `scheduling.booking.cancel` | `GET /bookings`, `POST /bookings/{bookingId}/cancel` |
| Public booking page | `/book/{providerSlug}` | provider hero, service list, timezone selector | Scheduling app owns public flow; shell provides route host only | `scheduling.public.load-provider`, `scheduling.service.select` | `GET /public/{providerSlug}`, `GET /public/{providerSlug}/services` |
| Slot picker | `/book/{providerSlug}/{serviceId}/slots` | date range controls, slot list, explanation drawer | Scheduling app owns slot query and display | `scheduling.slots.load`, `scheduling.slot.select`, `scheduling.hold.create` | `GET /public/{providerSlug}/slots`, `POST /holds` |
| Intake form | `/book/{providerSlug}/hold/{holdId}` | hold countdown, contact form, notes | Scheduling app owns intake draft and validation | `scheduling.intake.submit`, `scheduling.booking.confirm` | `POST /holds/{holdId}/intake`, `POST /bookings/confirm` |
| Confirmation page | `/book/{providerSlug}/confirmed/{bookingId}` | confirmation summary, calendar export placeholder | Scheduling app owns confirmation state | `scheduling.booking.load`, `scheduling.ics.download-later` | `GET /bookings/{bookingId}` |
| Debug/audit panel | provider routes plus debug flag | audit timeline, decision details, raw DTO snapshot | App exposes audit data; platform debug inspector renders generic shell state | `scheduling.audit.load`, `debug.toggle` | `GET /bookings/{bookingId}/audit` |

## Persistence and Audit Model

No database is introduced. M8 should use local file persistence following the existing Leviathan/Dominatus style.

Proposed layout under the data root:

```text
<data-root>/scheduling/
  providers/
    <providerId>/
      provider.json
      resources/<resourceId>.json
      services/<serviceId>.json
      availability-rules/<ruleId>.json
      bookings/<bookingId>/
        booking.json
        audit.jsonl
        checkpoint.dom1
        manifest.json
      holds/
        active/<holdId>.json
        expired/<holdId>.json
      audit/
        events-YYYY-MM.jsonl
```

Provider/service/resource configuration is Leviathan product metadata stored as JSON for M8. Dominatus chunk truth is lifecycle state/checkpoints for booking sessions, including HFSM state and blackboard snapshots. Leviathan/product metadata includes public provider profile, service catalog, availability rules, durable booking summaries, and list/query indexes.

Audit should be append-oriented. `audit.jsonl` beside a booking gives a booking-local trace; monthly provider-level audit chunks support provider diagnostics and later export. Writes should use temp-file-and-rename or append policies where practical, but M8 does not need to solve crash-proof multi-file transactions.

`Dominatus.Assets.Toml` may be useful later for provider/service fixtures, templates, and test data. It is not required for M8 unless fixture authoring becomes painful. Do not build a custom TOML loader first.

Future migration targets include database/cloud storage for multi-process locking, tenant isolation, query performance, reporting, and backups. The domain model should keep ids and event types stable enough to migrate from files.

## Monetization Path

Pricing should align with complexity and operating cost rather than punish simple use.

Free/simple tier:

- one provider;
- one resource;
- one service or limited services;
- basic booking link;
- local/internal availability;
- basic confirmation page.

Paid later:

- multiple resources;
- multiple staff/resources and teams;
- deposits/payments;
- SMS reminders;
- advanced branding;
- external calendar sync;
- audit export and team/operator features;
- analytics/reporting;
- priority support and higher availability guarantees.

## Risks

- Timezones: DST, ambiguous local times, provider/customer timezone mismatch, and timezone database changes can create subtle bugs.
- Concurrency/double-booking: in-process locks are sufficient only for a single server process.
- File persistence limitations: multi-file consistency, crash recovery, query performance, and shared filesystem semantics are limited.
- No auth in v0: provider/admin routes must remain local/dev or explicitly unsafe for public deployment until auth exists.
- External calendar sync complexity: OAuth, tokens, provider rate limits, webhook reliability, recurrence models, and conflict semantics are hard.
- Payment complexity: webhooks, refunds, disputes, tax, ledger reconciliation, and compliance are commercial-grade problems.
- Over-generalization: making Scheduling a universal resource allocator too early could slow down a concrete small-business booking MVP.
- Platform pollution: scheduling concepts must not leak into core app registry, shell, or session abstractions.
- Debug data privacy: audit logs may include customer contact info and must be redacted/exported carefully later.

## M8 Implementation Plan

M8 should be the first implementation milestone and remain small:

1. Create modular backend folder `src/Leviathan.Server/Apps/Scheduling/`.
2. Add `SchedulingAppDefinition` with manifest id `scheduling`, route `/apps/scheduling`, runtime `scheduling.dominatus`, and persistence scope `scheduling`.
3. Add minimal in-memory/local file provider, resource, service, and availability config storage.
4. Add app-specific product endpoints under `/api/apps/scheduling`.
5. Add modular frontend folder `src/Leviathan.Web/src/apps/scheduling/` with basic provider setup and public booking screens.
6. Implement slot generation, hold creation, hold expiry, intake submission, and confirmation lifecycle without external calendar sync, payments, SMS, auth, social features, database, or live LLMs.
7. Use Dominatus for booking lifecycle HFSM/checkpoint boundaries if the dependency surface remains small.
8. Add tests for no double-booking on the same exclusive resource and allowing the same time on different resources.
9. Add audit/decision logs sufficient to explain slot generation and claim rejection.

Success criterion: a single Leviathan server process can host both RustSimulator and Scheduling, create a provider/resource/service, show public slots, hold one slot atomically, confirm it into a booking, reject an overlapping booking on the same resource, and allow the same interval on another resource.

## Verification

This M7 milestone is documentation/specification only. Verification commands run for repository health, not for scheduling implementation success.

- `dotnet restore`
- `dotnet build Leviathan.slnx`
- `dotnet test`

The uploaded note path `/mnt/data/Claude on Calendly.txt` was checked but did not exist in the container. The report therefore used the critique bullets provided in the prompt as the source of Calendly pain points.

## M8 follow-up note

M8 implemented the first Scheduling skeleton as a modular local app under `src/Leviathan.Server/Apps/Scheduling` and `src/Leviathan.Web/src/apps/scheduling`. It registers `scheduling` through the app registry, exposes local file-backed provider/resource/service/availability/hold/booking APIs, and proves exclusive-resource atomic holds in a single server process. Dominatus lifecycle migration, real timezone expansion, auth, database persistence, external calendar sync, SMS, and payments remain deferred.
