# Leviathan M27B: Public Booking Responsive Rearchitecture

## Purpose

M27B rearchitects Leviathan Scheduling's public booking page so horizontal and vertical viewports are separate explicit Machina layouts instead of one adaptive geometry tree.

This milestone is layout architecture only.

Kept unchanged:

- backend behavior
- product features
- MachinaLayout as the page-level layout authority
- debug snapshot bridge
- fixture and live booking flows
- handoff bundle contract and artifact names

## Problem observed in M27A

M27A proved the concept well on desktop, but the phone layout was still the desktop composition squeezed into a narrow viewport.

Observed from the current artifacts before the M27B changes:

- `src/Leviathan.Web/test-results/ui-snapshots/public-booking-desktop/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots/public-booking-tablet/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots/public-booking-phone/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots-real/real-public-booking-slots/screenshot.png`

Conclusions:

- desktop was acceptable and aligned with the M27A concept art
- phone was cramped because it still used desktop composition logic
- the footer, calendar, slots, and intake competed for height inside one compressed panel
- phone should scroll through a vertical sequence instead of trying to fit the whole booking surface into one squeezed card

## Rationale for two explicit layouts

M27B stops trying to make one contorted layout serve both desktop and phone.

Instead, public booking now chooses one of two explicit Machina layout builders:

- `buildPublicBookingHorizontalLayout(...)`
- `buildPublicBookingVerticalLayout(...)`

These layouts share booking state and React render pieces, but they do not share one geometry tree.

## Viewport selection rule

Public booking now uses a single explicit breakpoint rule:

- width `< 768px` => vertical layout
- width `>= 768px` => horizontal layout

This keeps the selection rule simple and product-oriented.

## Horizontal layout structure

Horizontal layout is for desktop and tablet-like widths and stays close to M27A:

- `booking-header`
- `booking-root-horizontal`
- `booking-summary-panel`
- `booking-main-panel`
- `booking-main-header`
- `booking-calendar-region`
- `booking-slots-region`
- `booking-footer-summary`

Intent:

- calm summary panel on the left
- booking card on the right
- calendar beside slots/intake
- footer summary stays part of the main card

## Vertical layout structure

Vertical layout is phone-first and scrollable:

- `booking-header-mobile`
- `booking-root-vertical`
- `booking-mobile-summary-card`
- `booking-mobile-step-status`
- `booking-mobile-calendar-card`
- `booking-mobile-slots-card`
- `booking-mobile-intake-card`
- `booking-mobile-confirm-footer`

Vertical order:

1. compact header
2. compact provider/service summary
3. current step/status
4. calendar and duration controls
5. available times for the selected date
6. intake and confirmation actions
7. compact summary / hold state / cancel selection

The phone layout now scrolls naturally through this order instead of squeezing the desktop two-column composition.

## Shared components and state strategy

Business logic was not forked.

Both layouts still use the same booking page state and actions:

- service selection
- date selection
- slot selection
- hold creation
- intake submission
- fake/local payment satisfy
- confirmation
- cancellation path through the existing live smoke

Shared render pieces were kept intentionally small:

- header content
- provider identity
- service summary
- meta rows
- step list
- duration picker
- calendar panel
- slot button list
- intake form
- footer summary card

React components remain mostly dumb renderers inside Machina slots.

## Machina debug and handoff impact

The handoff and DOM-summary output now makes the selected layout obvious.

Added or changed debug-visible roots:

- `Public booking horizontal root`
- `Public booking vertical root`
- `Public booking mobile summary`
- `Public booking mobile calendar`
- `Public booking mobile slots`
- `Public booking mobile intake`

Artifact file names remain stable.

## Files changed

- `docs/m27a-scheduling-public-booking-ux-pass.md`
- `docs/m27b-public-booking-responsive-rearchitecture.md`
- `src/Leviathan.Web/src/apps/scheduling/layouts.ts`
- `src/Leviathan.Web/src/apps/scheduling/layouts.test.ts`
- `src/Leviathan.Web/src/apps/scheduling/views.tsx`
- `src/Leviathan.Web/src/machina/screenCatalog.ts`
- `src/Leviathan.Web/src/machina/screenCatalog.test.ts`
- `src/Leviathan.Web/src/machina/views.tsx`
- `src/Leviathan.Web/src/styles.css`
- `src/Leviathan.Web/tests/support/uiSnapshotMatrix.ts`
- `src/Leviathan.Web/tests/ui-snapshot.spec.ts`

## Tests run

Run locally in `src/Leviathan.Web`:

- `npm run build`
- `npm test -- --run`
- `npm run test:e2e`
- `npm run test:e2e:real`

Observed results:

- build: passed
- unit/frontend tests: passed
- Playwright snapshot suite: passed
- real backend smoke: passed

## Screenshot artifacts inspected

After the M27B changes:

- `src/Leviathan.Web/test-results/ui-snapshots/public-booking-desktop/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots/public-booking-tablet/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots/public-booking-phone/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots-real/real-public-booking-slots/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots-real/real-confirmed-booking/screenshot.png`

## Before/after phone UX notes

Before:

- phone inherited the desktop summary + main panel composition
- calendar, slots, intake, and footer were compressed into fixed slices
- the information order felt accidental rather than intentional

After:

- phone uses a distinct vertical booking composition
- summary, date selection, times, intake, and summary footer now appear in a clearer order
- scrolling is expected and acceptable
- the Machina snapshot clearly shows a mobile-specific structure

## Known limitations

- tablet at `768px` now stays on the horizontal layout, which is structurally correct but still tighter than desktop
- the phone screenshot artifact captures the top of the scrollable flow rather than the entire mobile journey in one image
- month paging remains intentionally conservative because live month navigation was not part of this milestone

## Recommended M27C

Recommended next options:

- booking confirmation/status UX pass
- mobile public booking polish pass
- provider setup UX pass
- reschedule browser coverage
