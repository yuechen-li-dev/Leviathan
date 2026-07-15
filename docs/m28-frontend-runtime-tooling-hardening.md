# M28 frontend runtime and tooling hardening

## Purpose

M28 hardens the Scheduling frontend after its M0-M4 feature-directory and
MachinaLayout 0.6.0 migration. It makes no Scheduling product or UX change.

## Strict Mode runtime fix

`useAsyncTask` used a mount guard initialized to `true`, but its effect
cleanup only ever set it to `false`. React development Strict Mode runs
effect setup, cleanup, and setup again. The second setup therefore left the
guard false, so a settled task correctly updated its controller but the hook
incorrectly declined to publish the controller snapshot.

The effect now restores `mountedRef.current = true` during setup, then sets
it false and cancels the current controller during cleanup. The controller
is still created once per component lifetime, real unmount still cancels
work, and controller run IDs continue to reject stale earlier results.

`useAsyncTask.test.ts` now runs its idle/running/succeeded, failed,
stale-first-run, explicit cancel, and unmount cancellation coverage inside
`React.StrictMode`. The successful-completion assertion is the regression
case that fails with the former effect lifecycle.

## Reproducible tooling

The previously floating core packages are pinned to their already-installed
versions: React and React DOM 19.2.7, TypeScript 6.0.3, Vite 8.0.16,
`@vitejs/plugin-react` 6.0.2, `@types/react` 19.2.17, and
`@types/react-dom` 19.2.3. Future upgrades should be explicit milestones or
PRs that update package.json and package-lock.json together and rerun the
frontend verification suite.

`cross-env` 10.1.0 now supplies `LEVIATHAN_REAL_SMOKE=1` for both real-smoke
scripts, replacing Windows CMD `set ...&&` syntax without duplicating
Playwright configuration. The test script also supplies Node's
`--localstorage-file=.vitest-localstorage` option. This makes jsdom's
existing `window.localStorage` tests work under Node 26; its SQLite sidecar
files are ignored as test output.

## Scheduling metadata and conventions

The Atlas header and page `file` fields now describe the completed
feature-directory split. `views.tsx` remains shell dispatch and
`layouts.ts` remains geometry. The conventions document received targeted
post-M4/MachinaLayout 0.6.0 ownership and table-bridge corrections; the
separate public-booking horizontal and vertical layout trees remain intact.
The screen-catalog browser assertions were also corrected to name rendered
geometry roots rather than the deleted, never-rendered presentational
sub-rows; component `data-testid` coverage continues to exercise those
presentational regions in the relevant feature tests. The real-reschedule
smoke now waits for each task-backed command. It takes the backend's
controlled payment-required response before satisfying the local/test
payment and confirming again, avoiding a test-only duplicate-command race.
The reschedule panel now treats the hold endpoint's `satisfied` lifecycle
value (and the fixture/audit `payment_satisfied_fake` value) as payment
satisfaction, so a successful local payment clears a prior controlled
confirmation error.

## Table typing result

MachinaLayout 0.6.0 does not expose generics on
`pendingResultTransitionsFromTable`; the existing cast is required by its
published `TemplateBoard`/`TemplateEvent` return type. M28 retains the
visible cast with a focused source comment and records the upstream API
request in `m28-machina-table-typing-friction.md`.

## Verification

Run from `src/Leviathan.Web`:

```bash
npm install
npm run build
npm test -- --run
npm run test:e2e
npm run test:e2e:real
npm run test:e2e:reschedule
```

M28 also invokes the real-smoke scripts directly through Playwright with
`LEVIATHAN_REAL_SMOKE=1` to verify the environment contract outside npm.

Completed verification:

- `npm install` — completed; 0 vulnerabilities reported.
- `npm run build` — passed.
- `npm test -- --run` — 26 files, 159 tests passed.
- `npm run test:e2e` — 23 passed; the two opt-in real-backend specs skipped.
- `npm run test:e2e:real` — passed.
- `npm run test:e2e:reschedule` — passed.
- Direct `npx playwright test` runs with `LEVIATHAN_REAL_SMOKE=1` — both
  real-backend specs passed.

## Remaining limitation and M29

The generic loss in the Machina pending-result table bridge remains an
upstream type-surface limitation; runtime validation continues to protect
the table shape. Vite still reports its existing post-minification 500 kB
chunk-size advisory; M28 did not change bundling or introduce code splitting.
Recommended M29 is an auth/account/platform-authority
preflight: ASP.NET Identity boundary, EF/database choice, user/account/
membership/app-installation model, login/session authority, migration from
local-dev identity, and capability grants under real identity. It should
remain a preflight, not an auth, registry, payment, or backend-domain
implementation milestone.
