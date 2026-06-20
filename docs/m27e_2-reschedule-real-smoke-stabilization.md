# Leviathan M27E.2: Reschedule Real Smoke Stabilization

## Purpose

M27E.2 stabilizes the dedicated real-browser reschedule smoke without expanding product scope.

The goal of this pass was to make the live end-to-end reschedule journey green while preserving the existing safe replacement semantics:

- old booking stays confirmed until replacement confirmation succeeds
- replacement hold is created
- replacement payment gating remains honest
- replacement booking confirms
- old booking becomes `rescheduled`
- new booking remains `confirmed`

## Original failure

The dedicated reschedule smoke was failing after replacement confirmation during the follow-on provider bookings verification step.

What succeeded before the failure:

- live provider/resource/service/availability setup
- public booking creation
- initial payment-required plus fake/local satisfy path
- initial booking confirmation
- reschedule affordance visibility
- replacement slot selection
- replacement hold creation
- replacement replacement-intake submission
- replacement payment gating handling
- replacement confirmation

Where it failed:

- after navigating to `/apps/scheduling/bookings?...` for post-confirmation verification
- the page rendered as a white screen in the failing runs
- Playwright then failed waiting for the `Provider bookings` heading

Failure evidence from the reproduced run:

- route at failure:
  - `/apps/scheduling/bookings?providerId=...&debug=1&debugOverlay=nonInteractiveOverlay&apiBaseUrl=...`
- visible UI:
  - blank body / white screenshot
- browser error:
  - React error 31 complaining that an object with keys `{ value }` was being rendered
- controlled network responses also present:
  - `400 /api/apps/scheduling/bookings/confirm`
  - these were expected payment-gating responses during the replacement confirm path, not the root cause

## Diagnosis

The failing state was a frontend live-response mismatch plus an overly broad follow-on assertion.

Actual root cause:

- live booking responses already carried reschedule relation ids
- but the reschedule relation fields could arrive as typed id objects shaped like `{ value: "..." }`
- the frontend treated `rescheduledToBookingId`, `rescheduledFromBookingId`, `replacementHoldId`, and `replacementBookingId` as plain strings
- the provider bookings/detail route then tried to render those raw objects directly, which caused the React white-screen failure

Secondary test issue:

- once the white-screen bug was fixed, the smoke still expected both `Rescheduled to` and `Rescheduled from` to appear in the same provider detail panel
- the real UI correctly shows:
  - old booking detail: `Rescheduled to ...`
  - new booking detail: `Rescheduled from ...`
- so the test needed to inspect both bookings rather than assume one detail pane would show both directions at once

Classification:

- primary failure type: frontend API-shape normalization bug
- secondary failure type: post-confirmation selector/assertion logic
- backend semantic bug: not found

## Real API response findings

Observed through the instrumented Playwright flow and the final live provider surface:

1. replacement hold creation succeeded
   - replacement hold id was returned
   - old booking id was returned
   - target slot metadata was present
   - lifecycle information remained available

2. fake/local payment satisfaction succeeded when required
   - the replacement flow could still surface `payment_required`
   - fake/local satisfy cleared the controlled payment gate

3. replacement confirmation succeeded
   - the live flow advanced to `Replacement confirmed`
   - the result surface showed both relation directions:
     - old booking `Rescheduled to ...`
     - new booking `Rescheduled from ...`

4. provider bookings response after confirmation contained both live bookings
   - old booking status: `rescheduled`
   - new booking status: `confirmed`

5. old booking detail/lifecycle after confirmation showed:
   - `Rescheduled to <new booking id>`
   - replacement hold linkage
   - `booking_rescheduled` in audit trail

6. new booking detail after inspection showed:
   - `Rescheduled from <old booking id>`

Expected controlled error behavior remained true:

- the smoke still sees `400 /bookings/confirm` while payment is still required
- that is part of the honest local payment-gating path, not a regression

## Fix applied

Frontend API normalization:

- normalized live booking relation fields in `src/Leviathan.Web/src/apps/scheduling/api.ts`
- specifically normalized:
  - `rescheduledToBookingId`
  - `rescheduledFromBookingId`
  - `replacementHoldId`
  - `replacementBookingId`
- applied normalization consistently to:
  - `listProviderBookings`
  - `getBooking`
  - `confirmBooking`
  - `cancelBooking`

Live confirmation follow-on:

- updated the confirmation reschedule callback in `src/Leviathan.Web/src/apps/scheduling/views.tsx` to preserve the replacement booking id in live context when the replacement confirms

Dedicated real smoke updates:

- kept the dedicated smoke strict about real lifecycle behavior
- stopped asserting both relation directions from one old-booking detail panel
- now verifies:
  - replacement result surface shows both directions
  - provider list shows both `Rescheduled` and `Confirmed`
  - old booking detail shows `Rescheduled to`
  - replacement booking detail shows `Rescheduled from`
- retained precise interactions instead of broad selectors
- used the same deliberate DOM-click approach for the provider-row inspect action because the Machina debug overlay can intercept pointer events in this test mode

## Exact assertions now covered

`tests/scheduling-real-reschedule.spec.ts` now proves:

- reschedule affordance appears for a confirmed booking
- replacement slot selection works
- replacement hold is created
- replacement payment-required gating is handled honestly
- replacement confirmation completes
- replacement result surface shows:
  - `Replacement confirmed`
  - `Rescheduled to`
  - `Rescheduled from`
- provider bookings surface shows:
  - one `Rescheduled` booking
  - one `Confirmed` booking
- provider old-booking detail shows `Rescheduled to`
- provider replacement-booking detail shows `Rescheduled from`

## UI/API changes made

Files changed for M27E.2:

- `src/Leviathan.Web/src/apps/scheduling/api.ts`
- `src/Leviathan.Web/src/apps/scheduling/views.tsx`
- `src/Leviathan.Web/tests/scheduling-real-reschedule.spec.ts`

Backend files changed:

- none

## Screenshots and handoff artifacts inspected

Inspected while stabilizing:

- failing Playwright white-screen artifact:
  - `src/Leviathan.Web/test-results/playwright/.../test-failed-1.png`
- real reschedule handoff bundles:
  - `src/Leviathan.Web/test-results/ui-snapshots-real/real-reschedule-available/screenshot.png`
  - `src/Leviathan.Web/test-results/ui-snapshots-real/real-reschedule-picker/screenshot.png`
  - `src/Leviathan.Web/test-results/ui-snapshots-real/real-reschedule-result/screenshot.png`
  - `src/Leviathan.Web/test-results/ui-snapshots-real/real-reschedule-result/handoff.json`

## Tests run

Frontend verification run locally:

- `cd src/Leviathan.Web`
- `npm run build`
- `npm test -- --run`
- `npm run test:e2e`
- `npm run test:e2e:real`
- `npm run test:e2e:reschedule`

Observed results:

- `npm run build`: passed
- `npm test -- --run`: passed
- `npm run test:e2e`: passed
- `npm run test:e2e:real`: passed
- `npm run test:e2e:reschedule`: passed

Backend solution verification:

- not run
- no backend files changed in this stabilization pass

## Known limitations

- the provider route verification still relies on explicit row inspection for the replacement booking rather than assuming the provider detail auto-focuses to the new booking
- the local payment-required path still intentionally produces controlled `400 /bookings/confirm` responses before fake/local payment satisfaction
- the smoke uses overlay-safe DOM-clicks in a few places because the non-interactive Machina debug overlay can intercept pointer events during browser coverage runs

## Remaining polish items

- optional provider bookings/detail polish if we want the replacement booking to become the default inspected row after live confirmation
- optional dedicated provider-relations handoff artifact if future debugging needs a narrower post-confirmation capture

## Recommended next milestone

- provider bookings/detail polish
- then mobile public booking polish
- then reusable Scheduling component extraction
- then deployment packaging preflight
