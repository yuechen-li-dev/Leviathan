# M12 Scheduling Provider UX and Local Admin Boundary

## Purpose

M12 makes the Scheduling app demonstrable through the browser without changing its deployment model. The milestone focuses on provider setup, public booking clarity, provider booking review, cancellation reachability, and safe audit/lifecycle inspection.

This remains a local/demo hardening milestone. It does not add production authentication, accounts, payments, SMS, external calendar sync, a database, marketplace/discovery, live LLM calls, or full rescheduling.

## Local/dev admin boundary

Provider setup and provider-admin booking views call intentionally unsafe local endpoints. They are guarded by the backend setting:

```bash
LEVIATHAN_ALLOW_UNSAFE_ADMIN=true
```

The browser UI now repeats the boundary copy on Scheduling admin screens:

> Local/dev admin mode. Provider setup endpoints are intentionally unsafe and require `LEVIATHAN_ALLOW_UNSAFE_ADMIN=true`. Do not expose this server publicly.

If the unsafe admin gate is closed, admin screens render an explicit blocked message telling the operator to restart the backend with `LEVIATHAN_ALLOW_UNSAFE_ADMIN=true` for local demos only. Public booking pages are still intended to remain usable without the admin gate.

## How to run backend with admin mode

For a clean local demo, use an isolated data directory:

```bash
export LEVIATHAN_ALLOW_UNSAFE_ADMIN=true
export LEVIATHAN_DATA_DIR=$(mktemp -d)
dotnet run --project src/Leviathan.Server
```

Then start the frontend in another shell:

```bash
cd src/Leviathan.Web
npm install
npm run dev
```

Open `/apps/scheduling` in the browser.

## Provider setup flow

The provider setup surface documents the required end-to-end local demo path:

1. Create a provider with a browser/default IANA timezone.
2. Create a `person` resource.
3. Create a public 30-minute service.
4. Assign the service to the resource.
5. Create a Monday 09:00-17:00 availability rule.
6. Copy the generated public booking link, such as `/book/demo-provider`.

The flow intentionally avoids auth, custom branding, drag/drop calendars, payment settings, and external calendar configuration.

## Public booking flow

The public booking components emphasize timezone context and controlled errors:

1. Show provider name when available.
2. Show public services and duration.
3. Show slots with provider timezone and display timezone.
4. Create a hold from a selected slot.
5. Continue to intake.
6. Confirm the booking.
7. Show confirmation with service, resource, UTC time, timezone, booking id, and an ICS link for confirmed bookings only.
8. Render controlled conflict, expired, or invalid-timezone messages without exposing internals.

No SMS or email confirmation is sent.

## Bookings, cancel, audit, and lifecycle flow

Provider bookings UI now has demo-ready rendering for:

- provider booking list rows;
- human-readable Confirmed/Cancelled status;
- minimal customer name/email display;
- cancel action for confirmed bookings;
- ICS links only for confirmed bookings;
- selected booking audit events;
- selected booking lifecycle summary;
- cancellation reason/policy result when present.

The debug panel uses safe Scheduling audit and lifecycle summaries and does not expose the raw Dominatus blackboard.

## Screenshots / manual verification checklist

No screenshot is committed for M12. Manual verification checklist:

- [ ] Start backend with `LEVIATHAN_ALLOW_UNSAFE_ADMIN=true` and a clean `LEVIATHAN_DATA_DIR`.
- [ ] Start frontend.
- [ ] Open `/apps/scheduling`.
- [ ] Verify the local/dev admin warning is visible.
- [ ] Create provider/resource/service/availability.
- [ ] Copy and open the public booking link.
- [ ] Select service and slot; verify timezone labels are explicit.
- [ ] Submit intake and confirm booking.
- [ ] Verify confirmation shows booking id, timezone, and confirmed-only ICS link.
- [ ] Open provider bookings.
- [ ] View audit/lifecycle panel.
- [ ] Cancel a confirmed booking.
- [ ] Confirm status changes to Cancelled.
- [ ] Confirm cancelled slot becomes available again.
- [ ] Confirm ICS link is hidden for cancelled bookings.
- [ ] Confirm RustSimulator still opens from the app list.

## What remains unsafe / not production-ready

- Provider/admin endpoints are deliberately unsafe and gated only by a local-dev environment variable.
- There is no real authentication or account model.
- Data is file-backed, not database-backed.
- No production deployment boundary or authorization policy exists.
- No payment, refund, deposit, reminder, SMS, or external calendar provider exists.
- Full rescheduling is still deferred.

## Known limitations

- The provider setup UI is intentionally simple and wizard-like rather than a full calendar/admin product.
- Customer contact display remains minimal.
- ICS export remains a simple local calendar artifact for confirmed bookings.
- Audit/lifecycle display is summary-focused and intentionally omits raw Dominatus internals.

## Recommended M13

Good next options:

- Full reschedule workflow.
- Payment/deposit contract preparation without real providers.
- Reminder/notification contract without provider integration.
- Scheduling production-readiness preflight for auth/storage/deployment.
