# Leviathan M23: Scheduling UI Polish Handoff

## Purpose

M23 uses the M22 headless inspection workbench to make Scheduling visibly more demo-ready without adding backend product features or replacing MachinaLayout/MachinaDispatch.

The milestone focuses on:

- clearer Scheduling landing/admin hierarchy;
- fixture-backed provider setup, public booking, confirmation, and booking-status surfaces;
- mobile/tablet/desktop handoff bundle coverage;
- stronger artifact generation for screenshots, DOM summaries, and Machina snapshots.

No vendor files were modified. No auth, real payments, SMS, email, calendar sync, or database work was added.

## Routes and screenshots covered

Artifacts are now generated for these routes/states:

- `/apps?debug=1`
- `/apps/scheduling?debug=1&fixture=landing`
- `/apps/scheduling/setup?debug=1&fixture=provider-setup`
- `/book/demo-provider?debug=1&fixture=public-booking`
- `/book/demo-provider/confirmed/book_demo_confirmed?debug=1&fixture=booking-confirmation`
- `/apps/scheduling/bookings?debug=1&fixture=cancelled-rescheduled`
- `/book/demo-provider?debug=1&fixture=payment-required`
- `/apps/scheduling/bookings?debug=1&fixture=notification-summary`

Viewport matrix currently captured:

- desktop `1440x1024`
- tablet `768x1024`
- phone `390x844`

Multi-viewport coverage currently includes:

- `/apps`
- Scheduling landing
- public booking

## Fixture states added

Scheduling fixture scenarios now resolve from route + `fixture` query when loaded in the browser shell:

- `landing`
- `provider-setup`
- `public-booking`
- `booking-confirmation`
- `cancelled-rescheduled`
- `payment-required`
- `notification-summary`

These are UI/demo fixtures only. They exist to drive inspection and screenshots without requiring a live backend flow.

## UI changes made

### Scheduling shell and layout

- Replaced the single full-screen Scheduling node with explicit Machina regions:
  - `scheduling-hero`
  - `scheduling-main`
  - `scheduling-sidebar`
  - `debug-inspector` when debug mode is open
- Added responsive wide/narrow Scheduling layout variants so snapshots show meaningful geometry instead of one opaque rectangle.
- Preserved Scheduling subpaths like `/apps/scheduling/setup` and `/book/demo-provider` during shell boot/history mirroring.

### Scheduling landing/admin page

- Added a stronger hero with route label and demo chips.
- Added distinct action cards for:
  - provider setup
  - public booking demo
  - provider bookings
  - audit/lifecycle inspection
- Added a more explicit local/dev admin warning panel.
- Added a proof-points section explaining current Scheduling scope.
- Reduced giant empty-space behavior by splitting content into main/sidebar panels.

### Provider setup

- Grouped setup into readable default/config and sequence cards.
- Kept unsafe local-dev ownership context explicit.
- Surfaced the generated public booking link more clearly.

### Public booking

- Added service cards, slot cards, timezone chips, and a clearer flow summary.
- Added controlled-state messaging for payment-required/demo policy states.

### Confirmation / bookings / audit

- Added status chips for:
  - `confirmed`
  - `cancelled`
  - `rescheduled`
  - `payment_required`
  - `payment_satisfied_fake`
  - notification summary labels
- Added readable payment and notification policy summary panels.
- Kept ICS links visible only for confirmed bookings.
- Rendered old rescheduled booking ICS behavior as an explicit controlled note instead of an implied broken link.
- Improved audit/lifecycle detail layout into readable cards and lists.

## Playwright workflow changes

Playwright handoff capture now:

- covers multiple Scheduling fixture states;
- covers desktop/tablet/phone viewports;
- asserts expected top-level text;
- asserts expected Machina node ids exist;
- asserts screenshot, DOM summary, Machina snapshot, and handoff JSON files were written;
- asserts no page errors or console errors were emitted.

## How to run handoff bundle generation

From `src/Leviathan.Web`:

```bash
npm run build
npm run test:e2e
```

For unit/frontend test coverage:

```bash
npm test -- --run
```

## Artifact paths

Generated handoff bundles live under:

`src/Leviathan.Web/test-results/ui-snapshots/`

Examples:

- `apps-route-desktop/`
- `apps-route-tablet/`
- `apps-route-phone/`
- `scheduling-landing-desktop/`
- `scheduling-landing-tablet/`
- `scheduling-landing-phone/`
- `provider-setup-desktop/`
- `public-booking-desktop/`
- `public-booking-tablet/`
- `public-booking-phone/`
- `booking-confirmation-desktop/`
- `cancelled-rescheduled-desktop/`
- `payment-required-desktop/`
- `notification-summary-desktop/`

Each bundle contains:

- `screenshot.png`
- `dom-summary.json`
- `machina-snapshot.json`
- `handoff.json`

## MachinaLayout changes, frictions, and suggestions

### Changes made in app code

- Added explicit Scheduling hero/main/sidebar layout rows with responsive variants.
- Added clearer debug labels on Scheduling layout nodes.
- Improved snapshot usefulness by exposing more than one Scheduling node.

### Frictions observed

- Fixed-size child frames inside padded/gapped parents are easy to overspecify when another shell region like the debug inspector also consumes space.
- MachinaLayout correctly throws overflow errors, but it is easy for app code to miscompute “remaining space” for nested fixed regions.

### Upstream suggestions for MachinaLayout.JS

- Add a helper for deriving the available child rect after ancestor fixed regions/padding/gaps, especially for responsive shell layouts.
- Add a canonical screen-catalog or fixture-screen helper for demo/story routes.
- Add a built-in viewport matrix helper for inspection workflows.
- Add a standardized handoff-bundle schema recommendation for screenshots + compact DOM + debug snapshot output.
- Add optional screenshot/debug overlay affordances for faster layout inspection.

## Limitations

- Scheduling fixtures are still UI fixtures, not live backend-driven journeys.
- The shell route model is still coarse: all Scheduling subpaths share one shell route and rely on frontend fixture resolution for demo-state rendering.
- No pixel-diff visual regression baselines exist yet.
- Manual browser verification was limited to a quick in-app browser spot check of the Scheduling landing route after the automated run.

## Recommended M24

- Add more Scheduling fixture states and additional mobile polish.
- Do a provider UX flow polish pass against a real backend smoke run.
- Add product metadata/query-plane preflight work.
- Add notification actuator command/event skeleton work.
- Only attempt real provider connector integration once authority and connectors are ready.
