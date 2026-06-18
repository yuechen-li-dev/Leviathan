import type { DeusMachine } from "./types";
import { defineDeusMachine } from "./machine";

export type MachinaDebugOverlayMode = "collapsed" | "nonInteractiveOverlay" | "interactivePanel";
export type MachinaDebugOverlayBoard = {
  mode: MachinaDebugOverlayMode;
  labels: boolean;
  borders: boolean;
  selectedNodeId?: string;
};
export type MachinaDebugOverlayEvent =
  | { type: "showOverlay" }
  | { type: "openPanel"; nodeId?: string }
  | { type: "collapse" }
  | { type: "toggleLabels" }
  | { type: "toggleBorders" }
  | { type: "selectNode"; nodeId: string };
export type MachinaDebugOverlayBehavior = {
  visible: boolean;
  pointerEvents: "none" | "auto";
  consumesLayoutSpace: boolean;
  showPanel: boolean;
  showLabels: boolean;
  showBorders: boolean;
};
const collapsed = ["debugOverlay", "collapsed"] as const;
const overlay = ["debugOverlay", "nonInteractiveOverlay"] as const;
const panel = ["debugOverlay", "interactivePanel"] as const;

export function createMachinaDebugOverlayMachine(): DeusMachine<
  MachinaDebugOverlayBoard,
  MachinaDebugOverlayEvent
> {
  return defineDeusMachine({
    initial: collapsed,
    states: [
      {
        path: collapsed,
        onEnter: (b) => {
          b.mode = "collapsed";
          b.selectedNodeId = undefined;
        },
      },
      {
        path: overlay,
        onEnter: (b) => {
          b.mode = "nonInteractiveOverlay";
        },
      },
      {
        path: panel,
        onEnter: (b) => {
          b.mode = "interactivePanel";
        },
      },
    ],
    transitions: [
      { key: "collapsed.showOverlay", from: collapsed, event: "showOverlay", to: overlay },
      {
        key: "overlay.openPanel",
        from: overlay,
        event: "openPanel",
        to: panel,
        do: (b, e) => {
          if (e.type === "openPanel") b.selectedNodeId = e.nodeId;
        },
      },
      { key: "panel.showOverlay", from: panel, event: "showOverlay", to: overlay },
      { key: "overlay.collapse", from: overlay, event: "collapse", to: collapsed },
      { key: "panel.collapse", from: panel, event: "collapse", to: collapsed },
      {
        key: "overlay.toggleLabels",
        from: overlay,
        event: "toggleLabels",
        do: (b) => {
          b.labels = !b.labels;
        },
      },
      {
        key: "panel.toggleLabels",
        from: panel,
        event: "toggleLabels",
        do: (b) => {
          b.labels = !b.labels;
        },
      },
      {
        key: "overlay.toggleBorders",
        from: overlay,
        event: "toggleBorders",
        do: (b) => {
          b.borders = !b.borders;
        },
      },
      {
        key: "panel.toggleBorders",
        from: panel,
        event: "toggleBorders",
        do: (b) => {
          b.borders = !b.borders;
        },
      },
      {
        key: "panel.selectNode",
        from: panel,
        event: "selectNode",
        do: (b, e) => {
          if (e.type === "selectNode") b.selectedNodeId = e.nodeId;
        },
      },
    ],
  });
}

export function getMachinaDebugOverlayBehavior(
  board: MachinaDebugOverlayBoard,
): MachinaDebugOverlayBehavior {
  if (board.mode === "collapsed")
    return {
      visible: false,
      pointerEvents: "none",
      consumesLayoutSpace: false,
      showPanel: false,
      showLabels: false,
      showBorders: false,
    };
  if (board.mode === "nonInteractiveOverlay")
    return {
      visible: true,
      pointerEvents: "none",
      consumesLayoutSpace: false,
      showPanel: false,
      showLabels: board.labels,
      showBorders: board.borders,
    };
  return {
    visible: true,
    pointerEvents: "auto",
    consumesLayoutSpace: true,
    showPanel: true,
    showLabels: board.labels,
    showBorders: board.borders,
  };
}
