# Leviathan M2: Debug Layout / State Inspector

M2 adds a debug-only Machina/Leviathan inspector for making shell geometry, shell state, dispatch history, and Ariadne prompt mapping legible at runtime. It supports the Leviathan thesis that UI behavior should be inspectable from explicit Machina layout and dispatch data rather than inferred from DOM/CSS vibes.

## Enable and disable

- Open the frontend with `?debug=1` to enable the inspector and persist `leviathan.debugInspector=true` in `localStorage`.
- Open with `?debug=0` to disable the inspector and clear the persisted flag.
- When debug mode is enabled, a small `Inspector` toggle button appears. The toggle opens or collapses the Machina-rendered inspector region.
- The inspector does not require backend configuration.

## What it shows

The inspector is rendered as a Machina slot named `debugInspector`, backed by a `debug-inspector` layout row. It displays:

- Resolved Machina layout nodes: id, debug label, view key, parent id, depth/order, and resolved rectangle.
- Current shell state summary: route, status, error, app count, current session id, screen revision, prompt id/kind, and text-input presence/length.
- Recent dispatch events in a small in-memory ring buffer with sequence numbers, timestamps, event type, and compact payload summaries.
- Current Ariadne prompt mapping when a prompt is active: prompt id, prompt kind, revision, options/action keys, and the typed dispatch event each action emits.
- A details region containing the compact diagnostic snapshot JSON and full shell state JSON for manual inspection.

## Why this supports LLM-legible frontend work

The inspector reports the same resolved Machina layout document used by `MachinaReactView`, plus pure shell-state and prompt-mapping summaries. A human or LLM can reason from stable ids, labels, rectangles, events, and typed prompt actions rather than reconstructing shell behavior from CSS or ad hoc DOM screenshots.

## Snapshot export

The `Copy snapshot` button writes a compact JSON snapshot to the browser clipboard when `navigator.clipboard` is available. The same snapshot is also rendered in a read-only text area so it can be copied manually when the Clipboard API is unavailable.

Snapshot fields include:

- `generatedAt`
- `route`
- `status`
- `currentScreenSummary`
- `layoutNodes`
- `recentEvents`
- `promptMapping`

The snapshot is designed to be pasted into Codex/ChatGPT for frontend diagnosis without requiring a DOM dump.

## Intentionally omitted

- No auth, persistence, social features, feeds, APK packaging, payments, notifications, or live LLM calls.
- No backend debug endpoint was added.
- No DOM measurement is used for shell geometry; the inspector reports resolved Machina rectangles.
- Transcript payloads and screen DTOs are summarized by default to avoid giant repeated snapshots.
- The inspector is not product UI and remains behind the explicit debug flag.

## Known limitations

- The inspector panel consumes vertical shell space while open; it is a debug region, not a polished responsive product feature.
- Clipboard copy cannot be guaranteed in every browser/security context, so manual copy from the text area remains the fallback.
- The dispatch ring buffer is in-memory only and resets on page reload.
- Browser E2E was not claimed unless the backend and frontend are manually run together.

## Recommended M3

If M2 is accepted, M3 should choose between:

1. APK wrapper / mobile packaging, if demo optics are the next priority.
2. Session persistence, if platform correctness and continuity are the next priority.
