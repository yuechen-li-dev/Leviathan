# M11 Scheduling Cancellation and Reschedule Workflow

## Purpose

M11 gives confirmed Scheduling bookings a safe way to leave `Confirmed` before deposits, refunds, reminders, or external calendar synchronization exist. The milestone intentionally keeps provider/resource/service/availability records as Scheduling product data and limits Dominatus usage to booking workflow state checkpoints.

## Cancellation policy

The M11 policy is deliberately small:

- only bookings with status `confirmed` can be cancelled;
- cancellation changes the booking status to `cancelled` and records `CancelledAt`;
- cancellation records the reason code, optional message, actor, and policy result on the booking;
- cancelled bookings are terminal for M11 and cannot be cancelled again;
- cancelled bookings no longer block future slot generation or same-resource hold creation;
- completed/no-show states remain reserved lifecycle seams and are not exposed by M11 endpoints.

No payment, refund, deposit, customer identity, or external calendar policy is implemented in M11.

## Cancellation API

M11 adds:

```http
POST /api/apps/scheduling/bookings/{bookingId}/cancel
```

Request body:

```json
{
  "reason": "customer_requested",
  "message": "Optional freeform note",
  "actor": "provider"
}
```

`actor` defaults to `local-dev` when omitted. `reason` defaults to `unspecified` if blank.

Responses:

- `200 OK` with the safe booking object, final cancellation audit event id, and lifecycle summary;
- `404 Not Found` for an unknown booking id;
- `409 Conflict` for an existing booking that is not cancellable under M11 policy;
- `503` controlled persistence problem if local file state cannot be safely read or written.

## Dominatus lifecycle transition

Cancellation advances the booking workflow checkpoint to `Cancelled`. The lifecycle summary for a cancelled booking exposes:

- booking id;
- provider/resource/service ids;
- status `cancelled`;
- current workflow state `Cancelled`;
- checkpoint presence/path;
- last audit event id;
- updated/cancelled timestamp through the summary update timestamp.

The lifecycle checkpoint remains beside the booking JSON under the existing booking directory.

## Slot release behavior

Confirmed bookings remain the only booking status that blocks generated slots and same-resource hold creation. Once a booking is cancelled, its resource interval is released and the same provider/resource/service interval can be held again through the normal claim engine.

Expired and consumed hold behavior is unchanged from M10. Completed/no-show booking statuses are still reserved and not product-reachable in M11.

## Audit events

M11 adds cancellation audit events:

- `booking_cancellation_requested`
- `booking_cancelled`
- `booking_cancellation_rejected`

Cancellation audit details include booking id, provider/resource/service context through the event envelope, interval start/end/timezone, actor, reason code, policy result, decision, and lifecycle checkpoint correlation for the final cancellation event. Customer contact details are not broadly logged.

## `.ics` behavior

The local `.ics` endpoint remains intentionally small. A confirmed booking returns the normal local-only VEVENT export. A cancelled booking returns a controlled `400 booking_not_confirmed` response instead of attempting full iCalendar cancellation/update semantics.

## Reschedule status

Full rescheduling is deferred. M11 documents the safe interim model:

1. create a new hold and booking through the normal flow;
2. cancel the old confirmed booking after the replacement booking is confirmed.

This avoids pretending there is an atomic reschedule while Scheduling still has no payments, refunds, reminders, external calendar sync, or real customer identity. A future milestone can add a dedicated reschedule hold endpoint and optional `Rescheduled` lifecycle state once policy and UX boundaries are clearer.

## Tests added

Backend tests cover:

- confirmed booking cancellation;
- cancellation metadata and policy result;
- cancellation audit events;
- lifecycle summary/checkpoint advancement to `Cancelled`;
- cancelled booking releasing the same resource interval;
- different-resource behavior remaining valid;
- unknown booking cancellation returning 404;
- already-cancelled booking returning controlled 409;
- confirmed `.ics` success and cancelled `.ics` controlled rejection.

Existing M9 timezone tests and app registry tests continue to run with the scheduling suite.

## Known limitations

- No full atomic reschedule endpoint exists in M11.
- No payment, refund, deposit, reminder, SMS, auth, or external calendar behavior is implemented.
- Cancellation policy is intentionally coarse and does not model provider-specific cutoff windows.
- `.ics` cancellation does not emit METHOD:CANCEL or sequence updates.
- Cancellation messages are stored on the booking for local product state, but audit events only record that a message exists.

## Recommended M12

Good next options are:

- provider UX polish and a clearer local/dev identity boundary;
- payment/deposit contract preparation without real providers;
- scheduling reminder/notification contract without provider integration;
- full reschedule workflow with a dedicated reschedule hold and finalization path.
