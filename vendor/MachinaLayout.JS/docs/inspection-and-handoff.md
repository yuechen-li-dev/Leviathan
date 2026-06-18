# Inspection and handoff bundles

MachinaLayout inspection helpers provide a small, framework-light contract for handing UI work from one person or model to another. The utilities standardize the data shapes that app-local workflows can combine with screenshots and layout snapshots, without adding browser automation to MachinaLayout itself.

## Purpose

A useful UI handoff often contains four artifacts:

- a screenshot for visual truth, produced by userland tooling;
- a compact DOM summary for semantic/browser truth;
- a Machina layout snapshot for layout truth;
- a handoff manifest for route, viewport, screen, and artifact metadata.

M25c standardizes the DOM summary and handoff manifest/writer pieces. It does not capture screenshots, launch browsers, drive routes, run viewport matrices, or perform visual diffs.

## DOM summary

Import DOM-safe helpers from the inspect subpath:

```ts
import { summarizeMachinaDom } from "machinalayout/inspect";

const summary = summarizeMachinaDom({
  root: document,
  includeA11y: true,
  includeTextExcerpt: true,
  generatedAt: "2026-01-01T00:00:00.000Z",
});
```

By default, `summarizeMachinaDom` selects `[data-machina-node-id]`, reads only compact debug metadata, calls `getBoundingClientRect()` for each selected element, and reconstructs the nearest matching ancestor hierarchy. It intentionally does not dump full HTML.

The standard Machina browser debug attributes are:

- `data-machina-node-id`
- `data-machina-view`
- `data-machina-slot`
- `data-machina-debug-label`
- `data-machina-layer`

When `includeA11y` is enabled, the summary includes `role` and `aria-label` if present. When `includeTextExcerpt` is enabled, the summary includes normalized `textContent` excerpts. Text excerpts are compact hints, not a lossless DOM serialization; the simple text collection may include descendant text in ancestor excerpts.

You can also provide a custom selector for app-specific annotations:

```ts
const summary = summarizeMachinaDom({
  selector: "[data-debug-node]",
  includeTextExcerpt: true,
});
```

## Handoff bundle writer

Import Node-only handoff helpers from the handoff subpath:

```ts
import { writeMachinaHandoffBundle } from "machinalayout/handoff";

await writeMachinaHandoffBundle({
  outputDir: "./artifacts/provider-setup-phone",
  artifactBaseName: "Provider Setup / Phone!",
  screenshotPath: "./artifacts/screenshot.png",
  domSummary: summary,
  layoutSnapshot,
  route: "/provider/setup",
  tags: ["handoff", "phone"],
});
```

`writeMachinaHandoffBundle` ensures the output directory exists, writes JSON with two-space indentation, copies an existing screenshot when one is supplied, and returns absolute output paths. The manifest stores relative artifact file names so the bundle can move as a directory.

The writer uses deterministic artifact names based on a slugged base name:

- `${base}__screenshot.<ext>`
- `${base}__dom-summary.json`
- `${base}__machina-snapshot.json`
- `${base}__handoff.json`

If no explicit base name is supplied, the writer uses `task.artifactBaseName`, then route/fixture/viewport metadata, then `machina-handoff`.

## Manifest shape

The manifest has `schemaVersion: 1`, a `createdAt` timestamp, optional route/fixture/screen/viewport metadata, optional tags and metadata, and an `artifacts` object containing relative file names.

```json
{
  "schemaVersion": 1,
  "createdAt": "2026-01-01T00:00:00.000Z",
  "route": "/provider/setup",
  "viewportKey": "phone",
  "artifactBaseName": "provider-setup-phone",
  "artifacts": {
    "screenshot": "provider-setup-phone__screenshot.png",
    "domSummary": "provider-setup-phone__dom-summary.json",
    "layoutSnapshot": "provider-setup-phone__machina-snapshot.json",
    "manifest": "provider-setup-phone__handoff.json"
  }
}
```

## Composition with screen tasks

The handoff writer accepts a `MachinaScreenViewportTask` from the screen catalog and viewport matrix helpers. When provided, the writer copies `route`, `fixture`, `screenKey`, `viewportKey`, `viewport`, `task.artifactBaseName`, and task tags into the manifest. Input tags are merged after task tags with duplicates removed while preserving order.

```ts
await writeMachinaHandoffBundle({
  outputDir: "./artifacts",
  task,
  domSummary,
  layoutSnapshot,
});
```

## Limitations and boundaries

These utilities are intentionally narrow:

- no Playwright dependency;
- no browser launch or browser automation;
- no screenshot capture;
- no viewport matrix runner;
- no visual diff;
- no adapter behavior changes;
- no layout resolver semantics changes.

Userland tooling remains responsible for route navigation, viewport setup, screenshots, and any visual comparison workflow. MachinaLayout provides the lightweight schemas and writing helpers that make those artifacts predictable.
