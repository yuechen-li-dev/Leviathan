# Leviathan M24: Scheduling Real Backend Smoke

## Purpose

M24 proves the Scheduling UI can walk a real backend path instead of only fixture-backed M23 surfaces.

This milestone is a dev/test tooling and parity milestone:

- keep the M22/M23 fixture smoke workflow intact;
- add a separate real-backend smoke workflow;
- exercise existing Scheduling backend behavior through the browser UI where practical;
- capture screenshots, DOM summaries, Machina snapshots, and handoff bundles from the live path;
- document where fixture assumptions match or drift from real backend DTOs.

No vendor files were modified. No database, real auth, real payments, provider integrations, or new backend domain behavior were added.

## Real-backend smoke vs fixture smoke

Fixture smoke:

- uses Playwright route mocks;
- runs against built frontend assets only;
- is ideal for UI polish, layout, and multi-viewport screenshots;
- does not prove DTO/runtime parity by itself.

Real-backend smoke:

- starts the ASP.NET backend locally with unsafe local-dev admin enabled;
- uses a clean `LEVIATHAN_DATA_DIR`;
- points the browser UI at the real backend with `apiBaseUrl=...`;
- verifies the existing Scheduling hold/intake/payment-required/confirm/cancel lifecycle against live backend state.

## Real-backend setup

Frontend root: `src/Leviathan.Web`

New script:

```bash
npm run test:e2e:real
```

What it does:

- starts `vite preview` through the existing Playwright `webServer`;
- starts the backend from `tests/support/realBackend.ts` with:
  - `LEVIATHAN_ALLOW_UNSAFE_ADMIN=true`
  - clean `src/Leviathan.Web/test-results/real-backend-data`
  - `--urls http://127.0.0.1:5187`
- opens Scheduling routes with:
  - `?debug=1`
  - `&apiBaseUrl=http://127.0.0.1:5187/api`

The real smoke is gated out of the normal fixture suite and only runs when `npm run test:e2e:real` sets `LEVIATHAN_REAL_SMOKE=1`.

## Journey steps

Route start:

- `/apps/scheduling/setup?debug=1&apiBaseUrl=...`

Covered path:

1. Create provider.
2. Create resource.
3. Create service.
4. Create availability rule.
5. Open generated public booking link.
6. Select slot and create hold.
7. Submit intake.
8. Confirm once and verify controlled `payment_required`.
9. Fake-satisfy payment through the existing backend fake/local path from the browser UI.
10. Confirm booking.
11. View booking confirmation.
12. Open provider bookings.
13. Inspect audit/lifecycle and notification summary.
14. Cancel booking.
15. Verify cancelled state and cancellation audit.

## UI-driven vs API-assisted

UI-driven:

- provider/resource/service/availability creation;
- public booking route;
- hold creation;
- intake submission;
- payment-required visibility;
- fake/local payment satisfy;
- booking confirmation;
- provider bookings view;
- audit/lifecycle visibility;
- booking cancellation.

API-assisted:

- backend process startup/teardown only.

No Scheduling domain setup steps were faked with Playwright request APIs in the final smoke path.

## Artifact paths

Fixture bundles remain under:

- `src/Leviathan.Web/test-results/ui-snapshots/`

Real-backend bundles now write under:

- `src/Leviathan.Web/test-results/ui-snapshots-real/`

Current checkpoints:

- `real-provider-setup-created`
- `real-public-booking-slots`
- `real-hold-intake`
- `real-payment-required`
- `real-confirmed-booking`
- `real-audit-lifecycle`
- `real-booking-cancelled`

Each bundle contains:

- `screenshot.png`
- `dom-summary.json`
- `machina-snapshot.json`
- `handoff.json`

## Fixture parity findings

### Matched real backend shape

- provider slug/display name/timezone flow;
- public service and slot shape used by the booking page;
- booking status/customer/range rendering;
- notification summary counts on bookings;
- audit event list and lifecycle summary route usage;
- controlled `payment_required` confirmation behavior.

### Fixture fields missing real backend detail

- hold `paymentRequirementStatus`;
- hold `paymentPolicySnapshot`;
- hold `paymentRequiredAt` / `paymentSatisfiedAt`;
- booking `paymentRequirementStatus`;
- booking `paymentPolicySnapshot`;
- booking `notificationPolicySnapshot`;
- booking `paymentRequiredAt` / `paymentSatisfiedAt`;
- lifecycle `paymentRequirementStatus` and `paymentReference`;
- concrete notification record shape from `/bookings/{bookingId}/notifications`.

### Real backend fields not represented in fixture data

- provider `createdAt` / `updatedAt`;
- resource `capacityMode`, `isActive`, `createdAt`;
- availability rule `effectiveFrom`, `effectiveUntil`, `isActive`, `createdAt`;
- service payment/notification policy payloads;
- booking `policySnapshot`, `createdAt`, `updatedAt`, `confirmedAt`, `cancelledAt`;
- scheduled notification ids, channels, triggers, and schedule timestamps.

### UI paths still fixture-only or API-only

- reschedule journey remains API-only; no real browser reschedule surface was added in M24;
- notification fake-send is still API-only;
- fixture viewport matrix remains broader than live-smoke coverage;
- fixture scenarios still carry more curated copy than some live backend screens.

### UI paths verified against the real backend

- setup;
- public booking;
- hold;
- intake;
- payment gate;
- fake/local payment satisfy;
- confirmation;
- provider bookings;
- audit/lifecycle summary;
- cancellation.

## Scheduling UI changes in M24

Small allowed fixes added:

- real/live Scheduling mode when `fixture=` is absent;
- setup buttons for provider/resource/service/availability creation with stable defaults;
- clearer generated public booking link for the live path;
- live public booking intake/payment/confirm controls;
- provider bookings inspection/cancel affordances;
- data-testid hooks for the new smoke path;
- separate real-backend artifact root.

No backend domain behavior changed.

## MachinaLayout frictions and suggestions

M24 kept the M23 frictions and surfaced a few real-backend-specific ones:

- actionable controls can land below the fold inside the current wide split, which made browser automation rely on explicit DOM clicks for some live actions;
- the debug inspector can intercept pointer events unless it is collapsed before the live journey;
- the shell route model still does not naturally carry Scheduling entity identity, so the live smoke uses query preservation plus small local context storage to bridge setup, booking, confirmation, and bookings screens.

Useful upstream suggestions:

- helper for “remaining interactive rect” after fixed shell regions and debug panes are present;
- standard inspection-mode behavior that collapses or non-intercepts debug panels during automated interaction;
- canonical route/query preservation helper for multi-screen flows sharing one shell route;
- standardized handoff-bundle schema remains a strong fit.

## Limitations

- mobile/tablet real-backend smoke was not added yet; M24 live smoke runs the minimal desktop path;
- reschedule remains unverified in browser UI;
- fixture copy still exceeds live-path polish in some places;
- `dotnet restore` and `dotnet test` from repo root currently fail against `Leviathan.slnx` in this environment with `Cannot create a file when that file already exists`;
- targeted backend tests on `tests/Leviathan.Server.Tests/Leviathan.Server.Tests.csproj` still show pre-existing file-lock failures in three `SchedulingM8Tests` hold-expiry tests.

## Verification

Frontend:

```bash
cd src/Leviathan.Web
npm run build
npm test -- --run
npm run test:e2e
npm run test:e2e:real
```

Backend:

```bash
dotnet build Leviathan.slnx
dotnet test tests/Leviathan.Server.Tests/Leviathan.Server.Tests.csproj
```

Observed in this environment:

- `npm run build`: passed
- `npm test -- --run`: passed
- `npm run test:e2e`: passed with the real smoke correctly skipped
- `npm run test:e2e:real`: passed
- `dotnet build Leviathan.slnx`: passed
- `dotnet restore`: failed at repo root due `.slnx` file-creation error
- `dotnet test`: failed at repo root due the same `.slnx` issue
- targeted `dotnet test tests/Leviathan.Server.Tests/Leviathan.Server.Tests.csproj`: failed in three pre-existing file-lock expiry tests

## Recommended M25

- provider UX polish using the new real-backend artifacts;
- add mobile real-backend smoke coverage;
- add reschedule browser coverage for the existing backend flow;
- tighten fixture DTO parity against the real backend shapes used in M24;
- product metadata/query-plane preflight or notification actuator skeleton work once the live smoke baseline is stable.
