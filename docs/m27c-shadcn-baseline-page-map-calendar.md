# Leviathan M27C: ShadCN Baseline, Scheduling Page Map, and Calendar Replacement

## Purpose

M27C standardizes Leviathan Web's UI baseline for Scheduling without changing Scheduling backend behavior.

This milestone:

- installs Tailwind + shadcn/ui properly for the existing Vite/React app
- switches the app font baseline to Inter
- adopts default shadcn light/dark CSS-variable theming
- replaces the hand-rolled public-booking calendar with the shadcn `Calendar`
- verifies that the Scheduling surfaces expected at this stage exist and are reachable
- preserves Machina layout ownership, screen artifacts, and real-backend smoke behavior

Out of scope remained:

- backend domain changes
- auth
- real payment provider work
- notification provider integrations
- external calendar sync
- database/query work
- whole-platform redesign

## Pre-M27C Frontend Audit

Observed before code changes:

- Tailwind: not installed
- shadcn/ui: not initialized
- `components.json`: absent
- CSS variables for shadcn theme tokens: absent
- App font: `"Segoe UI", ui-sans-serif, system-ui, sans-serif`
- Arial fallback pressure: present through the old generic sans stack
- Theme behavior: hard-coded dark-first root via `:root { color-scheme: dark; }`
- Theme toggle: only a disabled placeholder in the public-booking header
- Styling pattern: large hand-authored global CSS with local `panel`, `card`, booking, and status classes
- Public booking calendar: custom `buildCalendarWeeks(...)` data + manual weekday/header/day grid in `src/Leviathan.Web/src/apps/scheduling/views.tsx`
- Machina status: already correct as page geometry authority for Scheduling, including horizontal vs vertical public-booking screen selection from M27B

Conclusion:

- the repo had no real shadcn baseline yet
- the public-booking calendar was still bespoke and expensive to maintain
- the font/theme baseline still read as pre-shadcn custom styling rather than a boring-good default

## ShadCN Setup Summary

M27C added the standard shadcn prerequisites for this Vite app:

- Tailwind via `@tailwindcss/vite`
- Vite `@` alias to `src`
- TypeScript path alias for `@/*`
- `components.json`
- shared `cn(...)` helper in `src/Leviathan.Web/src/lib/utils.ts`
- shadcn CSS-variable theme tokens in `src/Leviathan.Web/src/styles.css`

Added shadcn components:

- `button`
- `card`
- `input`
- `label`
- `textarea`
- `badge`
- `alert`
- `separator`
- `select`
- `calendar`

Supporting packages added:

- `tailwindcss`
- `@tailwindcss/vite`
- `@fontsource/inter`
- `class-variance-authority`
- `clsx`
- `tailwind-merge`
- `lucide-react`
- `react-day-picker`
- `tw-animate-css`
- transitive shadcn-generated dependencies including `date-fns` and `radix-ui`

## Inter Font Setup

Inter is now the app default font.

Implementation:

- `@import "@fontsource/inter";` in `src/Leviathan.Web/src/styles.css`
- app-wide body/font baseline set to:

```css
font-family: Inter, ui-sans-serif, system-ui, sans-serif;
```

- HTML shell title/favicon now exist in `src/Leviathan.Web/index.html`

Result:

- the app no longer falls back to the older Segoe/Arial-like look
- screenshot artifacts now read as Inter-based shadcn default UI rather than the older browser-default feel

## Theme Strategy

M27C intentionally avoided bespoke branding work.

Adopted baseline:

- default shadcn light/dark token approach with CSS variables
- light mode as the stable default
- a simple runtime theme provider + toggle for light/dark switching
- existing Scheduling accent language kept only where it did not fight the shadcn neutral baseline

Files involved:

- `src/Leviathan.Web/src/styles.css`
- `src/Leviathan.Web/src/components/theme-provider.tsx`
- `src/Leviathan.Web/src/components/mode-toggle.tsx`
- `src/Leviathan.Web/src/main.tsx`

## Calendar Replacement Notes

The public-booking calendar is now the shadcn `Calendar` backed by `react-day-picker`.

What changed:

- removed the hand-built month header, weekday row, and day-grid button rendering from `views.tsx`
- removed reliance on `buildCalendarWeeks(...)`
- date availability is now expressed through shadcn/day-picker props and modifier hooks
- selected dates still drive the existing slot list and intake flow
- disabled/unavailable dates are non-interactive
- fixture mode still defaults to Emma Brown / May 2025 demo data
- live mode still derives available dates from real slots returned by the backend

What stayed unchanged:

- Machina still decides horizontal vs vertical public-booking layout
- Machina still owns the page regions
- booking state/dispatch/backend behavior stayed intact
- real smoke selectors and handoff bundle compatibility were preserved

## Scheduling Page Map Inventory

| Screen / state | Route / entry | Fixture | Live backend | Screen catalog metadata | Screenshot coverage | Mobile coverage |
|---|---|---:|---:|---:|---:|---:|
| Scheduling landing / admin overview | `/apps/scheduling?fixture=landing` | Yes | No | Yes | Yes | Yes |
| Provider setup | `/apps/scheduling/setup?fixture=provider-setup` | Yes | Yes | Yes | Yes | No |
| Public booking | `/book/:providerSlug?fixture=public-booking` | Yes | Yes | Yes | Yes | Yes |
| Booking confirmation / status | `/book/:providerSlug/confirmed/:bookingId?fixture=booking-confirmation` | Yes | Yes | Yes | Yes | No |
| Provider bookings list | `/apps/scheduling/bookings?fixture=cancelled-rescheduled` | Yes | Yes | Yes | Yes | No |
| Booking detail / audit / lifecycle | `/apps/scheduling/bookings?fixture=notification-summary` and live `bookingId` query path | Yes | Yes | Yes | Yes | No |
| Payment-required state | `/book/:providerSlug?fixture=payment-required` | Yes | Yes | Yes | Yes | No |
| Notification-summary state | `/apps/scheduling/bookings?fixture=notification-summary` | Yes | Yes | Yes | Yes | No |
| Cancelled / rescheduled state | `/apps/scheduling/bookings?fixture=cancelled-rescheduled` | Yes | Yes | Yes | Yes | No |
| Real backend booking/cancel confirmation path | live provider setup -> live public booking -> live confirmation -> live bookings cancel path | No | Yes | Covered by route family + handoff artifacts | Yes | No |

Page-map completeness notes:

- no new backend states were invented
- landing/demo actions now include direct entry points for booking confirmation and payment-required surfaces
- the existing bookings route continues to host both list-oriented and audit/lifecycle-oriented states honestly

## Screen Catalog Status

No screen-catalog schema rewrite was needed in M27C.

The current catalog in `src/Leviathan.Web/src/machina/screenCatalog.ts` already carried:

- `screenKey`
- `route`
- `fixture`
- `tags`
- `artifactBaseName`
- viewport coverage
- `productArea`
- `captureSource`
- live-route support notes

M27C kept artifact names stable and validated the catalog against the updated Scheduling surfaces with existing and expanded tests.

## Tests Run

Run locally in `src/Leviathan.Web`:

- `npm run build`
- `npm test -- --run`
- `npm run test:e2e`
- `npm run test:e2e:real`

Observed results after the final verified run:

- build: passed
- unit/frontend tests: passed
- Playwright snapshot + fixture browser suite: passed
- real backend smoke: passed

Added or updated coverage:

- shadcn calendar selected/available/disabled fixture states
- fixture public-booking date + slot selection after calendar replacement
- compact horizontal-booking layout regression cases with docked inspector open
- Inter/theme-baseline presence checks

## Screenshot Artifacts Inspected

Inspected:

- `src/Leviathan.Web/test-results/ui-snapshots/public-booking-desktop/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots/public-booking-tablet/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots/public-booking-phone/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots/scheduling-landing-desktop/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots/provider-setup-desktop/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots/booking-confirmation-desktop/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots-real/real-public-booking-slots/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots-real/real-confirmed-booking/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots-real/real-booking-cancelled/screenshot.png`

Confirmed:

- shadcn calendar replaced the old custom grid
- mobile calendar is materially more usable than the hand-built version
- Inter is present in the rendered UI
- light theme reads as shadcn-default neutral UI
- dark mode toggle is functional and no browser-layout errors remained in manual browser verification
- handoff bundles still preserve screenshot / DOM summary / Machina snapshot / handoff JSON outputs

## Known Limitations

- the tablet horizontal layout is improved and stable, but still tighter than desktop and remains a candidate for a dedicated polish pass
- non-booking Scheduling screens still use a mix of older Leviathan structural classes and new shadcn primitives rather than a full primitive-by-primitive conversion
- the screen catalog still represents provider-bookings list and audit/lifecycle through the current existing fixture states rather than brand-new catalog keys

## Recommended M27D

Recommended next options:

- booking confirmation/status UX pass
- provider setup UX pass
- mobile public booking polish after shadcn calendar
- reschedule browser coverage
- reusable Scheduling component extraction where shadcn usage patterns now repeat
