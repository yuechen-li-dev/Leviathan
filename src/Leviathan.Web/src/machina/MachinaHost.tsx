import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveLayoutRows, type Rect } from "machinalayout";
import { MachinaReactView } from "machinalayout/react";
import { attachPopstateRouteAdapter, initialRouteFromLocation, mirrorRouteToHistory, replaceUnknownRoute } from "./browserHistoryAdapter";
import { buildAppsLayout, buildRustSimulatorLayout } from "./layouts";
import type { DispatchFn, LeviathanDispatch, ShellState } from "./types";
import { commandForEvent, runShellCommand } from "./shellCommands";
import { reduceShellState } from "./shellDispatch";
import { createInitialShellState } from "./shellState";
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
        ? { type: "open-rust-simulator-app", source: "boot" }
        : { type: "open-apps-list", source: "boot" },
    );
  }, [dispatch]);

  const doc = state.route === "rust-simulator" ? buildRustSimulatorLayout(rootRect, state) : buildAppsLayout(rootRect);
  const viewData = { ...doc.viewData, appList: { apps: state.apps, error: state.error, status: state.status } };
  const layout = useMemo(() => resolveLayoutRows(doc.rows, rootRect), [doc.rows, rootRect]);
  const nodeData = useMemo(() => Object.fromEntries(Object.keys(layout.nodes).map((id) => [id, { dispatch }])), [layout.nodes, dispatch]);

  return (
    <MachinaReactView
      className="machina-shell"
      layout={layout}
      views={viewRegistry as any}
      viewData={viewData}
      nodeData={nodeData}
    />
  );
}
