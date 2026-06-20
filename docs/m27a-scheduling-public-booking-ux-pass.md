# Leviathan M27A: Scheduling Public Booking UX Pass 1

## Purpose

M27A improves Leviathan Scheduling's public booking experience without changing backend product behavior or breaking the Machina-centered frontend architecture adopted in M22 through M26C.

Scope stayed intentionally narrow:

- public booking page only
- service and duration selection
- date and time selection
- intake details
- confirmation affordance

Out of scope:

- auth
- real payments
- SMS or email delivery
- calendar provider integrations
- provider admin redesign
- whole-app visual redesign

## Concept art interpretation

The concept art set a clear structural target rather than a pixel-perfect one:

- a light-theme booking page
- a calm left summary panel
- a right-hand actionable booking card
- a calendar-first date selection surface
- a visible slot list and intake form
- a compact pending booking summary footer

Leviathan's implementation keeps those UX priorities while adapting them to the existing Scheduling DTOs, route model, hold flow, payment-required branch, and confirmation route.

## Current awkwardness before the pass

Before M27A, the public booking page worked but felt operational rather than welcoming:

- the page hierarchy made it harder to tell what the next action was
- provider, service, timezone, and expectations were visually secondary
- slot selection and intake details felt detached from the date-selection surface
- the dark utilitarian presentation made the public flow feel less Cal.com-like and less trustworthy for a first-time user
- Machina handoff bundles were still technically correct, but the public booking page did not expose as much meaningful sub-structure as it could

## What the concept art improves

The concept art improves three things that were worth carrying into Leviathan:

- stronger information hierarchy, with provider and service context visible before action
- clearer next-step guidance, with the booking interaction concentrated in one main card
- a calmer public-facing tone, with light cards, familiar controls, and reduced visual noise

## What remained unchanged

M27A intentionally kept these foundations intact:

- MachinaLayout still owns page-level geometry
- React components still render inside Machina slots instead of becoming layout authorities
- Scheduling workflow authority still lives in existing route and API state helpers
- live backend hold, payment-required, fake satisfy, confirmation, bookings, and cancellation behavior remains unchanged
- handoff bundle compatibility fields and snapshot artifact contracts remain intact
- fixture and live modes both still work

## Page structure implemented

The public booking page now renders as:

- top header with Leviathan Scheduling, Help, Back to apps, and theme-toggle placeholder styling
- left summary panel with provider identity, service details, metadata, progress, expectations, and trust notes
- right booking card with duration pills, calendar, slots, inline intake details, and summary footer

Desktop uses a two-column booking surface. Tablet and phone stack the summary above the booking controls while preserving the same region structure.

## Machina regions added or changed

M27A adds a booking-specific Machina layout path with stable region ids and clearer handoff nodes:

- `booking-header`
- `booking-root`
- `booking-summary-panel`
- `booking-main-panel`
- `booking-main-header`
- `booking-calendar-region`
- `booking-slots-region`
- `booking-footer-summary`

This keeps page geometry in MachinaLayout and makes DOM summaries and overlay inspection more readable than a single opaque booking surface.

## Fixture and live behavior notes

Fixture mode was refreshed to better match the concept art:

- provider: Emma Brown
- service focus: 30 min Intro Call
- location: Google Meet
- timezone: America/Los_Angeles
- May 2025 slot inventory and booking copy

Live mode continues to use the real Scheduling API flow. M27A fixed a regression risk by making the booking page initialize from live data instead of carrying fixture-only selected service ids into the live route.

## Component and styling approach

M27A did not install full shadcn/ui.

Instead, it uses local shadcn-like styling with low-risk primitives and CSS:

- rounded cards
- subtle borders
- neutral light surfaces
- segmented duration controls
- quiet badges, metadata rows, and alerts
- plain readable form fields and action buttons

This kept the pass localized and avoided design-system setup churn while moving the UX much closer to the desired visual language.

## Screenshots and handoff artifacts inspected

Manual inspection covered:

- `src/Leviathan.Web/test-results/ui-snapshots/public-booking-desktop/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots/public-booking-tablet/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots/public-booking-phone/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots-real/real-public-booking-slots/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots/public-booking-desktop/handoff.json`
- `src/Leviathan.Web/test-results/ui-snapshots/public-booking-desktop/dom-summary.json`
- `src/Leviathan.Web/test-results/ui-snapshots-real/real-public-booking-slots/handoff.json`

Confirmed:

- the page now resembles the concept art structurally
- booking remains usable in fixture and live paths
- non-interactive overlay does not intercept clicks
- artifact files still exist in the expected locations
- handoff compatibility fields remain present
- DOM summaries contain meaningful booking-region Machina nodes

## Human-user UX notes

Could I tell what to do next?

- Yes. The main action is now much clearer because date, slot, and intake live together in the right booking card.

Could I identify provider, service, duration, and timezone?

- Yes. The summary panel now makes those details obvious before the user commits to a slot.

Could I pick a slot?

- Yes. Slots read as direct actions now, and the selected state is much easier to scan.

Could I understand the intake and confirm step?

- Yes. Expanding the intake form under the selected slot creates a more natural continuation than the older detached flow.

What still feels awkward?

- tablet and phone are functional but still compressed under debug capture conditions
- month navigation is intentionally conservative because live paging is not implemented yet
- the fixture-selected date is not yet as tightly staged to the concept art as the rest of the surface

What should M27B improve?

- mobile and tablet booking polish
- tighter confirmation and status UX
- reschedule coverage and public-flow continuity
- extraction of reusable booking primitives if this visual language expands

## Tests run

Frontend verification run locally:

- `cd src/Leviathan.Web`
- `npm install`
- `npx playwright install chromium`
- `npm run build`
- `npm test -- --run`
- `npm run test:e2e`
- `npm run test:e2e:real`

Observed results:

- `npm install`: passed
- `npx playwright install chromium`: passed
- `npm run build`: passed
- `npm test -- --run`: passed
- `npm run test:e2e`: passed
- `npm run test:e2e:real`: passed

Backend verification:

- not run
- no backend files were changed

## Known limitations

- calendar month paging is still presentation-first and intentionally limited by current live data shape
- fixture screenshot staging is close to the concept art, but not every selected state is identical to the target composition
- phone and tablet capture layouts are improved but not yet polished as a dedicated mobile-first flow
- shadcn/ui was approximated locally rather than fully installed and extracted

## Recommended M27B

- provider setup UX pass
- booking confirmation and status UX pass
- mobile public booking polish
- reschedule browser coverage
- reusable shadcn-style component extraction if the local approximations keep spreading

## Follow-up note

M27A proved the desktop public-booking concept and kept the real backend path intact, but it still relied on one shared responsive composition for desktop, tablet, and phone.

M27B follows this pass by splitting the phone/vertical experience into its own explicit Machina layout while preserving the same booking state and backend behavior.

See:

- `docs/m27b-public-booking-responsive-rearchitecture.md`
