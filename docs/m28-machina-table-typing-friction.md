# M28 Machina table typing friction

`setup/setupMachine.ts` uses MachinaLayout 0.6.0's
`pendingResultTransitionsFromTable(pendingResultTable)` to expand the three
standard pending-result transition pairs. The function is declared as:

```ts
function pendingResultTransitionsFromTable(
  table: ColumnarTable,
  options?: PendingResultTransitionTemplateOptions,
): readonly DeusTransitionRow<TemplateBoard, TemplateEvent>[];
```

The setup machine therefore needs this explicit boundary cast:

```ts
pendingResultTransitionsFromTable(pendingResultTable)
  as unknown as DeusTransitionRow<SetupBoard, SetupEvent>[]
```

The public API has no `TBoard` or `TEvent` generic parameters and accepts a
non-generic `ColumnarTable`. It consequently loses the connection between
the table's string columns (`successTarget`, `successPayload`, and event
names) and `SetupBoard`/`SetupEvent`. Narrowing the local table cannot
restore that information through the published signature.

## Suggested upstream shape

At minimum, allow callers to supply the machine types:

```ts
function pendingResultTransitionsFromTable<TBoard, TEvent extends DeusEvent>(
  table: ColumnarTable,
  options?: PendingResultTransitionTemplateOptions,
): readonly DeusTransitionRow<TBoard, TEvent>[];
```

A stronger follow-up could type the relevant table columns against keys of
`TBoard` and discriminated members of `TEvent`; that is more involved but
would catch misspelled string cells at compile time.

## Runtime safety

`Table.defineWithSchema` and the pending-result template validation still
validate table structure at runtime. The setup-machine tests exercise the
expanded success/failure paths. The cast changes no runtime behavior; it is
kept visible at the sole upstream typing boundary rather than hidden behind
a local wrapper.
