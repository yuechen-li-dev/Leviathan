import type { LayoutRow } from "../../../src/index";

export type ControlRoomState = {
  sidebarLeft: number;
  toolbarGap: number;
  floatingZ: number;
};

const SIDEBAR_WIDTH = 240;

export function buildDemoRows(state: ControlRoomState): LayoutRow[] {
  const mainLeft = state.sidebarLeft + SIDEBAR_WIDTH + 16;

  return [
    { id: "root", frame: { kind: "root" }, view: "RootShell" },
    {
      id: "header",
      parent: "root",
      z: 1,
      frame: { kind: "anchor", left: 16, right: 16, top: 16, height: 56 },
      view: "Header",
    },
    {
      id: "sidebar",
      parent: "root",
      frame: { kind: "anchor", left: state.sidebarLeft, top: 88, bottom: 16, width: SIDEBAR_WIDTH },
      view: "Sidebar",
    },
    {
      id: "main",
      parent: "root",
      frame: { kind: "anchor", left: mainLeft, top: 88, right: 16, bottom: 16 },
      view: "MainShell",
    },
    {
      id: "toolbar",
      parent: "main",
      z: 1,
      frame: { kind: "anchor", left: 16, right: 16, top: 16, height: 48 },
      arrange: {
        kind: "stack",
        axis: "horizontal",
        gap: state.toolbarGap,
        padding: 8,
        align: "center",
        justify: "start",
      },
      view: "ToolbarShell",
    },
    {
      id: "tool-run",
      parent: "toolbar",
      frame: { kind: "fixed", width: 90, height: 32 },
      view: "RunButton",
    },
    {
      id: "tool-inspect",
      parent: "toolbar",
      frame: { kind: "fixed", width: 110, height: 32 },
      view: "InspectButton",
    },
    {
      id: "toolbar-fill",
      parent: "toolbar",
      frame: { kind: "fill", weight: 1, cross: 32 },
      view: "ToolbarStatus",
    },
    {
      id: "tool-reset",
      parent: "toolbar",
      frame: { kind: "fixed", width: 90, height: 32 },
      view: "ResetButton",
    },
    {
      id: "preview",
      parent: "main",
      frame: {
        kind: "anchor",
        left: { unit: "px", value: 16 },
        top: 80,
        right: { unit: "ui", value: 0.35 },
        bottom: 16,
      },
      view: "Preview",
    },
    {
      id: "inspector",
      parent: "main",
      z: 1,
      frame: { kind: "anchor", right: 16, top: 80, bottom: 16, width: 280 },
      view: "Inspector",
    },
    {
      id: "floating-action",
      parent: "main",
      z: state.floatingZ,
      frame: { kind: "anchor", right: 304, bottom: 32, width: 160, height: 64 },
      offset: { x: -8, y: -4 },
      view: "FloatingAction",
    },
    {
      id: "debug-badge",
      parent: "main",
      z: 4,
      frame: { kind: "anchor", right: 260, top: 68, width: 140, height: 36 },
      slot: "DebugBadge",
    },
  ];
}
