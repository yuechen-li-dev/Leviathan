# M10 Scheduling Dominatus Booking Lifecycle Integration

## Purpose

M10 moves the stateful Scheduling booking claim lifecycle onto Dominatus checkpoints while keeping Scheduling provider/resource/service/availability configuration as ordinary Scheduling product data.

Dominatus is used for the workflow boundary where state changes matter: hold creation, intake submission, confirmation, and expiration. It is not used as a product data store and does not replace resource locking, slot generation, or provider setup CRUD.

## What moved to Dominatus

Each booking claim now gets a lifecycle checkpoint written with Dominatus save chunks. The checkpoint captures a small workflow blackboard and a Leviathan Scheduling companion chunk for safe summary restore.

Covered transitions:

```text
Start
  -> HoldCreated / AwaitingIntake
  -> IntakeSubmitted
  -> Confirmed
  -> Expired
```

The state catalog also reserves `Cancelled`, `Completed`, `NoShow`, and `Failed` for later endpoints and actuators.

## What remains plain Scheduling product data

These records remain file-backed Scheduling product JSON:

- providers
- bookable resources
- services
- availability rules
- active/expired/consumed hold JSON
- confirmed booking JSON
- booking audit JSONL

The claim service still owns conflict checks, same-resource locking, and slot claim decisions. Dominatus records lifecycle state and checkpoint boundaries; it does not own the low-level lock primitive.

## Blackboard key model

Scheduling lifecycle checkpoints write compact workflow keys under the `Scheduling.Booking.*` namespace:

- provider/resource/service ids
- hold id and optional booking id
- hashed claim-token reference only
- UTC start/end and time-zone id
- booking/hold status
- explicit workflow state
- intake-submitted flag
- last decision code
- last audit event id
- created/updated/expires timestamps

Customer contact details and provider/service/resource configuration are intentionally not written into the lifecycle blackboard.

## Checkpoint file layout

Hold lifecycle checkpoints are stored beside hold state:

```text
<data-root>/scheduling/providers/<providerId>/holds/active/<holdId>/
  lifecycle.dom1
  lifecycle-manifest.json
```

Expired lifecycle checkpoints are stored under:

```text
<data-root>/scheduling/providers/<providerId>/holds/expired/<holdId>/
  lifecycle.dom1
  lifecycle-manifest.json
```

Confirmed booking lifecycle checkpoints are stored beside booking state:

```text
<data-root>/scheduling/providers/<providerId>/bookings/<bookingId>/
  booking.json
  audit.jsonl
  lifecycle.dom1
  lifecycle-manifest.json
```

The `lifecycle.dom1` file uses Dominatus save chunks; the manifest is a safe summary used by operators and tests.

## Audit and trace correlation

Lifecycle-producing audit events now include safe lifecycle metadata:

- `lifecycleState`
- `lifecycleStatus`
- `lifecycleCheckpoint`

After each audit write, the lifecycle checkpoint is updated with the final `lastAuditEventId`, so the restored lifecycle summary correlates back to product audit records.

## Endpoint changes

Existing Scheduling endpoints remain compatible. M10 adds safe lifecycle summary endpoints:

- `GET /api/apps/scheduling/holds/{holdId}/lifecycle?providerId=<providerId>`
- `GET /api/apps/scheduling/bookings/{bookingId}/lifecycle`

The response exposes ids, current workflow state, status, checkpoint existence/path, last audit event id, and timestamps. It does not expose raw blackboard content.

## Tests added

Backend tests now prove:

- hold creation writes a Dominatus lifecycle checkpoint;
- intake advances lifecycle state and checkpoints;
- confirmation advances lifecycle to `Confirmed` and can be restored through the summary endpoint;
- expiration advances lifecycle to `Expired`;
- booking audit events contain lifecycle/checkpoint correlation;
- existing same-resource conflict, different-resource same-time, timezone, unsafe-admin, persistence-failure, and RustSimulator registry tests still pass.

## Known limitations

- Completion, no-show, and reschedule transitions remain modeled seams but are not exposed by endpoints. Cancellation is exposed by M11.
- The workflow does not call payment, reminder, SMS, or external calendar actuators.
- Lifecycle restore is currently for debug/audit summary, not for replacing Scheduling product JSON query paths.
- Claim conflict rejection audit events remain product-audit-only unless a hold workflow already exists.

## Recommended M11

- Provider UX polish and local/dev identity boundary.
- Scheduling cancellation/reschedule workflow.
- Payment/deposit contract preparation without real providers.
- Scheduling app packaging/demo polish.

## M11 cancellation update

M11 exposes the previously reserved `Cancelled` workflow state for confirmed bookings. `POST /api/apps/scheduling/bookings/{bookingId}/cancel` writes a cancellation audit event, updates the booking-local Dominatus checkpoint to `Cancelled`, and refreshes lifecycle audit correlation with the final cancellation audit event id. Reschedule remains documented as a deferred workflow rather than a dedicated Dominatus transition.


## M19 Rescheduled lifecycle

M19 extends the Scheduling booking lifecycle with `Rescheduled`. When a linked replacement hold is confirmed into a new booking, the new booking lifecycle remains `Confirmed` and records `RescheduledFromBookingId`, while the old booking lifecycle moves from `Confirmed` to `Rescheduled` and records `RescheduledToBookingId` and `ReplacementHoldId`. Dominatus integration remains scoped to booking workflow checkpoints and does not move Scheduling product data into platform core.
