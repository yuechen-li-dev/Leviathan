# Scheduling app frontend conventions (post-M4, reviewed in M28)

Written at the end of the M0-M4 milestone ladder, once there were four real
examples to compare instead of guessing at a convention in advance. M28
confirmed the split remains current: each major surface owns its directory,
`views.tsx` dispatches shell slots, and `layouts.ts` defines geometry. Update
this file when a fifth machine or app teaches something new.

## The three real `M.machine` instances

Bookings-list and confirmation's own booking-fetch use `useAsyncTask`
directly with no stage machine - neither needed one (see the DeusMachina
port audit's "what not to port" section, and M2.5's summary for why). The
three that do have one:

| Machine | File | States (path under a shared parent) |
|---|---|---|
| Setup | `setup/setupMachine.ts` | `idle → providerPending / resourcePending / servicePending / availabilityPending → idle` |
| Reschedule | `confirmation/rescheduleMachine.ts` | `available → picker → replacement → result` |
| Public booking | `publicBooking/bookingMachine.ts` | `browsing → held → confirmed` |

### Shared parent state, always declared explicitly

Every machine declares a bare parent path (`["setup"]`, `["reschedule"]`,
`["booking"]`) as its own state with `M.state([...])`, purely so that
"applies from any stage" transitions (field edits, `editCustomerField`,
`clearSelection`) can use `from: ["setup"]` etc. This isn't optional
convention - `defineDeusMachine` validates that every transition's `from`
exactly matches a *declared* state path; the "walk up to parent prefixes"
behavior documented for `stepDeusMachine`'s candidate gathering only
applies during matching, not at definition time. Forgetting the parent
declaration is a `DeusMachinaError` at machine-construction time, found the
hard way building the setup machine in M0 and rediscovered building
reschedule and public-booking's machines too - worth remembering as a
convention rather than rediscovering a fourth time.

### `*Pending` states are for gating, not just busy display

Setup's `providerPending`/`resourcePending`/etc. exist because
`createResource` is only eligible `from: idle`, specifically preventing it
from firing while `createProvider` is still in flight - a real
precondition, not decoration. Reschedule and public booking *don't* have
per-step pending states in their stage machines, because M2 built
`machinalayout/async` first: each network step gets its own
`AsyncTaskController` (own idle/running/succeeded/failed/cancelled
lifecycle), and the stage machine only tracks macro stage. That's a
cleaner split than setup's, but setup's `*Pending` states were deliberately
*not* retroactively removed in M2.5 - they still do a real job
(sequencing gates) that `AsyncTaskController` doesn't replace, and
collapsing them would have been an unrelated architecture change bolted
onto a "replace try/catch" task.

**Convention going forward:** if a new machine's steps have real ordering
prerequisites (must do X before Y), model that as real states with `when`
guards, the way setup does. If they don't (steps can happen in any order,
or business logic doesn't care about interleaving), keep the stage machine
to macro-visible states only and let `AsyncTaskController` own each step's
own lifecycle, the way reschedule and public booking do.

### `board.live` lives on the board itself only when transitions need it

Setup and reschedule don't put `live` on the board - reschedule's fixture
mode is a static preview driven entirely by props (`applyFixtureState`),
never user-interactive, so no transition needs to branch on it. Public
booking's fixture mode *is* interactive (selecting a slot really does
create a fixture hold), and two transitions (`selectDate`, `clearSelection`)
genuinely behave differently in live vs. fixture mode. Since Deus
transitions only see `(board, event)`, not surrounding component state,
`live: boolean` has to be board data if any transition's behavior depends
on it - implemented as two same-event transitions with mutually exclusive
`when: (b) => b.live` / `when: (b) => !b.live` guards, since one transition
can't conditionally have a `to` or not.

**Convention:** don't add `live` to a board pre-emptively. Add it only when
a transition's behavior genuinely forks on it, the way public booking's did.

### Fixture-mode SSR correctness: board data now, board state never

All three machines' fixture-mode rendering has to be correct on the very
first `renderToStaticMarkup()` pass, since static rendering never runs
effects. `createDeusSnapshot` always starts `state` at `machine.initial`
regardless of what's in the `board` argument - board *data* can be seeded
correctly up front, but the machine's own graph *state* cannot, short of
replaying real events (which effects don't run during SSR anyway).

- **Setup**: fixture and live are two separate top-level components sharing
  one presentational tree (`ProviderSetupFlow`); fixture mode never
  actually steps the machine, so this doesn't come up.
- **Reschedule**: `boardFromFixtureState()` seeds board data correctly at
  construction; the component reads `stage` **directly from
  `props.fixtureState.stage`**, not from `deus.state`, specifically to
  route around this limitation.
- **Public booking**: same idea, `initialBoard()` seeds data directly from
  the scenario; since fixture mode is also interactive here, dispatches
  still happen for real user clicks, keeping the machine's graph state
  honest going forward from mount - it's only the very first paint that
  can't come from the machine itself.

**Convention:** if a machine needs correct fixture-mode output on the first
paint (true of every fixture used in a `renderToStaticMarkup` test), seed
board *data* in the initial board construction, and read whatever
stage/mode value the render needs from the fixture input directly rather
than from the machine's own state, until `useDeusMachine`'s hook API grows
support for the hydration options `createDeusSnapshot`/
`hydrateDeusSnapshot` gained in 0.4.1 (checked as of 0.6.0: still not
threaded through the hook).

## Shell and table ownership

Keep surface behavior in `setup/`, `landing/`, `publicBooking/`,
`confirmation/`, or `bookings/`; put only shared presentation/live-context
helpers in `shared/`. `views.tsx` dispatches fixture/live surfaces into
registered shell slots, while `layouts.ts` owns the explicit geometry. Do
not merge the horizontal and vertical public-booking layout trees: they
register different components and share only their shell scaffolding.

MachinaLayout 0.6.0 table bridges are used where a repeated declarative
shape fits (`Atlas.defineAtlasFromTable`, forms, commands, and setup's
pending-result transitions). Keep an exceptional transition hand-written
when it needs behavior the template cannot express; do not reshape domain
behavior merely to fit a table.

## The fixture/live unification question, revisited with four real examples

The original DeusMachina port audit (before M0) flagged this open question:
should fixture and live modes eventually collapse into one component with
two event sources, instead of two components (or one component with
internal branching)? Four surfaces later, here's what actually happened,
which is more informative than speculating further:

- **Setup**: two separate components (`ProviderSetupView` /
  `LiveProviderSetupView`), sharing one presentational tree
  (`ProviderSetupFlow`). Orchestration stays separate because fixture mode
  never needs a machine at all - it's just static props.
- **Confirmation**: same shape as setup (`ConfirmationSurfaceView` /
  `LiveConfirmationView`, sharing `ConfirmationView`).
- **Reschedule**: **one** component (`BookingReschedulePanel`), internal
  `live` boolean, shared machine, fixture mode driven by a dedicated
  `applyFixtureState` event.
- **Public booking**: **one** component (`SchedulingBookingPageProvider`),
  same shape as reschedule, except fixture mode is genuinely interactive
  rather than a static preview.

**What actually decided which shape a surface got:** not a deliberate
architectural choice each time, but whether fixture mode needs to *do*
anything. Setup and confirmation's fixture views are pure display - a
scenario object gets rendered, nothing a user does in fixture mode changes
application state in a way that matters. Reschedule and public booking's
fixture modes are genuinely interactive previews (clicking things visibly
changes what's rendered), which is exactly the condition under which
sharing one machine across both modes pays for itself - the machine is
already doing real work in fixture mode, so it may as well be the *same*
machine live mode uses.

**Conclusion:** there isn't a single right answer to "should fixture and
live share a machine" - it depends on whether fixture mode is interactive.
Don't force unification onto setup/confirmation's static-preview fixture
modes; there's nothing for a shared machine to do there that plain props
don't already do more simply. Do keep sharing one machine wherever fixture
mode is genuinely interactive, the way reschedule and public booking
already prove out.
