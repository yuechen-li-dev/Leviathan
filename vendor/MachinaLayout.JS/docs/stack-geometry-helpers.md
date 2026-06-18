# Stack geometry helpers

MachinaLayout stack geometry helpers are pure query utilities for resolved layout documents. They make common stack arithmetic inspectable without introducing new layout primitives or changing resolver behavior.

## Why these helpers exist

Apps with fixed chrome, content panes, sidebars, and inspectors often need to ask questions like:

- What rectangle is left after stack padding?
- How much of a stack main axis is consumed by direct children and gaps?
- Where is the interval between a header-like child and an inspector-like child?

The resolver already computes deterministic rectangles. These helpers expose that resolved state so humans and LLMs do not have to hand-copy padding, gap, and fixed/fill calculations.

## Resolved-document query boundary

These helpers inspect existing rectangles. They do not:

- mutate the resolved layout document,
- recompute layout from `LayoutRow[]`,
- account for DOM measurements,
- inspect descendants when a helper is scoped to direct stack children,
- change `StackArrange` or `GridArrange` semantics.

They report resolved state, including resolved fill allocations, rather than pre-resolution authoring guesses.

## `getArrangeContentRect(parentRect, arrange)`

`getArrangeContentRect` returns a fresh content rectangle for an arranger:

- `stack`: subtracts normalized stack padding and throws `StackContentNegative` if padding makes content negative.
- `grid`: subtracts normalized grid padding and throws `GridContentNegative` if padding makes content negative.
- omitted or unsupported arranger: returns a fresh copy of the parent rectangle.

```ts
const contentRect = getArrangeContentRect(parent.rect, parent.arrange);
```

## `getStackContentRect(layout, parentId)`

`getStackContentRect` looks up a resolved stack parent and returns its content rectangle after stack padding.

```ts
const content = getStackContentRect(layout, "scheduling-content");
```

The parent must exist and must have `arrange.kind === "stack"`. A non-stack parent throws `ExpectedStackArrange`.

## `getStackMainAxisMetrics(layout, parentId)`

`getStackMainAxisMetrics` returns main-axis and cross-axis data for a resolved stack parent:

- parent and content rectangles,
- normalized padding and gap,
- direct child ids in resolved child order,
- per-child rectangles and main/cross starts, ends, and sizes relative to the content rectangle,
- content main/cross sizes,
- total child main size,
- total gap size,
- used main size,
- unused main size.

Because the input is a resolved document, fill children are reported at their actual resolved sizes.

```ts
const metrics = getStackMainAxisMetrics(layout, "root");
const remaining = metrics.unusedMainSize;
```

## `getStackChildRects(layout, parentId)`

`getStackChildRects` returns fresh direct-child rectangle copies keyed by child id.

```ts
const childRects = getStackChildRects(layout, "root");
const sidebar = childRects.sidebar;
```

Only direct stack children are returned. Descendant rectangles should be queried from `layout.nodes` or from a helper scoped to their own parent.

## `getRemainingStackRect(layout, options)`

`getRemainingStackRect` is a narrow interval query over direct children of one resolved stack parent.

It computes the interval between:

- the latest `mainEnd` among `afterChildren`, or the content start when no `afterChildren` are provided, and
- the earliest `mainStart` among `beforeChildren`, or the content end when no `beforeChildren` are provided.

The returned rectangle preserves the full content cross-axis size.

```ts
const shellContent = getRemainingStackRect(layout, {
  parentId: "root",
  afterChildren: ["hero"],
  beforeChildren: ["inspector"],
});
```

If the computed interval is negative, the helper throws `StackQueryInvalidRange`. This helper is a query helper, not a solver; it does not move children or search descendants.

## Inspector/content shell example

```ts
const metrics = getStackMainAxisMetrics(layout, "root");
const content = getStackContentRect(layout, "scheduling-content");

const interactiveRegion = getRemainingStackRect(layout, {
  parentId: "root",
  afterChildren: ["toolbar"],
  beforeChildren: ["inspector"],
});
```

This pattern is useful for app shells that place fixed controls around an interactive content region while still keeping all geometry framework-independent.
