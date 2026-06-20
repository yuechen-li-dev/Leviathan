# Leviathan M27F: Provider Setup UX Pass

## Purpose

M27F polishes the Scheduling provider setup and admin path so a provider can create a bookable surface without understanding Leviathan internals.

This milestone remains a frontend UX pass only.

Kept unchanged:

- backend domain behavior
- auth/login
- real payment integrations
- real email/SMS/calendar provider integrations
- database/query work
- MachinaLayout as page-level layout authority
- handoff compatibility fields

## Current awkwardness inventory

Observed before the M27F edits from the setup route, live smoke path, and existing screenshots:

- the setup surface read like `stable defaults + setup actions + created entities` instead of a guided product setup flow
- the next required action was weak because provider, ownership, defaults, sequence, and demo-sidebar concepts all appeared with similar visual weight
- resource-first modeling was technically present, but the UI did not explain why a resource exists before a service
- the unsafe local/dev admin warning was honest, but it competed with the rest of the page instead of framing the setup flow
- the generated public booking link existed, but it was not presented as the main outcome of completing setup
- success state was weak: created ids appeared, but the UI did not strongly say “your public booking page is ready”
- the landing/admin route still acted more like a fixture directory than a natural entry point into provider setup
- real smoke selectors were relying on broad text that could match preview copy rather than true created-entity state
- fixture and live setup surfaces had drifted in tone and grouping even though they walked the same conceptual sequence

## Provider setup design approach

Target shape used in M27F:

- setup hero
- honest local/dev admin warning
- ownership context in plain language
- five-step setup checklist
- grouped form cards for provider, resource, service, and availability
- preview/result rail focused on the public booking link and current setup summary

Implementation choices:

- fixture and live setup now share one guided setup surface instead of separate “informational” and “button list” presentations
- the setup hero now answers the product task plainly: set up bookable availability
- the checklist keeps the sequence explicit: provider -> resource -> service -> availability -> public booking link
- resource helper copy now explains the resource-first model in product language
- service copy stays honest about local/test payment policy and policy-only notifications
- availability only exposes the simple weekly rule the backend already supports
- the preview/result rail makes the public booking link and booking-page outcome visible throughout the setup flow
- live setup summary now exposes explicit created-entity test ids so the real smoke waits for real progress rather than incidental text

## ShadCN components used

- `Alert`
- `Badge`
- `Button`
- `Card`
- `Input`
- `Label`
- `Textarea`

Existing Scheduling surfaces continue using the previously adopted shadcn baseline and calendar components from M27C/M27D.

## Machina regions added/changed

Added provider-setup-specific regions:

- `provider-setup-root`
- `provider-setup-hero`
- `provider-setup-warning`
- `provider-setup-steps`
- `provider-setup-form`
- `provider-setup-preview`
- `provider-setup-result`

Screen catalog coverage now includes:

- `provider-setup-desktop`
- `provider-setup-phone`

Existing landing, public booking, confirmation, bookings, and handoff artifact names remained stable.

## Fixture/live behavior notes

- fixture setup now renders a guided ready-state summary with provider/resource/service/availability already present and the public link visible
- live setup now keeps editable defaults until each step is created, then locks completed sections so the next action stays obvious
- fixture and live both use the same product wording for provider, resource, service, availability, and public booking link outcome
- the live setup keeps the unsafe local/dev admin warning honest and visible
- payment wording remains local/test only and does not imply Stripe, PayPal, or any real checkout
- notification wording remains policy-only and does not imply a real send provider

## Screen catalog and screenshot coverage

Updated coverage:

- `scheduling-landing` retained desktop/tablet/phone coverage
- `provider-setup` now covers desktop and phone
- real smoke retained:
  - `real-provider-setup-created`
  - `real-public-booking-slots`
  - `real-confirmed-booking`
  - `real-booking-cancelled`

## Tests run

Frontend in `src/Leviathan.Web`:

- `npm install`
- `npx playwright install chromium`
- `npm run build`
- `npm test -- --run`
- `npm run test:e2e`
- `npm run test:e2e:real`

Observed final results:

- `npm install`: passed (`up to date`)
- `npx playwright install chromium`: passed
- `npm run build`: passed
- `npm test -- --run`: passed
- `npm run test:e2e`: passed
- `npm run test:e2e:real`: passed

Backend:

- not run
- no backend files were changed

## Screenshot artifacts inspected

Inspected:

- `src/Leviathan.Web/test-results/ui-snapshots/scheduling-landing-desktop/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots/provider-setup-desktop/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots/provider-setup-phone/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots/public-booking-desktop/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots-real/real-provider-setup-created/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots-real/real-public-booking-slots/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots-real/real-confirmed-booking/screenshot.png`
- `src/Leviathan.Web/test-results/ui-snapshots-real/real-booking-cancelled/screenshot.png`

Confirmed from inspection:

- the landing route now points more naturally into provider setup
- the setup route now makes the public booking page the outcome, not just one field among many
- the resource-first model is more understandable because the resource card explains what a resource means
- the live setup path still reaches the same public booking, confirmation, bookings, and cancellation flow
- the public booking link is much easier to find and open once setup is complete

## Human-user UX notes

Can a provider tell what to do first?

- Yes. The checklist and the first provider card both point to the same next action.

Can they understand resource vs service?

- More than before. The resource helper copy explains the model in plain language, and the service card frames the customer-facing part separately.

Can they create availability without reading docs?

- Mostly yes. The UI now exposes only the simple weekly rule the backend already supports.

Can they find and open the public booking link?

- Yes. The preview/result rail keeps it visible and pairs it with “Open booking page” and “Preview booking flow” CTAs.

Does local/dev unsafe admin mode remain honest?

- Yes. The warning remains prominent and unchanged in substance.

What still feels awkward?

- the phone provider-setup snapshot with the overlay enabled still captures only the top portion of the guided scroll, so the artifact is structurally correct but not a complete one-frame story
- the desktop provider-setup capture still trades some lower-form visibility for keeping the shell hero and sidebar in-frame

## Known limitations

- no real payment provider exists; service/payment language remains local/test only
- no real notification provider exists; notification language remains policy-only
- the provider setup phone artifact is still a top-of-scroll capture rather than a full mobile journey in one frame
- the guided setup form is clearer, but the live route still creates one resource, one service, and one simple weekly availability rule at a time

## Recommended next milestone

- reschedule browser coverage and UX
- mobile public booking polish
- reusable Scheduling component extraction
- provider bookings/detail polish
- component cleanup if ShadCN patterns repeat
