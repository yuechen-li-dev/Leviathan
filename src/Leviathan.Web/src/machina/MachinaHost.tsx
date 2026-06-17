import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveLayoutRows, type Rect } from "machinalayout";
import { MachinaReactView } from "machinalayout/react";
import { attachPopstateRouteAdapter, initialRouteFromLocation, mirrorRouteToHistory, replaceUnknownRoute, sessionIdFromPath } from "./browserHistoryAdapter";
import { buildAppsLayout, buildRustSimulatorLayout } from "./layouts";
import type { DispatchFn, LeviathanDispatch, ShellState } from "./types";
import { commandForEvent, runShellCommand } from "./shellCommands";
import { reduceShellState } from "./shellDispatch";
import { createInitialShellState } from "./shellState";
import {
  createDebugSnapshot,
  debugFlagFromLocation,
  DispatchHistoryBuffer,
  inspectLayout,
  inspectPromptMapping,
  setDebugInspectorEnabled,
  summarizeShellState,
} from "./debugInspector";
import { resolveApiBaseUrl } from "./apiConfig";
import { viewRegistry } from "./views";

const viewport = (): Rect => ({
  x: 0,
  y: 0,
  width: Math.max(320, window.innerWidth),
  height: Math.max(480, window.innerHeight),
});

export function MachinaHost() {
  const [state, setState] = useState<ShellState>(() => createInitialShellState(initialRouteFromLocation(window.location)));
  const stateRef = useRef(state);
  const [rootRect, setRootRect] = useState<Rect>(viewport);
  const [debugEnabled, setDebugEnabled] = useState(() => debugFlagFromLocation(window.location, window.localStorage));
  const [inspectorOpen, setInspectorOpen] = useState(() => debugFlagFromLocation(window.location, window.localStorage));
  const historyRef = useRef(new DispatchHistoryBuffer());

  useEffect(() => {
    stateRef.current = state;
    mirrorRouteToHistory(state);
  }, [state]);

  useEffect(() => {
    replaceUnknownRoute();
    const onResize = () => setRootRect(viewport());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const dispatch = useCallback<DispatchFn>((event: LeviathanDispatch) => {
    historyRef.current.record(event);
    setState((current) => {
      const next = reduceShellState(current, event);
      stateRef.current = next;
      return next;
    });
    if (commandForEvent(event)) {
      void runShellCommand(event, () => stateRef.current, dispatch);
    }
  }, []);

  useEffect(() => attachPopstateRouteAdapter(dispatch), [dispatch]);

  useEffect(() => {
    dispatch(
      stateRef.current.route === "rust-simulator"
        ? { type: "open-rust-simulator-app", source: "boot", sessionId: sessionIdFromPath(window.location.pathname) ?? undefined }
        : { type: "open-apps-list", source: "boot" },
    );
  }, [dispatch]);

  const doc = state.route === "rust-simulator" ? buildRustSimulatorLayout(rootRect, state, debugEnabled && inspectorOpen) : buildAppsLayout(rootRect, debugEnabled && inspectorOpen);
  const layout = useMemo(() => resolveLayoutRows(doc.rows, rootRect), [doc.rows, rootRect]);
  const layoutNodes = useMemo(() => inspectLayout(layout), [layout]);
  const recentEvents = historyRef.current.snapshot();
  const apiBaseUrl = resolveApiBaseUrl();
  const snapshot = useMemo(() => createDebugSnapshot(state, layoutNodes, recentEvents, apiBaseUrl), [state, layoutNodes, recentEvents, apiBaseUrl]);
  const debugInspector = {
    enabled: debugEnabled,
    open: inspectorOpen,
    apiBaseUrl,
    shellSummary: summarizeShellState(state),
    fullState: state,
    layoutNodes,
    recentEvents,
    promptMapping: inspectPromptMapping(state),
    snapshot,
    toggleOpen: () => setInspectorOpen((open) => !open),
    disable: () => {
      setDebugInspectorEnabled(window.localStorage, false);
      setDebugEnabled(false);
      setInspectorOpen(false);
    },
  };
  const viewData = { ...doc.viewData, appList: { apps: state.apps, error: state.error, status: state.status }, debugInspector };
  const nodeData = useMemo(() => Object.fromEntries(Object.keys(layout.nodes).map((id) => [id, { dispatch }])), [layout.nodes, dispatch]);

  return (
    <>
      {debugEnabled && (
        <button className="inspector-toggle" onClick={() => setInspectorOpen((open) => !open)}>
          Inspector {inspectorOpen ? "−" : "+"}
        </button>
      )}
      <MachinaReactView
      className="machina-shell"
      layout={layout}
      views={viewRegistry as any}
      viewData={viewData}
      nodeData={nodeData}
      />
    </>
  );
}
