# Leviathan M27D: Booking Confirmation and Status UX Pass

## Purpose

M27D tightens Leviathan Scheduling's confirmation and status surfaces so the public booking flow does not end in ambiguity.

This milestone stays a frontend UX pass only.

Kept unchanged:

- backend behavior
- auth/login
- real payment providers
- real email/SMS/calendar providers
- database/query work
- whole Scheduling-app redesign
- MachinaLayout as page-level layout authority
- handoff compatibility fields

## Current awkwardness inventory

Observed before the M27D edits:

- booking confirmation exposed the right fields, but it still read like a debug summary more than a trust-building confirmation page
- confirmation emphasized raw ids and UTC-ish fields before plainly answering whether the booking worked, what was booked, and what happens next
- payment-required copy was functional but too terse, and the fake/local payment affordance still read closer to a debug control than an honest test-only action
- notification summary surfaced raw status counts without enough framing that this is policy-only and no real provider is connected
- provider bookings were technically readable, but the table rows flattened confirmed, cancelled, payment, and notification status into roughly equal visual weight
- lifecycle/audit was available, but it landed visually close to primary actions and could overwhelm a normal user
- fixture and live screens had slightly different clarity levels around payment, notifications, and next-step messaging

## Confirmation/status design approach

Target shape used in M27D:

- status hero/card
- booking details card
- next steps card
- actions card
- payment/notification status summaries
- lifecycle/audit secondary

Implementation choices:

- customer-facing confirmation now starts with a clear status hero and secondary chips for payment/notification state
- booking details now foreground provider/resource, service, date/time, timezone, duration, location, and reference id
- "What happens next" now uses short honest guidance instead of assuming real providers exist
- payment wording now consistently says local/test or fake/local rather than implying real checkout
- notification wording now explicitly says policy-only and no real email/SMS provider connected
- provider bookings now render as card-like status records with clearer primary actions and disabled confirmed-only affordances
- lifecycle and audit remain available, but as a secondary detail panel

## ShadCN components used

- `Alert`
- `Badge`
- `Button`
- `Calendar`
- `Card`
- `Input`
- `Label`
- `Separator`
- `Textarea`

## Machina regions added/changed

Added confirmation/status-specific regions:

- `booking-status-root`
- `booking-status-hero`
- `booking-status-details`
- `booking-status-next-steps`
- `booking-status-actions`
- `booking-status-lifecycle`

Added provider-bookings-specific regions:

- `provider-bookings-root`
- `provider-bookings-list`
- `provider-booking-detail`

Existing public-booking horizontal/vertical regions from M27B/M27C were preserved.

## Fixture/live behavior notes

- fixture confirmation now shows a clearer trust-moment hierarchy instead of a plain detail list
- fixture payment-required now uses honest local/test wording
- fixture payment-satisfied status now reads as `Payment satisfied (local test)`
- fixture notification summaries now explicitly frame notification state as policy-only
- fixture lifecycle summaries now include created/confirmed/cancelled timestamps where the data shape supports it
- live confirmation now matches the clearer card hierarchy and keeps the provider bookings handoff action
- live provider bookings now keep the real-smoke selectors while presenting clearer status/action hierarchy

## Screen catalog and screenshot coverage

Updated coverage:

- `booking-confirmation` now captures desktop, tablet, and phone
- `payment-required` desktop retained with updated honest wording
- `notification-summary` desktop retained
- `cancelled-rescheduled` desktop retained
- real smoke still captures:
  - `real-confirmed-booking`
  - `real-booking-cancelled`

Artifact base names stayed stable for existing screens.

## Tests run

Frontend:

- `cd src/Leviathan.Web`
- `npm install`
- `npx playwright install chromium`
- `npm run build`
- `npm test -- --run`
- `npm run test:e2e`
- `npm run test:e2e:real`

Observed final results:

- build: passed
- vitest/frontend tests: passed
- Playwright fixture/snapshot suite: passed
- Playwright real-backend smoke: passed

Backend:

- not run
- no backend files were changed

## Screenshot artifacts inspected

Inspected:

- `src/Leviathan.Web/test-results/ui-snapshots/booking-confirmation-desktop/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots/booking-confirmation-phone/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots/payment-required-desktop/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots/notification-summary-desktop/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots/cancelled-rescheduled-desktop/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots-real/real-confirmed-booking/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots-real/real-booking-cancelled/screenshot.png`

Confirmed from inspection:

- the confirmation surface now makes "booking worked" obvious
- date/time/location/reference are visible without reading debug copy
- payment wording no longer implies a real checkout integration exists
- notification wording no longer implies a real send provider exists
- phone confirmation remains readable as a stacked scroll surface
- live cancelled state is visibly distinct from confirmed state

## Human-user UX notes

Can a customer tell the booking is confirmed?

- Yes. The confirmation hero now answers that immediately.

Can they tell when and where it happens?

- Yes. Date/time, timezone, duration, and Google Meet location are now promoted into a dedicated details card.

Can they tell what payment/notification status means?

- Yes, more clearly than before. Payment is framed as local/test, and notifications are framed as policy-only.

Can a provider find and cancel a booking?

- Yes. The provider bookings cards keep inspect/cancel actions obvious, and the real smoke still walks that path.

Is lifecycle/audit visible but not overwhelming?

- Mostly yes. It is still present, but it is now secondary to status/details/actions.

What remains awkward?

- the desktop bookings fixture screenshot still only captures the top portion of the stacked list, so a single artifact cannot show every mixed state at once
- confirmation phone capture is readable, but the narrow-stack route still prioritizes top-of-flow visibility over a full end-to-end mobile screenshot in one frame
- live provider detail still uses one secondary panel rather than a true collapsible/timeline component set

## Known limitations

- no real payment provider exists; all payment wording remains local/test only
- no real notification provider exists; notification summary remains policy-oriented
- cancellation from the confirmation surface is still routed through provider bookings instead of adding a brand-new public cancellation flow
- lifecycle/audit remains a simple secondary panel, not a full timeline component system

## Recommended M27E

- provider setup UX pass
- mobile public booking polish after the shadcn calendar baseline
- reschedule browser coverage
- reusable Scheduling component extraction
- targeted shadcn cleanup if the new confirmation/provider card patterns keep repeating

## M27F follow-up note

M27F follows this pass by tightening the provider-side setup and landing/admin flow so a provider can create a bookable Scheduling surface, understand the resource-first model, and find the generated public booking link without reading Leviathan-internal docs.

See:

- `docs/m27f-provider-setup-ux-pass.md`

## M27E follow-up note

M27E follows M27D by adding a browser-visible reschedule affordance and replacement-flow coverage on top of the existing backend-safe reschedule semantics, while preserving the rule that reschedule is not cancel-then-book.

See:

- `docs/m27e-reschedule-browser-coverage-ux.md`
