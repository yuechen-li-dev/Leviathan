# Leviathan M1: Machina Shell Contract

## Ownership boundary

Machina owns the frontend shell geometry, screen structure, and navigation intent dispatch. React is retained as an adapter for slot content, styling, and controls rendered inside Machina rectangles. CSS may set typography, colors, borders, padding, and local control affordances, but it must not become the primary app-shell layout authority.

## M1a dependency boundary clarification

Vendored source under `vendor/Dominatus` and `vendor/MachinaLayout.JS` is reference/documentation source only. Leviathan should consume published packages whenever they exist: Dominatus/Ariadne runtime packages from NuGet and MachinaLayout from npm. Temporary fallbacks must be documented with the exact missing package and the smallest workaround.

For the frontend shell, Machina owns layout rows, text rendering primitives, and dispatch intent. React owns component rendering and styling inside Machina slots. CSS must not own app-shell layout or responsive shell breakpoints. Browser URL/history mirrors shell state for navigation ergonomics, but dispatch state remains the conceptual routing owner.

## Dispatch flow

View slots emit typed `LeviathanDispatch` events such as `open-apps-list`, `open-rust-simulator-app`, `advance-prompt`, `choose-option`, and `submit-text-input`. `MachinaHost` handles those events, calls the existing Minimal API, updates shell state, and mirrors dispatch-owned navigation into browser history.

## Layout/render flow

The host builds Machina `LayoutRow[]` documents for the apps screen and RustSimulator screen, resolves them with `resolveLayoutRows`, and renders them through `MachinaReactView`. The view registry maps Machina view names to React slot renderers. Slot renderers receive state through Machina view data and emit typed dispatch only.

## AriadneScreenDto mapping

`AriadneScreenDto.title`, `transcript`, `prompt`, `revision`, `sessionId`, `isComplete`, and `error` are mapped into RustSimulator view data. The transcript slot renders prose lines with `MachinaTextView`. The prompt slot maps line prompts to `advance-prompt`, choice prompts to `choose-option`, and text-input prompts to `set-text-input` plus `submit-text-input`.

## Run/build

```bash
cd src/Leviathan.Web
npm install
npm run build
npm run dev
```

The dev server proxies `/api` to the backend at `http://localhost:5188`.

## Known limitations

- Browser back/forward popstate reconciliation is not implemented; M1 only mirrors dispatch navigation into history and reads the initial URL.
- Each RustSimulator open starts a new Ariadne session. Existing-session deep links are intentionally deferred.
- Manual browser verification requires running the backend and frontend together.

## Recommended M2

- Add popstate-to-dispatch reconciliation.
- Add session restore/open-session routing once persistence exists.
- Add focused frontend tests for Machina dispatch events and Ariadne prompt mapping.
- Expand Machina layout variants for small screens after the proof path stabilizes.
