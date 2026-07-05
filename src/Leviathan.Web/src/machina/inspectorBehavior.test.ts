/* @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  behaviorFromBoard,
  debugOverlayModeFromLocation,
  initialDebugOverlayBoard,
  useLeviathanInspector,
} from "./inspectorBehavior";

describe("initial debug overlay board + behavior derivation", () => {
  it("stays collapsed for normal routes without debug enabled", () => {
    const board = initialDebugOverlayBoard({
      location: { search: "" } as Location,
      debugEnabled: false,
      inspectorOpen: false,
    });
    expect(behaviorFromBoard(board)).toEqual({
      mode: "collapsed",
      showDockedPanel: false,
      showOverlay: false,
      overlayPointerMode: "none",
      consumesLayoutSpace: false,
      showLabels: false,
      showBorders: false,
    });
  });

  it("preserves the existing docked inspector behavior for ?debug=1", () => {
    const board = initialDebugOverlayBoard({
      location: { search: "?debug=1" } as Location,
      debugEnabled: true,
      inspectorOpen: true,
    });
    expect(behaviorFromBoard(board)).toMatchObject({
      mode: "interactivePanel",
      showDockedPanel: true,
      showOverlay: false,
      overlayPointerMode: "auto",
      consumesLayoutSpace: true,
    });
  });

  it("switches snapshot overlay routes to a non-interactive Machina overlay", () => {
    const board = initialDebugOverlayBoard({
      location: { search: "?debug=1&debugOverlay=nonInteractiveOverlay" } as Location,
      debugEnabled: true,
      inspectorOpen: true,
    });
    expect(behaviorFromBoard(board)).toEqual({
      mode: "nonInteractiveOverlay",
      showDockedPanel: false,
      showOverlay: true,
      overlayPointerMode: "none",
      consumesLayoutSpace: false,
      showLabels: true,
      showBorders: true,
    });
  });

  it("keeps the overlay collapsed when the inspector is closed on narrow routes", () => {
    const board = initialDebugOverlayBoard({
      location: { search: "?debug=1" } as Location,
      debugEnabled: true,
      inspectorOpen: false,
    });
    expect(behaviorFromBoard(board)).toMatchObject({
      mode: "collapsed",
      showDockedPanel: false,
      showOverlay: false,
      overlayPointerMode: "none",
      consumesLayoutSpace: false,
    });
  });

  it("parses only supported debug overlay query values", () => {
    expect(debugOverlayModeFromLocation({ search: "?debugOverlay=nonInteractiveOverlay" } as Location)).toBe(
      "nonInteractiveOverlay",
    );
    expect(debugOverlayModeFromLocation({ search: "?debugOverlay=unknown" } as Location)).toBeUndefined();
  });
});

describe("useLeviathanInspector (real Deus wiring)", () => {
  it("boots collapsed when debug is disabled and ignores toggles", () => {
    const { result } = renderHook(() =>
      useLeviathanInspector({ location: { search: "" }, debugEnabled: false, initialInspectorOpen: false }),
    );
    expect(result.current.mode).toBe("collapsed");
    expect(result.current.board.mode).toBe("collapsed");
    // No bootstrap events needed to reach collapsed (it's the machine's own
    // initial state), so nothing was dispatched yet.
    expect(result.current.lastTrace).toBeNull();
  });

  it("boots into interactivePanel when debug + inspector are on, matching old ?debug=1 behavior", () => {
    const { result } = renderHook(() =>
      useLeviathanInspector({ location: { search: "?debug=1" }, debugEnabled: true, initialInspectorOpen: true }),
    );
    expect(result.current.mode).toBe("interactivePanel");
    expect(result.current.showDockedPanel).toBe(true);
    // Reached via real bootstrap transitions (showOverlay, then openPanel),
    // not conjured board data - confirms graph state and board data agree.
    expect(result.current.lastTrace?.selectedTransition?.key).toBe("overlay.openPanel");
  });

  it("stays functional after booting into interactivePanel - graph state actually matches board data", () => {
    const { result } = renderHook(() =>
      useLeviathanInspector({ location: { search: "?debug=1" }, debugEnabled: true, initialInspectorOpen: true }),
    );
    // Regression guard for the real desync bug found while building this:
    // seeding board.mode directly (without replaying real transitions) makes
    // the first paint look right but silently breaks every subsequent
    // dispatch, because stepDeusMachine checks graph state, not board data.
    act(() => result.current.toggleLabels());
    expect(result.current.showLabels).toBe(true);
  });

  it("togglePanel drives collapsed -> interactivePanel -> collapsed via real transitions, recorded in the trace", () => {
    const { result } = renderHook(() =>
      useLeviathanInspector({ location: { search: "?debug=1" }, debugEnabled: true, initialInspectorOpen: false }),
    );
    expect(result.current.mode).toBe("collapsed");

    act(() => result.current.togglePanel());
    expect(result.current.mode).toBe("interactivePanel");
    expect(result.current.lastTrace?.selectedTransition?.key).toBe("overlay.openPanel");

    act(() => result.current.togglePanel());
    expect(result.current.mode).toBe("collapsed");
    expect(result.current.lastTrace?.selectedTransition?.key).toBe("panel.collapse");
  });

  it("toggleLabels/toggleBorders flip board flags while in an overlay-capable mode", () => {
    const { result } = renderHook(() =>
      useLeviathanInspector({ location: { search: "?debug=1" }, debugEnabled: true, initialInspectorOpen: true }),
    );
    expect(result.current.showLabels).toBe(false);
    act(() => result.current.toggleLabels());
    expect(result.current.showLabels).toBe(true);
    act(() => result.current.toggleBorders());
    expect(result.current.showBorders).toBe(true);
  });

  it("disable resets the board to collapsed with cleared flags", () => {
    const { result } = renderHook(() =>
      useLeviathanInspector({ location: { search: "?debug=1" }, debugEnabled: true, initialInspectorOpen: true }),
    );
    act(() => result.current.toggleLabels());
    act(() => result.current.disable());
    expect(result.current.mode).toBe("collapsed");
    expect(result.current.showLabels).toBe(false);
    expect(result.current.lastTrace).toBeNull();
  });

  it("selectNode records the selected node id on the board while panel is open", () => {
    const { result } = renderHook(() =>
      useLeviathanInspector({ location: { search: "?debug=1" }, debugEnabled: true, initialInspectorOpen: true }),
    );
    act(() => result.current.selectNode("node-42"));
    expect(result.current.board.selectedNodeId).toBe("node-42");
  });
});
