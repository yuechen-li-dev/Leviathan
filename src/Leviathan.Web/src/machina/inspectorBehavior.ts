import {
  createMachinaDebugOverlayMachine,
  getMachinaDebugOverlayBehavior,
  type MachinaDebugOverlayBoard,
  type MachinaDebugOverlayEvent,
  type MachinaDebugOverlayMode,
} from "machinalayout/deus";
import { useLayoutEffect, useRef } from "react";
import { useDeusMachine, type UseDeusMachineResult } from "machinalayout/react";

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

/**
 * Board the debug overlay machine boots into. Only consulted once, at mount -
 * after that, mode is real Deus state driven by dispatched events, not
 * re-derived from ambient location/props on every render the way the old
 * `resolveInspectorBehavior` did. In practice this changes nothing observable:
 * nothing in the app mutates `location.search`'s debugOverlay param without a
 * full navigation, which remounts the host anyway.
 */
export function initialDebugOverlayBoard(input: {
  location: Pick<Location, "search">;
  debugEnabled: boolean;
  inspectorOpen: boolean;
}): MachinaDebugOverlayBoard {
  const requestedMode = debugOverlayModeFromLocation(input.location);
  const mode: MachinaDebugOverlayMode = !input.debugEnabled
    ? "collapsed"
    : requestedMode === "nonInteractiveOverlay"
      ? "nonInteractiveOverlay"
      : input.inspectorOpen
        ? "interactivePanel"
        : "collapsed";

  return {
    mode,
    labels: mode === "nonInteractiveOverlay",
    borders: mode === "nonInteractiveOverlay",
  };
}

export function behaviorFromBoard(board: MachinaDebugOverlayBoard): LeviathanInspectorBehavior {
  const behavior = getMachinaDebugOverlayBehavior(board);
  return {
    mode: board.mode,
    showDockedPanel: board.mode === "interactivePanel",
    showOverlay: board.mode === "nonInteractiveOverlay" && behavior.visible,
    overlayPointerMode: behavior.pointerEvents,
    consumesLayoutSpace: behavior.consumesLayoutSpace,
    showLabels: behavior.showLabels,
    showBorders: behavior.showBorders,
  };
}

/** @deprecated kept only so nothing else has to change in the same commit; prefer useLeviathanInspector. */
export function resolveInspectorBehavior(input: {
  location: Pick<Location, "search">;
  debugEnabled: boolean;
  inspectorOpen: boolean;
}): LeviathanInspectorBehavior {
  return behaviorFromBoard(initialDebugOverlayBoard(input));
}

// One machine definition, shared by every mounted host - it's stateless data
// (states/transitions), the board is what's instance-specific.
const debugOverlayMachine = createMachinaDebugOverlayMachine();

export type LeviathanInspectorController = LeviathanInspectorBehavior & {
  board: MachinaDebugOverlayBoard;
  dispatch: (event: MachinaDebugOverlayEvent) => void;
  /** Direct collapsed<->interactivePanel toggle, matching the old button's behavior. */
  togglePanel: () => void;
  toggleLabels: () => void;
  toggleBorders: () => void;
  selectNode: (nodeId: string) => void;
  disable: () => void;
  lastTrace: UseDeusMachineResult<MachinaDebugOverlayBoard, MachinaDebugOverlayEvent>["lastTrace"];
};

/**
 * Real event sequence that walks the machine from its actual initial state
 * (`collapsed`) to the desired boot mode. This exists because
 * `createDeusSnapshot`/`useDeusMachine` always start `snapshot.state` at
 * `machine.initial` - there is no supported way to hand it a board and have
 * it infer the matching graph position. Constructing a board with
 * `mode: "interactivePanel"` up front looks correct on the first paint
 * (`behaviorFromBoard` reads `board.mode` directly) but desyncs the instant
 * something dispatches: `stepDeusMachine` evaluates eligibility against the
 * real graph state, which would still be sitting at `collapsed`, so the next
 * event finds no matching transition and silently no-ops. Replaying real
 * events keeps board data and graph position honest from the first frame.
 */
function bootstrapDebugOverlayEvents(board: MachinaDebugOverlayBoard): MachinaDebugOverlayEvent[] {
  switch (board.mode) {
    case "collapsed":
      return [];
    case "nonInteractiveOverlay": {
      const events: MachinaDebugOverlayEvent[] = [{ type: "showOverlay" }];
      if (board.labels) events.push({ type: "toggleLabels" });
      if (board.borders) events.push({ type: "toggleBorders" });
      return events;
    }
    case "interactivePanel":
      return [{ type: "showOverlay" }, { type: "openPanel" }];
  }
}

/**
 * Real DeusMachina port of the debug overlay - Candidate 0 from the
 * DeusMachina audit. `debugEnabled` is a separate kill switch (whole
 * subsystem on/off), not a machine mode, so it stays a plain boolean owned by
 * the caller.
 */
export function useLeviathanInspector(input: {
  location: Pick<Location, "search">;
  debugEnabled: boolean;
  initialInspectorOpen: boolean;
}): LeviathanInspectorController {
  const targetBootBoard = initialDebugOverlayBoard({
    location: input.location,
    debugEnabled: input.debugEnabled,
    inspectorOpen: input.initialInspectorOpen,
  });

  const deus = useDeusMachine(debugOverlayMachine, { mode: "collapsed", labels: false, borders: false });

  const bootedRef = useRef(false);
  useLayoutEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    for (const event of bootstrapDebugOverlayEvents(targetBootBoard)) {
      deus.dispatch(event);
    }
    // Intentionally boot-once: targetBootBoard is derived from mount-time
    // props, replaying it on every prop change would fight the user's own
    // subsequent toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePanel = () => {
    if (deus.board.mode === "interactivePanel") {
      deus.dispatch({ type: "collapse" });
      return;
    }
    // The machine has no direct collapsed -> interactivePanel edge (by
    // design - "overlay" is a real intermediate state for the URL-driven
    // ambient-inspection case). Two dispatches gets a UI toggle button to the
    // same place; both steps show up in the trace individually.
    if (deus.board.mode === "collapsed") {
      deus.dispatch({ type: "showOverlay" });
    }
    deus.dispatch({ type: "openPanel" });
  };

  const disable = () => {
    deus.reset({ mode: "collapsed", labels: false, borders: false });
    bootedRef.current = true;
  };

  return {
    ...behaviorFromBoard(deus.board),
    board: deus.board,
    dispatch: deus.dispatch,
    togglePanel,
    toggleLabels: () => deus.dispatch({ type: "toggleLabels" }),
    toggleBorders: () => deus.dispatch({ type: "toggleBorders" }),
    selectNode: (nodeId: string) => deus.dispatch({ type: "selectNode", nodeId }),
    disable,
    lastTrace: deus.lastTrace,
  };
}
