# React adapter (`machinalayout/react`)

## Shared model boundary

- Layout geometry is authored and resolved by Machina core (`LayoutRow[]` -> resolved rectangles).
- React supplies components that render inside those resolved rectangles.
- The adapter does not introduce a React-specific layout model.
- Preferred import path is `machinalayout/react`.
- Root import compatibility remains during `0.x`.

## Basic usage

```tsx
import { resolveLayoutRows } from "machinalayout";
import { MachinaReactView } from "machinalayout/react";

const layout = resolveLayoutRows(rows, rootRect);
const views = { Header, Sidebar, Inspector };

<MachinaReactView layout={layout} views={views} />;
```

Effective render key is `view ?? slot`.

## Stable view registry and data channels

`views` should hold stable component references. Pass dynamic values through data channels.

Good:

```tsx
const views = { Inspector };

<MachinaReactView
  layout={layout}
  views={views}
  viewData={{ Inspector: inspectorData }}
  nodeData={{ sidebar: sidebarData }}
/>;
```

Bad (new component identity every render):

```tsx
const views = {
  Inspector: () => <Inspector value={value} />,
};
```

## Slot props

Slot views receive:

- `id`
- `rect`
- `debugLabel`
- `node`
- `viewKey`
- `viewData`
- `nodeData`

## Coordinate normalization

Core resolved rectangles are root-space coordinates.

The adapter renders nested absolutely positioned DOM wrappers in parent-local space:

- `left = node.rect.x - parent.rect.x`
- `top = node.rect.y - parent.rect.y`

The outer wrapper represents root coordinate space; the root node itself renders at local `left: 0`, `top: 0`.

## DOM renderer policy boundary

Containment/content-visibility are DOM renderer policies implemented by the adapter layer.

Allowed for Machina wrappers:

- position (`relative`/`absolute`)
- `left` / `top` / `width` / `height`
- `box-sizing`
- `z-index`
- containment/content-visibility
- optional debug/cosmetic wrapper styles

Not used as geometry authority:

- flexbox/grid/margins/transforms
- DOM measurement for layout solving
- CSS classes determining solved geometry

React components render payload UI inside adapter-owned rectangles; React does not own outer layout geometry.

## Inspection handoff surface

React DOM rendering includes the standard Machina `data-machina-*` debug attributes used by the framework-light DOM summary helpers. See [Inspection and handoff bundles](inspection-and-handoff.md) for the `machinalayout/inspect` and `machinalayout/handoff` workflow.

## Debug overlay

`MachinaReactView` accepts an optional controlled `debugOverlay` prop:

```tsx
<MachinaReactView
  layout={layout}
  debugOverlay={{ mode: "nonInteractiveOverlay", labels: true, borders: true }}
/>
```

Modes:

- `collapsed`: no overlay labels or borders are rendered and app interactions are not blocked.
- `nonInteractiveOverlay`: overlay labels and borders render when enabled, do not consume layout space, and use `pointer-events: none`, making the mode suitable for screenshots and browser automation.
- `interactivePanel`: overlay labels/borders can render with a small panel and `pointer-events: auto` for human inspection.

The prop is controlled. M26 does not add React state management or hooks; DeusMachina provides the standalone behavior helpers used to derive the rendering semantics. In `nonInteractiveOverlay`, overlay artifacts use `pointer-events: none` and do not consume layout space; in `collapsed`, overlay artifacts are not rendered. Labels and borders remain controlled booleans and do not change existing `data-machina-*` attributes on node wrappers.
