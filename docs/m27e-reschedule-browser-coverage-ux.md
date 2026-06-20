# Leviathan M27E: Reschedule Browser Coverage and UX

## Purpose

M27E adds a browser-visible reschedule UX on top of the existing Scheduling backend reschedule workflow.

This milestone stays frontend-first. It does not add new backend domain semantics, auth, real payments, real notifications, external calendar integrations, database/query work, or a whole-app redesign.

## Existing backend reschedule support inventory

Backend support already existed before this pass:

- replacement hold creation endpoint:
  - `POST /api/apps/scheduling/bookings/{bookingId}/reschedule/holds`
- replacement hold request fields:
  - `serviceId`
  - `resourceId`
  - `startUtc`
  - `endUtc`
  - `timeZoneId`
  - `displayTimeZoneId`
  - `reason`
  - `message`
  - `actor`
- replacement hold response fields:
  - `oldBookingId`
  - `replacementHoldId`
  - `claimToken`
  - `targetSlot`
  - `auditEventId`
  - `lifecycle`
- replacement confirmation behavior:
  - existing `POST /api/apps/scheduling/holds/{holdId}/intake`
  - existing `POST /api/apps/scheduling/bookings/confirm`
  - confirmation detects `ReplacementForBookingId` on the hold and finalizes the safe replacement flow
- old/new relation fields already present in backend booking data:
  - old booking: `rescheduledToBookingId`, `replacementHoldId`, `replacementBookingId`, `rescheduledAt`, `rescheduleReasonCode`, `rescheduleMessage`, `rescheduleActor`
  - new booking: `rescheduledFromBookingId`, `replacementHoldId`
- lifecycle support already present in backend runtime summaries:
  - `currentWorkflowState`
  - `rescheduledFromBookingId`
  - `rescheduledToBookingId`
  - `replacementHoldId`
  - `paymentRequirementStatus`
  - `paymentReference`
- audit events already present:
  - `booking_reschedule_requested`
  - `booking_reschedule_hold_created`
  - `booking_reschedule_hold_rejected`
  - `booking_reschedule_confirmed`
  - `booking_rescheduled`
  - `booking_reschedule_failed`
- controlled errors/status already present:
  - `booking_not_reschedulable`
  - `slot_conflict`
  - `payment_required`
  - `booking_rescheduled` from old-booking ICS
  - booking status `rescheduled`

What was UI-missing before M27E:

- no frontend API wrapper for replacement hold creation
- no frontend DTO for `ReplacementHoldResponse`
- incomplete frontend lifecycle typing for backend relation fields
- no visible reschedule affordance on confirmation or live provider detail
- no browser flow for replacement slot selection, replacement hold, replacement confirm, and old/new relation display
- no dedicated reschedule snapshot coverage
- no dedicated real-browser reschedule smoke coverage

What remains deliberately not implemented:

- no new backend endpoint or semantic change
- no dedicated backend slot-discovery endpoint for reschedule; M27E reuses public slot discovery
- no real checkout
- no real customer login/auth
- no real notification or calendar provider flow

## UX design approach

The UI now treats reschedule as a safe replacement flow rather than cancel-then-book:

- confirmed bookings get a visible `Reschedule` entry point
- cancelled bookings do not expose reschedule
- old `rescheduled` bookings show relation state instead of a duplicate affordance
- the UI explains that the current booking stays active until the replacement confirms
- the replacement flow stays inside existing confirmation and provider-detail surfaces instead of creating a detached wizard

## Safe replacement model explanation

User-facing copy now says:

- `Your current booking stays confirmed until the new time is confirmed.`

The browser flow follows the existing backend behavior:

1. open a confirmed booking
2. open the reschedule panel
3. compare the current time against available replacement slots
4. create a replacement hold
5. submit replacement intake details
6. handle `payment_required` honestly when it appears
7. confirm the replacement booking
8. show old/new booking relations

## Frontend API and type additions

Added in the frontend client:

- `schedulingEndpoints.createReplacementHold(bookingId)`
- `createReplacementHold(...)`
- `ReplacementHoldResponse`

Expanded frontend typing to match existing backend responses more closely:

- booking reschedule relation and metadata fields
- lifecycle `currentWorkflowState`
- lifecycle reschedule relation fields
- lifecycle `hasCheckpoint`
- lifecycle provider/resource/service/hold/booking ids

Compatibility-oriented fields were preserved instead of replaced:

- `workflowState`
- `checkpointExists`

## Fixture and live behavior notes

Fixture updates added:

- `reschedule-available`
- `reschedule-picker`
- `reschedule-result`
- `rescheduled-booking-detail`

Fixture data now includes:

- a confirmed booking with reschedule affordance
- a replacement slot selection state
- a replacement hold response shape
- old/new reschedule relations
- rescheduled lifecycle and audit summaries

Live behavior now includes:

- reschedule panel on booking confirmation
- reschedule panel on live provider booking detail
- replacement hold creation through the real backend endpoint
- replacement intake submission through the existing hold endpoint
- replacement confirmation through the existing confirm endpoint
- honest payment-required handling when the replacement flow still surfaces controlled local/test payment gating

## Machina regions added and changed

Added confirmation/detail reschedule regions:

- `booking-reschedule-root`
- `booking-reschedule-current`
- `booking-reschedule-picker`
- `booking-reschedule-replacement`
- `booking-reschedule-actions`
- `booking-reschedule-result`

These regions were added to confirmation layouts and provider-bookings layouts without replacing Machina layout ownership.

## Screen catalog and snapshot coverage

Added screen catalog coverage:

- `reschedule-available-desktop`
- `reschedule-picker-desktop`
- `reschedule-result-desktop`
- `rescheduled-booking-detail-desktop`

Existing artifact names stayed stable for previously covered screens.

## Real backend smoke coverage

Kept stable:

- `npm run test:e2e:real`
- existing setup -> public booking -> payment-required -> fake satisfy -> confirm -> provider bookings -> cancel smoke path

Added:

- `npm run test:e2e:reschedule`
- dedicated real-browser reschedule script

Current result:

- the dedicated reschedule script reaches live setup, live confirmation, reschedule affordance, replacement slot selection, replacement hold creation, and replacement payment gating
- the post-confirmation live verification still fails and remains the main blocker for fully green real reschedule browser coverage

## Tests run

Frontend:

- `cd src/Leviathan.Web`
- `npm install`
- `npx playwright install chromium`
- `npm run build`
- `npm test -- --run`
- `npm run test:e2e`
- `npm run test:e2e:real`
- `npm run test:e2e:reschedule`

Observed results in this environment:

- `npm run build`: passed
- `npm test -- --run`: passed
- `npm run test:e2e`: passed
- `npm run test:e2e:real`: passed
- `npm run test:e2e:reschedule`: failed

Backend solution verification:

- not run
- no backend product files were edited for M27E

## Screenshots inspected

Inspected:

- `src/Leviathan.Web/test-results/ui-snapshots/reschedule-available-desktop/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots/reschedule-picker-desktop/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots/reschedule-result-desktop/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots/rescheduled-booking-detail-desktop/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots/booking-confirmation-desktop/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots-real/real-reschedule-available/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots-real/real-reschedule-picker/screenshot.png`

Confirmed from inspection:

- safe replacement wording is visible
- current versus replacement comparison is visible in fixture states
- old/new relation is explicit in the result fixture
- provider detail shows `Rescheduled to ...` on the old booking fixture state

## Human-user UX notes

Can a user tell reschedule is safe?

- Yes in fixture and confirmation UX. The replacement copy is plain and near the action.

Can they compare current versus replacement time?

- Yes. The panel shows the current booking and the selected replacement side by side in the same flow.

Can they tell the old booking remains active until replacement confirmation?

- Yes. That rule is stated directly and repeated again when the replacement hold exists.

Can they tell which booking is old versus new after success?

- Yes in the fixture result state. The old booking is labeled `Rescheduled` and the new booking is labeled `Confirmed`.

Does the provider view remain understandable?

- Mostly yes. The provider fixture detail remains readable, though the new reschedule detail pushes more content into the already-dense desktop capture.

What remains awkward?

- the desktop snapshot crops mean the reschedule picker/result content is not fully visible in a single top-of-page frame
- the live replacement flow can still surface `payment_required` later than the initial replacement hold view
- the dedicated real-browser reschedule smoke still does not complete cleanly after replacement confirmation

## Known limitations

- `npm run test:e2e:reschedule` is still failing after the live replacement confirmation phase
- the live provider-bookings follow-on verification after replacement confirmation remains unstable and needs another pass
- the fixture screenshots prove the UX clearly, but the desktop capture framing still favors the upper portion of the confirmation page
- no dedicated mobile reschedule snapshot was added in M27E

## Recommended next milestone

- provider bookings/detail polish focused on the live reschedule follow-on path
- then mobile public booking polish
- then reusable Scheduling component extraction or repeated ShadCN cleanup
