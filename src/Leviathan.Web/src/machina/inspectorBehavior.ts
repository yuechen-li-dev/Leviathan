import {
  getMachinaDebugOverlayBehavior,
  type MachinaDebugOverlayBoard,
  type MachinaDebugOverlayMode,
} from "machinalayout/deus";

export type LeviathanInspectorBehavior = {
  mode: MachinaDebugOverlayMode;
  showDockedPanel: boolean;
  showOverlay: boolean;
  overlayPointerMode: "none" | "auto";
  consumesLayoutSpace: boolean;
  showLabels: boolean;
  showBorders: boolean;
};

export function debugOverlayModeFromLocation(
  location: Pick<Location, "search">,
): MachinaDebugOverlayMode | undefined {
  const value = new URLSearchParams(location.search).get("debugOverlay");
  if (value === "collapsed" || value === "nonInteractiveOverlay" || value === "interactivePanel") {
    return value;
  }

  return undefined;
}

export function resolveInspectorBehavior(input: {
  location: Pick<Location, "search">;
  debugEnabled: boolean;
  inspectorOpen: boolean;
}): LeviathanInspectorBehavior {
  const requestedMode = debugOverlayModeFromLocation(input.location);
  const mode = !input.debugEnabled
    ? "collapsed"
    : requestedMode === "nonInteractiveOverlay"
      ? "nonInteractiveOverlay"
      : input.inspectorOpen
        ? "interactivePanel"
        : "collapsed";

  const board: MachinaDebugOverlayBoard = {
    mode,
    labels: mode === "nonInteractiveOverlay",
    borders: mode === "nonInteractiveOverlay",
  };
  const behavior = getMachinaDebugOverlayBehavior(board);

  return {
    mode,
    showDockedPanel: mode === "interactivePanel",
    showOverlay: mode === "nonInteractiveOverlay" && behavior.visible,
    overlayPointerMode: behavior.pointerEvents,
    consumesLayoutSpace: behavior.consumesLayoutSpace,
    showLabels: board.labels,
    showBorders: board.borders,
  };
}
