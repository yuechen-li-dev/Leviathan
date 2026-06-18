# Screen catalog and viewport matrix

Machina screen catalog helpers describe named app screens and responsive viewport presets as plain TypeScript data. They are intended for future capture, inspection, and handoff tooling, but they do not perform any browser automation themselves.

These utilities model this relationship:

```ts
screen + viewport -> task metadata
```

A future runner can consume each task to navigate an app route, set a viewport, capture screenshots, inspect DOM, collect layout snapshots, or write handoff bundles.

## Screen catalog

A `MachinaScreen` is a stable, named screen entry:

```ts
const screens = defineMachinaScreens([
  {
    key: "provider-setup",
    route: "/apps/scheduling/setup",
    fixture: "provider-setup",
    viewports: ["desktop", "tablet", "phone"],
    tags: ["scheduling", "setup"],
  },
]);
```

The `route` value is opaque app metadata. Machina does not parse it, validate URL semantics, or integrate with a router. `fixture`, `tags`, `title`, and `metadata` are also app-owned metadata for downstream tools.

`defineMachinaScreens` validates screen keys and routes, rejects duplicate keys, returns fresh screen objects, and preserves author order in `catalog.order`.

## Viewport matrix

A `MachinaViewport` is a stable viewport preset:

```ts
const viewports = createViewportMatrix("standard-responsive");
```

Built-in presets:

| Preset | Order | Sizes |
| --- | --- | --- |
| `standard-responsive` | desktop, tablet, phone | 1440×900, 1024×768, 390×844 |
| `desktop-only` | desktop | 1440×900 |
| `mobile-first` | phone, tablet, desktop | 390×844, 1024×768, 1440×900 |

Default preset is `standard-responsive`. Built-in viewport tags are:

- desktop: `desktop`
- tablet: `tablet`
- phone: `phone`, `mobile`

Use `defineMachinaViewports` for custom matrices. It validates unique non-empty keys, positive finite width/height, optional positive finite `deviceScaleFactor`, and preserves input order.

## Task expansion

`expandScreenViewportTasks` expands a screen catalog and viewport matrix into deterministic `MachinaScreenViewportTask[]` values:

```ts
const screens = defineMachinaScreens([
  {
    key: "provider-setup",
    route: "/apps/scheduling/setup",
    fixture: "provider-setup",
    viewports: ["desktop", "tablet", "phone"],
    tags: ["scheduling", "setup"],
  },
]);

const viewports = createViewportMatrix("standard-responsive");
const tasks = expandScreenViewportTasks(screens, viewports);
```

Task ordering is always catalog order first, then viewport matrix order. One task represents one screen at one viewport and includes the raw screen route, fixture, copied screen/viewport references, merged tags, a deterministic task key, and a filesystem-safe artifact base name.

## Filtering semantics

Expansion accepts optional filters:

```ts
const phoneSchedulingTasks = expandScreenViewportTasks(screens, viewports, {
  screenKeys: ["provider-setup"],
  viewportKeys: ["phone"],
  tags: ["scheduling", "mobile"],
});
```

Filtering is deterministic:

1. Start with screens in catalog order.
2. If `screenKeys` is present, include only those screens. Unknown requested screen keys throw `UnknownScreenKey`.
3. A screen's `viewports` list limits the default eligible viewport set for that screen.
4. If `viewportKeys` is present, it further filters eligible viewport keys. Unknown requested viewport keys throw `UnknownViewportKey`.
5. Screen-referenced viewport keys must exist in the provided viewport matrix or expansion throws `UnknownViewportKey`.
6. Tags merge screen tags first, then viewport tags, with duplicates removed while preserving order.
7. If `tags` is present, a task is included only when every requested tag is in the merged task tags.

## Artifact base names

Task keys use raw keys joined by `__`, for example `provider-setup__phone`. Artifact base names slug each side independently:

```ts
slugMachinaArtifactName("Provider Setup!"); // "provider-setup"
```

A task for screen key `Provider Setup` and viewport key `Phone XL` receives `artifactBaseName: "provider-setup__phone-xl"`.

## Limitations

This is a framework-independent metadata layer only. It intentionally does not include:

- browser automation,
- screenshot capture,
- DOM inspection or DOM summaries,
- handoff bundle writing,
- router integration,
- route parsing,
- fixture serving,
- adapter behavior,
- layout resolver semantic changes.

The helpers work in Node or the browser and have no Playwright, DOM, React, Vue, or React Native dependency.
