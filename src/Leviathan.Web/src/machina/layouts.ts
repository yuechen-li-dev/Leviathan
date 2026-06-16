import type { LayoutRow, Rect } from "machinalayout";
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
};

const root = (rootRect: Rect): LayoutRow => ({
  id: "root",
  frame: { kind: "root" },
  arrange: { kind: "stack", axis: "vertical" },
  debugLabel: `Leviathan shell ${rootRect.width}x${rootRect.height}`,
});

export function buildAppsLayout(rootRect: Rect): {
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
): { rows: LayoutRow[]; viewData: LeviathanViewData } {
  const wide = rootRect.width >= 860;
  const contentHeight = Math.max(360, rootRect.height - 76);
  return {
    rows: [
      root(rootRect),
      {
        id: "nav-bar",
        parent: "root",
        frame: { kind: "fixed", width: rootRect.width, height: 76 },
        view: "navBar",
        debugLabel: "Navigation dispatch bar",
      },
      {
        id: "rust-content",
        parent: "root",
        frame: { kind: "fill", weight: 1, cross: "fill" },
        arrange: {
          kind: "stack",
          axis: wide ? "horizontal" : "vertical",
          gap: 12,
          padding: 16,
        },
        debugLabel: "RustSimulator Machina content",
      },
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
          ? { kind: "fixed", width: 360, height: contentHeight - 32 }
          : { kind: "fixed", width: rootRect.width - 32, height: 292 },
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
          width: wide ? 360 : rootRect.width - 32,
          height: 116,
        },
        view: "debugPanel",
        debugLabel: "Session debug",
      },
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
