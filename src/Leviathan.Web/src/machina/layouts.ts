import {
  getArrangeContentRect,
  getRemainingStackRect,
  getStackContentRect,
  getStackMainAxisMetrics,
  resolveLayoutRows,
  type LayoutRow,
  type Rect,
} from "machinalayout";
import type { AriadneScreenDto, AppManifest, ShellState } from "./types";

export type LeviathanViewData = {
  appsHeader?: { title: string; subtitle: string };
  appList?: {
    apps: AppManifest[];
    error: string | null;
    status: ShellState["status"];
  };
  navBar?: { route: ShellState["route"]; status: ShellState["status"] };
  transcript?: { screen: AriadneScreenDto | null };
  prompt?: {
    screen: AriadneScreenDto | null;
    textInput: string;
    error: string | null;
    status: ShellState["status"];
  };
  debugPanel?: {
    screen: AriadneScreenDto | null;
    status: ShellState["status"];
  };
  debugInspector?: unknown;
};

const root = (rootRect: Rect): LayoutRow => ({
  id: "root",
  frame: { kind: "root" },
  arrange: { kind: "stack", axis: "vertical" },
  debugLabel: `Leviathan shell ${rootRect.width}x${rootRect.height}`,
});

const rustContentGap = 12;
const rustContentPadding = 16;

function buildRustShellRows(rootRect: Rect, navHeight: number, inspectorHeight: number, wide: boolean): LayoutRow[] {
  return [
    root(rootRect),
    {
      id: "nav-bar",
      parent: "root",
      frame: { kind: "fixed", width: rootRect.width, height: navHeight },
      debugLabel: "Navigation dispatch bar",
    },
    {
      id: "rust-content",
      parent: "root",
      frame: { kind: "fill", weight: 1, cross: "fill" },
      arrange: {
        kind: "stack",
        axis: wide ? "horizontal" : "vertical",
        gap: rustContentGap,
        padding: rustContentPadding,
      },
      debugLabel: "RustSimulator Machina content",
    },
    ...(inspectorHeight > 0
      ? [
          {
            id: "debug-inspector",
            parent: "root",
            frame: { kind: "fixed" as const, width: rootRect.width, height: inspectorHeight },
            debugLabel: "Rust shell debug inspector region",
          },
        ]
      : []),
  ];
}

export function buildAppsLayout(rootRect: Rect, inspectorEnabled = false): {
  rows: LayoutRow[];
  viewData: LeviathanViewData;
} {
  return {
    rows: [
      root(rootRect),
      {
        id: "apps-header",
        parent: "root",
        frame: { kind: "fixed", width: rootRect.width, height: 148 },
        view: "appsHeader",
        debugLabel: "Apps header",
      },
      {
        id: "apps-list",
        parent: "root",
        frame: { kind: "fill", weight: 1, cross: "fill" },
        view: "appList",
        debugLabel: "Apps list",
      },
      ...(inspectorEnabled
        ? [
            {
              id: "debug-inspector",
              parent: "root",
              frame: { kind: "fixed" as const, width: rootRect.width, height: Math.min(300, Math.max(220, rootRect.height * 0.34)) },
              view: "debugInspector",
              debugLabel: "M2 debug layout/state inspector",
            },
          ]
        : []),
    ],
    viewData: {
      appsHeader: {
        title: "Leviathan Apps",
        subtitle: "Machina owns shell layout, navigation, and slot dispatch.",
      },
    },
  };
}

export function buildRustSimulatorLayout(
  rootRect: Rect,
  state: ShellState,
  inspectorEnabled = false,
): { rows: LayoutRow[]; viewData: LeviathanViewData } {
  const wide = rootRect.width >= 860;
  const navHeight = rootRect.width >= 640 ? 76 : 96;
  const inspectorHeight = inspectorEnabled ? Math.min(320, Math.max(230, rootRect.height * 0.36)) : 0;
  const shellRows = buildRustShellRows(rootRect, navHeight, inspectorHeight, wide);
  const shellLayout = resolveLayoutRows(shellRows, rootRect);
  const rootMetrics = getStackMainAxisMetrics(shellLayout, "root");
  const contentRect = getRemainingStackRect(shellLayout, {
    parentId: "root",
    afterChildren: ["nav-bar"],
    beforeChildren: inspectorHeight > 0 ? ["debug-inspector"] : undefined,
  });
  const contentStackRect = getStackContentRect(shellLayout, "rust-content");
  const contentAreaRect = getArrangeContentRect(contentRect, {
    kind: "stack",
    axis: wide ? "horizontal" : "vertical",
    gap: rustContentGap,
    padding: rustContentPadding,
  });
  const contentHeight = rootMetrics.childMetrics.find((child) => child.id === "rust-content")?.mainSize ?? contentRect.height;
  const contentChromeHeight = contentRect.height - contentStackRect.height;
  const narrowPanelHeight = Math.min(360, Math.max(300, Math.round(rootRect.height * 0.42)));
  const sidePanelWidth = Math.max(288, contentAreaRect.width);
  return {
    rows: [
      shellRows[0],
      { ...shellRows[1], view: "navBar" },
      shellRows[2],
      {
        id: "transcript",
        parent: "rust-content",
        frame: { kind: "fill", weight: wide ? 2 : 1, cross: "fill" },
        view: "transcript",
        debugLabel: "Transcript prose",
      },
      {
        id: "side-panel",
        parent: "rust-content",
        frame: wide
          ? { kind: "fixed", width: 360, height: Math.max(300, contentHeight - contentChromeHeight) }
          : { kind: "fixed", width: sidePanelWidth, height: narrowPanelHeight },
        arrange: { kind: "stack", axis: "vertical", gap: 12 },
        debugLabel: "Prompt and debug",
      },
      {
        id: "prompt",
        parent: "side-panel",
        frame: { kind: "fill", weight: 1, cross: "fill" },
        view: "prompt",
        debugLabel: "Typed Ariadne prompt controls",
      },
      {
        id: "debug",
        parent: "side-panel",
        frame: {
          kind: "fixed",
          width: wide ? 360 : sidePanelWidth,
          height: wide ? 116 : 104,
        },
        view: "debugPanel",
        debugLabel: "Session debug",
      },
      ...(inspectorEnabled
        ? [
            {
              id: "debug-inspector",
              parent: "root",
              frame: { kind: "fixed" as const, width: rootRect.width, height: inspectorHeight },
              view: "debugInspector",
              debugLabel: "M2 debug layout/state inspector",
            },
          ]
        : []),
    ],
    viewData: {
      navBar: { route: state.route, status: state.status },
      transcript: { screen: state.screen },
      prompt: {
        screen: state.screen,
        textInput: state.textInput,
        error: state.error,
        status: state.status,
      },
      debugPanel: { screen: state.screen, status: state.status },
    },
  };
}
