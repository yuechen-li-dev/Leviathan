import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveLayoutRows, type Rect } from "machinalayout";
import { MachinaReactView } from "machinalayout/react";
import { api } from "./api";
import { buildAppsLayout, buildRustSimulatorLayout } from "./layouts";
import type {
  AppManifest,
  AriadneScreenDto,
  DispatchFn,
  LeviathanDispatch,
  ShellState,
} from "./types";
import { viewRegistry } from "./views";

const initialRoute = (): ShellState["route"] =>
  location.pathname.startsWith("/apps/rust-simulator")
    ? "rust-simulator"
    : "apps";
const initialState = (): ShellState => ({
  route: initialRoute(),
  apps: [],
  screen: null,
  status: "idle",
  error: null,
  textInput: "",
});
const viewport = (): Rect => ({
  x: 0,
  y: 0,
  width: Math.max(320, window.innerWidth),
  height: Math.max(480, window.innerHeight),
});

export function MachinaHost() {
  const [state, setState] = useState<ShellState>(initialState);
  const [rootRect, setRootRect] = useState<Rect>(viewport);

  useEffect(() => {
    const onResize = () => setRootRect(viewport());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const dispatch = useCallback<DispatchFn>((event) => {
    void handleDispatch(event, setState);
  }, []);

  useEffect(() => {
    dispatch(
      state.route === "rust-simulator"
        ? { type: "start-ariadne-session", appId: "rust_simulator" }
        : { type: "open-apps-list" },
    );
    // initial boot only; subsequent navigation flows through dispatch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doc =
    state.route === "rust-simulator"
      ? buildRustSimulatorLayout(rootRect, state)
      : buildAppsLayout(rootRect);
  const viewData = {
    ...doc.viewData,
    appList: { apps: state.apps, error: state.error, status: state.status },
  };
  const layout = useMemo(
    () => resolveLayoutRows(doc.rows, rootRect),
    [doc.rows, rootRect],
  );
  const nodeData = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(layout.nodes).map((id) => [id, { dispatch }]),
      ),
    [layout.nodes, dispatch],
  );

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

async function handleDispatch(
  event: LeviathanDispatch,
  setState: React.Dispatch<React.SetStateAction<ShellState>>,
) {
  if (event.type === "set-text-input")
    return setState((s) => ({ ...s, textInput: event.text }));
  if (event.type === "open-apps-list") {
    history.pushState(null, "", "/apps");
    setState((s) => ({
      ...s,
      route: "apps",
      status: "loading-apps",
      error: null,
    }));
    try {
      const apps = await api<AppManifest[]>("/api/apps");
      setState((s) => ({ ...s, apps, status: "idle" }));
    } catch (e) {
      setState((s) => ({ ...s, status: "error", error: String(e) }));
    }
    return;
  }
  if (event.type === "open-rust-simulator-app") {
    history.pushState(null, "", "/apps/rust-simulator");
    setState((s) => ({
      ...s,
      route: "rust-simulator",
      screen: null,
      status: "starting-session",
      error: null,
    }));
    return handleDispatch(
      { type: "start-ariadne-session", appId: "rust_simulator" },
      setState,
    );
  }
  if (event.type === "start-ariadne-session") {
    setState((s) => ({
      ...s,
      route: "rust-simulator",
      status: "starting-session",
      error: null,
    }));
    try {
      const r = await api<{ sessionId: string; screen: AriadneScreenDto }>(
        "/api/ariadne/sessions",
        { method: "POST", body: JSON.stringify({ appId: event.appId }) },
      );
      setState((s) => ({ ...s, screen: r.screen, status: "idle" }));
    } catch (e) {
      setState((s) => ({ ...s, status: "error", error: String(e) }));
    }
    return;
  }
  const post = async (path: string, body: object) => {
    let sessionId: string | null = null;
    setState((s) => {
      sessionId = s.screen?.sessionId ?? null;
      return { ...s, status: "submitting", error: null };
    });
    if (!sessionId) return;
    try {
      const screen = await api<AriadneScreenDto>(
        `/api/ariadne/sessions/${sessionId}/${path}`,
        { method: "POST", body: JSON.stringify(body) },
      );
      setState((s) => ({
        ...s,
        screen,
        status: "idle",
        textInput: path === "input" ? "" : s.textInput,
      }));
    } catch (e) {
      setState((s) => ({ ...s, status: "error", error: String(e) }));
    }
  };
  if (event.type === "advance-prompt")
    return post("advance", {
      promptId: event.promptId,
      revision: event.revision,
    });
  if (event.type === "choose-option")
    return post("choose", {
      promptId: event.promptId,
      revision: event.revision,
      choiceKey: event.choiceKey,
    });
  if (event.type === "submit-text-input")
    return post("input", {
      promptId: event.promptId,
      revision: event.revision,
      text: event.text,
    });
  if (event.type === "open-ariadne-session")
    return setState((s) => ({ ...s, screen: event.screen, status: "idle" }));
}
