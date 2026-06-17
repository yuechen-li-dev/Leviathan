# M9 Scheduling Correctness Hardening

## Summary

M9 hardens the local Scheduling MVP without adding a database, auth, payments, SMS, external calendar sync, social/marketplace behavior, live LLM calls, or vendor changes.

## Timezone policy

Providers, resources, and availability rules carry explicit IANA timezone ids. Weekly availability windows are local wall-clock windows in the rule timezone. Slot generation converts each local rule boundary to UTC before conflict checks. Holds and bookings continue to store UTC instants in `ZonedTimeRange`.

Linux/.NET IANA ids are used directly. Invalid ids are rejected with `invalid_timezone` controlled errors.

## UTC/local display model

Booking truth is UTC. The public `timeZone` query parameter affects display fields only. Slot responses include UTC starts/ends, provider timezone, display timezone, and local display labels.

## DST/ambiguous time policy

Nonexistent local times are rejected during rule expansion with `invalid_local_time`. Ambiguous local times choose the earlier UTC instant deterministically. This keeps M9 small while preventing silent nonexistent-time bookings.

## Persistence hardening

JSON entity writes use temp-file plus rename/overwrite. Read/write failures and corrupt JSON raise controlled persistence errors. Booking/hold endpoints return safe 503 responses and do not confirm bookings if state cannot be loaded. JSONL audit appends now surface failures instead of being silently ignored.

Local file persistence remains single-process only; M9 does not solve multi-process transactional consistency.

## Audit improvements

Claim/audit events now include safe decision details such as resource, hold/booking ids, UTC interval, timezone id, decision, and conflict type where relevant. Broad audit events avoid customer contact details.

## Local/dev admin safety boundary

Unauthenticated provider/admin setup endpoints require `LEVIATHAN_ALLOW_UNSAFE_ADMIN=true` and return an `X-Leviathan-Unsafe-Admin: local-dev-only` warning header when allowed. Public booking endpoints remain usable without the gate. This is not auth.

## `.ics` status

M9 adds a tiny local `.ics` export at `GET /api/apps/scheduling/bookings/{bookingId}/ics`. It only renders confirmed local booking data and performs no OAuth, email sending, or external calendar sync.

## Tests added

Backend tests cover Los Angeles timezone expansion, customer display timezone behavior, invalid timezone handling, unsafe admin gating, corrupt JSON safety, existing same-resource conflict, different-resource allowance, expired hold release, app registry, and audit details. Frontend tests cover timezone context and useful error rendering.

## Known limitations

- File locking is in-process only.
- The admin gate is a local-dev safety boundary, not identity/auth.
- DST ambiguous-time behavior is deterministic but minimal.
- `.ics` export is intentionally simple and not external sync.

## Recommended M10

- Scheduling Dominatus lifecycle integration for booking workflows.
- Scheduling provider UX polish and local/dev identity boundary.
- Expand `.ics` fields if needed.
- Prepare payment/deposit contracts without real provider integration.

## M10 note

M10 preserves the M9 UTC/timezone and safe persistence behavior while adding Dominatus lifecycle checkpoints for hold, intake, confirmation, and expiration transitions. Holds and bookings continue to store UTC instants in Scheduling product JSON.
