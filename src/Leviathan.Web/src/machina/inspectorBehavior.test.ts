import { describe, expect, it } from "vitest";
import { debugOverlayModeFromLocation, resolveInspectorBehavior } from "./inspectorBehavior";

describe("inspector behavior", () => {
  it("stays collapsed for normal routes without debug enabled", () => {
    expect(
      resolveInspectorBehavior({
        location: { search: "" } as Location,
        debugEnabled: false,
        inspectorOpen: false,
      }),
    ).toEqual({
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
    expect(
      resolveInspectorBehavior({
        location: { search: "?debug=1" } as Location,
        debugEnabled: true,
        inspectorOpen: true,
      }),
    ).toMatchObject({
      mode: "interactivePanel",
      showDockedPanel: true,
      showOverlay: false,
      overlayPointerMode: "auto",
      consumesLayoutSpace: true,
    });
  });

  it("switches snapshot overlay routes to a non-interactive Machina overlay", () => {
    expect(
      resolveInspectorBehavior({
        location: { search: "?debug=1&debugOverlay=nonInteractiveOverlay" } as Location,
        debugEnabled: true,
        inspectorOpen: true,
      }),
    ).toEqual({
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
    expect(
      resolveInspectorBehavior({
        location: { search: "?debug=1" } as Location,
        debugEnabled: true,
        inspectorOpen: false,
      }),
    ).toMatchObject({
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
