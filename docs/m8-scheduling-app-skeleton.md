# M8 Scheduling App Skeleton and Atomic Booking MVP

## Implementation summary

M8 adds Leviathan's second statically hosted app, `scheduling`, beside `rust_simulator`. The app is intentionally local-only: no database, auth, payments, SMS, external calendar sync, marketplace, social layer, live LLM calls, or vendor edits.

## App manifest

- `appId`: `scheduling`
- `displayName`: `Scheduling`
- `kind`: `scheduling.resource-booking`
- `runtime`: `scheduling.local.v1`
- `frontendRoute`: `/apps/scheduling`
- `persistenceScope`: `scheduling`
- capabilities: `provider.config`, `resource.booking`, `availability.rules`, `holds`, `bookings`, `audit.local`

The app registry now indexes all `ILeviathanAppDefinition` instances while session APIs still bind only `ILeviathanSessionApp` runtimes. This lets Scheduling register without pretending to be an Ariadne session app.

## Backend module structure

Scheduling backend code lives under `src/Leviathan.Server/Apps/Scheduling/`:

```text
SchedulingAppDefinition.cs
Domain/SchedulingIds.cs
Domain/SchedulingDomain.cs
Storage/SchedulingStore.cs
Storage/SchedulingFileStore.cs
Engine/SlotGenerator.cs
Engine/BookingClaimService.cs
Engine/ResourceLockRegistry.cs
Api/SchedulingDtos.cs
Api/SchedulingEndpoints.cs
```

## API endpoints

All M8 product endpoints are under `/api/apps/scheduling`.

Provider/admin setup endpoints are local-dev unsafe until auth exists:

```http
POST /api/apps/scheduling/providers
GET  /api/apps/scheduling/providers/{providerId}
POST /api/apps/scheduling/resources
POST /api/apps/scheduling/services
POST /api/apps/scheduling/services/{serviceId}/resources
POST /api/apps/scheduling/availability-rules
GET  /api/apps/scheduling/bookings?providerId=...
```

Public booking endpoints:

```http
GET  /api/apps/scheduling/public/{providerSlug}
GET  /api/apps/scheduling/public/{providerSlug}/services
GET  /api/apps/scheduling/public/{providerSlug}/slots?serviceId=...&from=...&to=...&timeZone=...
POST /api/apps/scheduling/holds
POST /api/apps/scheduling/holds/{holdId}/intake
POST /api/apps/scheduling/bookings/confirm
GET  /api/apps/scheduling/bookings/{bookingId}
GET  /api/apps/scheduling/bookings/{bookingId}/audit?providerId=...
```

## Local file layout

Scheduling persists beneath `<LEVIATHAN_DATA_DIR>/scheduling/providers/<providerId>/`:

```text
provider.json
resources/<resourceId>.json
services/<serviceId>.json
availability-rules/<ruleId>.json
holds/active/<holdId>.json
holds/expired/<holdId>.json
holds/consumed/<holdId>.json
bookings/<bookingId>/booking.json
bookings/<bookingId>/audit.jsonl
audit/events-YYYY-MM.jsonl
```

JSON files are the local product state. Audit files are JSONL and append-only in the normal path.

## Claim and locking model

M8 supports exclusive resources only. The claim engine uses an in-process `SemaphoreSlim` keyed by `providerId:resourceId`.

Hold creation under the resource lock:

1. expire stale active holds for the resource;
2. reject overlap with confirmed bookings;
3. reject overlap with active, non-expired holds;
4. create a 10-minute hold and claim token;
5. write hold and audit event.

Confirmation under the same resource lock:

1. require hold id and claim token;
2. reject expired holds;
3. require submitted intake or intake in the confirmation request;
4. re-check confirmed booking overlap;
5. create confirmed booking;
6. move the hold out of `active`;
7. write booking and audit events.

Conflicts return `slot_conflict` rather than crashing.

## Slot generation

The generator expands active weekly rules over the requested UTC date window, slices availability by service duration, and removes intervals blocked by confirmed bookings or active holds. M8 treats local rule times as UTC for the first proof. Timezone ids are still explicit in stored/returned DTOs so later timezone hardening has a clear field boundary.

Buffers are represented on services and included in cursor advancement, but advanced policy behavior is deferred.

## Frontend module structure

Scheduling frontend code lives under `src/Leviathan.Web/src/apps/scheduling/`:

```text
api.ts
types.ts
routes.ts
layouts.ts
views.tsx
dispatch.ts
```

The shell recognizes `/apps/scheduling` and `/book/...` as scheduling routes. The M8 UI is intentionally skeletal: it provides app routing and basic Scheduling screens/components while tests prove API endpoint declarations, generic open-app dispatch, slot-selection action emission, and confirmation rendering.

## Dominatus boundary

M8 does not use Dominatus for Scheduling. This is a deliberate simplification: provider/resource/service/availability records are product data, and the claim engine needed a direct local proof first. The booking lifecycle is the right candidate for a future Dominatus HFSM/checkpoint migration once the domain states stabilize.

Recommended M9/M10 Dominatus migration:

- model hold lifecycle transitions as a Dominatus workflow;
- checkpoint claim decisions and audit inputs;
- keep provider configuration as app-owned product data;
- expose read-only lifecycle inspection through the existing debug/operator patterns.

## Known concurrency limits

- The resource lock is in-process only; it protects a single Leviathan server process, not multi-process or multi-node deployment.
- File writes are simple JSON writes/appends, not transactional database commits.
- Timezone expansion is explicit but simplified; local availability times are currently treated as UTC.
- Admin/setup endpoints have no auth and are local-dev only.

## Manual verification steps

1. Start with a clean `LEVIATHAN_DATA_DIR`.
2. Run the backend and frontend.
3. Open `/apps` and verify both Rust Simulator and Scheduling appear.
4. Open `/apps/scheduling`.
5. Create provider, resource, service, assignment, and availability through the API.
6. Query `/api/apps/scheduling/public/{slug}/slots`.
7. Create a hold, submit intake, and confirm the booking.
8. Try the same interval/resource and verify `slot_conflict`.
9. Add another resource and verify the same interval can be held.
10. Inspect booking/audit files under the scheduling data root.

## Recommended M9

- Harden scheduling persistence and audit atomicity.
- Add `.ics` export if it remains trivial and local-only.
- Improve provider setup UX from skeletal screens to guided forms.
- Introduce a minimal local/dev identity boundary before any external use.
- Harden timezone expansion with real IANA timezone conversion.
