# M19 Scheduling Reschedule Workflow

## Purpose

M19 adds a safe internal reschedule workflow for confirmed Scheduling bookings without adding payments, notifications, real auth, external calendars, Semantic Kernel, Graph, or live LLM calls.

The core invariant is that the original booking remains `confirmed` while the replacement slot is being held, intake is being collected, or the replacement confirmation is pending. The old booking is only released after the replacement booking is successfully confirmed.

## Chosen reschedule model

M19 uses a distinct terminal old-booking status: `rescheduled`.

- A replacement hold is a normal Scheduling hold plus reschedule metadata:
  - `ReplacementForBookingId`
  - `RescheduleReasonCode`
  - `RescheduleMessage`
  - `RescheduleActor`
- A confirmed replacement booking is a normal `confirmed` booking plus:
  - `RescheduledFromBookingId`
  - `ReplacementHoldId`
- The original booking is updated to `rescheduled` only after the replacement booking is saved and the replacement hold is consumed. It records:
  - `RescheduledToBookingId`
  - `RescheduledAt`
  - `RescheduleReasonCode`
  - `RescheduleMessage`
  - `RescheduleActor`
  - `ReplacementHoldId`
  - `ReplacementBookingId`

Cancelled bookings remain the M11 cancellation model. M19 does not use `cancelled` to represent rescheduled bookings because reschedule semantics need an explicit old/new relation before refunds, reminders, calendar sync, or notifications exist.

## API endpoints

M19 adds:

```http
POST /api/apps/scheduling/bookings/{bookingId}/reschedule/holds
```

Request:

```json
{
  "serviceId": "...",
  "resourceId": "...",
  "startUtc": "2030-01-07T10:30:00Z",
  "endUtc": "2030-01-07T11:00:00Z",
  "timeZoneId": "UTC",
  "displayTimeZoneId": "UTC",
  "reason": "customer_requested",
  "message": "Optional note",
  "actor": "provider"
}
```

Response includes the old booking id, replacement hold id, claim token, target slot summary, audit event id, and hold lifecycle summary.

The existing intake and confirm endpoints are reused:

```http
POST /api/apps/scheduling/holds/{holdId}/intake
POST /api/apps/scheduling/bookings/confirm
```

During confirmation, the claim service detects `ReplacementForBookingId` on the hold and finalizes the reschedule.

## State and lifecycle transitions

Normal booking flow is unchanged:

```text
active hold -> intake submitted -> confirmed booking
```

Reschedule flow is:

```text
old confirmed booking
  -> replacement hold active / awaiting intake (old remains confirmed)
  -> replacement hold intake submitted (old remains confirmed)
  -> replacement booking confirmed
  -> old booking rescheduled
```

Dominatus lifecycle now includes `Rescheduled` for the old booking. The new booking lifecycle remains `Confirmed` and carries `RescheduledFromBookingId` in the summary. The old booking summary carries `RescheduledToBookingId` and `ReplacementHoldId`.

## Atomicity and locking model

- Replacement hold creation uses the normal resource-scoped lock on the target resource.
- The old booking remains `confirmed` and continues blocking its old interval while the replacement hold exists.
- If the replacement hold conflicts or expires, the old booking remains `confirmed`.
- Replacement confirmation acquires the target resource lock and, when the old booking is on a different resource, the old resource lock too.
- Multi-resource confirmation locks are acquired in deterministic provider/resource key order to avoid obvious same-process deadlock risk.
- Under those locks the service saves the new confirmed booking, consumes the replacement hold, updates the old booking to `rescheduled`, writes audit events, and writes lifecycle checkpoints.

Known limit: this remains a local file, single-process transaction boundary. M19 improves in-process correctness but does not provide a distributed transaction or database rollback guarantee if the process or filesystem fails between individual writes.

## Audit events

M19 writes these reschedule-specific events:

- `booking_reschedule_requested`
- `booking_reschedule_hold_created`
- `booking_reschedule_hold_rejected`
- `booking_reschedule_confirmed`
- `booking_rescheduled`
- `booking_reschedule_failed`

Audit data links the old booking, replacement hold, new booking when available, old/new intervals, old/new resources, actor, reason, decision, conflict reason where applicable, and lifecycle checkpoint correlation. Customer contact details are not broadly logged.

## Slot release behavior

Slot blocking remains status-based:

- `confirmed` bookings block slots.
- `rescheduled` bookings do not block slots.
- The replacement `confirmed` booking blocks the new slot.
- A failed, conflicting, or expired replacement hold leaves the original booking `confirmed`, so the original slot remains blocked.

## ICS behavior

The local `.ics` endpoint remains intentionally simple:

- confirmed replacement bookings export normally;
- old `rescheduled` bookings return `400 booking_rescheduled`;
- other non-confirmed bookings continue to return controlled non-confirmed errors.

M19 does not implement iCalendar update or cancellation semantics.

## Frontend behavior

M19 intentionally keeps provider UX modest and does not add a broad calendar UI. The backend API is ready for frontend/API-client integration. Manual local-dev API flow is documented above.

## Tests added

Backend tests cover:

- replacement hold conflict returns `slot_conflict` while the old booking remains `confirmed`;
- creating a replacement hold keeps the old booking `confirmed`;
- replacement hold lifecycle summary is written;
- replacement hold expiration leaves the old booking `confirmed`;
- replacement confirmation creates a new `confirmed` booking linked to the old booking;
- the old booking transitions to `rescheduled`;
- the old slot becomes available after successful reschedule;
- the new slot remains blocked after successful reschedule;
- old/new audit events are written and linked;
- old/new lifecycle summaries expose reschedule relation metadata;
- reschedule across different resources works;
- old rescheduled booking ICS returns `booking_rescheduled` while the new booking exports normally.

Existing same-resource conflict, cancellation, lifecycle, app registry, and RustSimulator registration tests continue to run.

## Known limitations

- No database or distributed transaction is added.
- No payments, refunds, deposits, reminders, SMS/email, Google/Microsoft calendar sync, real auth/OAuth, Semantic Kernel, Graph, live LLM, social, or marketplace integration is added.
- The replacement hold TTL remains the existing local 10-minute policy.
- There is no dedicated reschedule-confirm endpoint; existing intake/confirm endpoints finalize linked replacement holds.
- Frontend provider UX for reschedule remains a recommended follow-up.

## Recommended M20

Good M20 options:

- reminder/notification contract without provider integration;
- payment/deposit contract preparation without real providers;
- product metadata/query-plane preflight;
- provider UX/demo polish for reschedule.


## M20 payment-policy note

M20 preserves the M19 safe reschedule invariant. Payment transfer/carry-forward is represented only as deferred policy metadata; no refund, ledger, provider call, or real payment transfer is performed.
