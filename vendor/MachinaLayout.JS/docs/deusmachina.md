# DeusMachina

DeusMachina is MachinaLayout's tiny behavioral kernel. It is deliberately small: utility judgment, explicit row-first state machines, stack-style state paths, deterministic stepping, and trace output.

```ts
import { defineDeusMachine, judgeUtility, stepDeusMachine } from "machinalayout/deus";
```

## Contract summary

DeusMachina combines three narrow pieces:

1. `judgeUtility(context, candidates, options)` for deterministic utility selection.
2. `defineDeusMachine(machine)` for validating row-first stack HFSM definitions.
3. `stepDeusMachine(machine, snapshot, event)` for one synchronous deterministic step with trace output.

State paths are non-empty arrays of non-empty strings. Segments are not trimmed; empty or whitespace-only segments are invalid. `formatDeusPath(["a", "b"])` formats paths as `a/b`. DeusMachina treats a path as its own ancestor for transition candidate collection.

## Row-first authoring

Machines are authored as arrays, not nested objects:

```ts
defineDeusMachine({
  initial: ["debugOverlay", "collapsed"],
  states: [{ path: ["debugOverlay", "collapsed"] }],
  transitions: [{ key: "show", from: ["debugOverlay", "collapsed"], event: "showOverlay" }],
});
```

Hierarchy comes from stack paths such as `debugOverlay/nonInteractiveOverlay`, not from nested authoring syntax.

## Mutable board convention

Snapshots keep the board by reference. `stepDeusMachine` returns a new snapshot object and a copied state path, but it does not clone the board. User actions may mutate the board intentionally. Machine definitions are treated as immutable and are copied where DeusMachina normalizes paths.

## Purity rules

`when`, `score`, and `reason` should be pure. They may read the board and event, but should not mutate them. `do`, `onEnter`, and `onExit` may mutate the board. DeusMachina does not sandbox user functions, so accidental mutation from guards, scores, or reasons is possible and is the caller's responsibility.

User errors are not swallowed. If a guard, score, reason, action, enter hook, or exit hook throws, the error propagates to the caller.

## Transition selection semantics

A step gathers candidate transitions from the exact current state path, then parent paths upward to root. Candidate grouping is leaf first, then parent, then grandparent. Within each `from` path, author transition order is preserved.

An omitted transition `event` accepts any event. Otherwise, the transition event must equal `event.type`. An omitted `when` means eligible; a false `when` makes the transition ineligible and keeps it in the trace with score `0`.

Eligible transitions score as follows:

- omitted transition `score`: `1`
- numeric or function transition `score`: that finite score
- utility transition with no explicit transition `score`: selected utility candidate score

All gathered eligible candidates compete by score regardless of depth. Highest score wins. Ties are stable by candidate search order, so a leaf transition beats an equal-scored parent transition, and earlier author rows beat later rows within the same path.

If no transition is selected, state and board reference are unchanged, but `stepIndex` increments because a step occurred. If a selected transition has no `to`, state remains the same. Same-state transitions do not run exit or enter hooks.

Dynamic `to` functions are validated at runtime. They must return a valid path that exists in the machine.

## Utility judgment semantics

`judgeUtility` preserves candidate array order in its trace. Omitted `when` means eligible. A false `when` makes the candidate ineligible with score `0`, and score functions are evaluated only for eligible candidates. Reason strings or functions are included in trace entries; reason functions are evaluated while building trace entries.

Scores must be finite. If no candidate is eligible, `selected` is `null`. Highest score wins and ties are stable by candidate order.

Hysteresis accepts a finite margin greater than or equal to `0`. If `previousKey` is present and the previous candidate is still eligible, a challenger must satisfy `challengerScore >= previousScore + margin` to replace it. If margin is `0`, normal highest-score semantics apply. If the previous candidate is missing or ineligible, normal selection applies.

`judgeUtility` does not mutate candidate definitions or the context itself, though user-provided functions can mutate external objects if they choose to.

## Utility transition semantics

A transition with `utility` evaluates utility candidates only after its event and `when` checks pass. If no utility candidate is selected, the transition is not eligible and neither utility `do` nor transition `do` runs.

If a utility candidate is selected, its judgment appears in the transition trace. The transition score is the explicit transition score when provided; otherwise it is the selected utility candidate score. Transition `hysteresis` is passed through to the utility judgment via `hysteresis.previous(board)` and `hysteresis.margin`; `undefined` from `previous` means no previous key.

Utility candidate `do` receives the original board and event and runs before the outer transition `do`.

## Enter, exit, and action order

When state changes, execution order is:

1. `onExit` for states being exited, deepest first.
2. Selected utility candidate `do`, if present.
3. Transition `do`, if present.
4. `onEnter` for states being entered, shallow to deep.

For `root/a/x -> root/b/y`, exit order is `root/a/x`, then `root/a`; enter order is `root/b`, then `root/b/y`. For `root/a/x -> root/a/y`, only `root/a/x` exits and only `root/a/y` enters. For `root/a -> root/a`, no exit or enter hooks run.

## Trace contract

`stepDeusMachine` returns a trace containing state before, state after, event type, considered transitions, selected transition, transition eligibility, transition score, transition search index, reasons when provided, and inner utility judgment when applicable.

Trace data is intended to be JSON-serializable. It does not include function references, the board object, or arbitrary event payloads. `formatDeusStepTrace(trace)` provides a small deterministic one-line summary for selected and unselected steps.

## Debug overlay helper

`createMachinaDebugOverlayMachine()` returns a validated DeusMachina machine for the controlled React debug overlay modes. `getMachinaDebugOverlayBehavior(board)` maps the board to rendering behavior:

- `collapsed`: not visible, `pointerEvents: "none"`, consumes no layout space.
- `nonInteractiveOverlay`: visible, `pointerEvents: "none"`, consumes no layout space.
- `interactivePanel`: visible, `pointerEvents: "auto"`, consumes layout space.

Labels and borders remain controlled by the board booleans; `false` stays false in overlay and panel modes.

## Non-goals

DeusMachina intentionally does not include async workflows, tools, actors, persistence, LLM calls, schedulers, nested authoring syntax, uncontrolled React state, or a visual editor.
