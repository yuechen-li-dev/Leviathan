import { api } from "./api";
import type { AppManifest, AriadneScreenDto } from "./types";
import type { DispatchFn, LeviathanDispatch } from "./shellEvents";
import type { ShellState } from "./shellState";

export type ShellCommandDeps = { request: typeof api };
const defaultDeps: ShellCommandDeps = { request: api };

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const legacyRustSessionKey = "leviathan.rustSimulator.lastSessionId";
const sessionKeyForApp = (appId: string) => `leviathan.${appId}.lastSessionId`;

const rememberSession = (screen: AriadneScreenDto) => window.localStorage.setItem(sessionKeyForApp(screen.appId ?? "rust_simulator"), screen.sessionId);
const forgetSession = (appId: string) => {
  window.localStorage.removeItem(sessionKeyForApp(appId));
  if (appId === "rust_simulator") window.localStorage.removeItem(legacyRustSessionKey);
};

export function commandForEvent(event: LeviathanDispatch): boolean {
  return [
    "open-apps-list",
    "open-app",
    "open-rust-simulator-app",
    "start-ariadne-session",
    "advance-prompt",
    "choose-option",
    "submit-text-input",
  ].includes(event.type);
}

export async function runShellCommand(
  event: LeviathanDispatch,
  getState: () => ShellState,
  dispatch: DispatchFn,
  deps: ShellCommandDeps = defaultDeps,
) {
  try {
    if (event.type === "open-apps-list") {
      const apps = await deps.request<AppManifest[]>("/apps");
      dispatch({ type: "apps-load-succeeded", apps });
      return;
    }
    if (event.type === "open-rust-simulator-app" || event.type === "open-app") {
      const appId = event.type === "open-rust-simulator-app" ? "rust_simulator" : event.appId;
      const sessionId = event.sessionId ?? window.localStorage.getItem(sessionKeyForApp(appId)) ?? (appId === "rust_simulator" ? window.localStorage.getItem(legacyRustSessionKey) : null);
      if (sessionId) {
        const screen = await deps.request<AriadneScreenDto>(`/apps/${encodeURIComponent(appId)}/sessions/${sessionId}/screen`);
        rememberSession(screen);
        dispatch({ type: "open-ariadne-session", screen });
        return;
      }
      dispatch({ type: "start-ariadne-session", appId });
      return;
    }
    if (event.type === "start-ariadne-session") {
      const r = await deps.request<{ sessionId: string; screen: AriadneScreenDto }>(`/apps/${encodeURIComponent(event.appId)}/sessions`, {
        method: "POST",
      });
      rememberSession(r.screen);
      dispatch({ type: "ariadne-session-started", screen: r.screen });
      return;
    }
    const sessionId = getState().screen?.sessionId;
    if (!sessionId) return;
    if (event.type === "advance-prompt") {
      const screen = await deps.request<AriadneScreenDto>(`/apps/${encodeURIComponent(getState().screen?.appId ?? "rust_simulator")}/sessions/${sessionId}/advance`, {
        method: "POST",
        body: JSON.stringify({ promptId: event.promptId, revision: event.revision }),
      });
      rememberSession(screen);
      dispatch({ type: "ariadne-screen-updated", screen });
      return;
    }
    if (event.type === "choose-option") {
      const screen = await deps.request<AriadneScreenDto>(`/apps/${encodeURIComponent(getState().screen?.appId ?? "rust_simulator")}/sessions/${sessionId}/choose`, {
        method: "POST",
        body: JSON.stringify({ promptId: event.promptId, revision: event.revision, choiceKey: event.choiceKey }),
      });
      rememberSession(screen);
      dispatch({ type: "ariadne-screen-updated", screen });
      return;
    }
    if (event.type === "submit-text-input") {
      const screen = await deps.request<AriadneScreenDto>(`/apps/${encodeURIComponent(getState().screen?.appId ?? "rust_simulator")}/sessions/${sessionId}/input`, {
        method: "POST",
        body: JSON.stringify({ promptId: event.promptId, revision: event.revision, text: event.text }),
      });
      rememberSession(screen);
      dispatch({ type: "ariadne-screen-updated", screen, clearTextInput: true });
    }
  } catch (e) {
    if (event.type === "open-rust-simulator-app" || event.type === "open-app") forgetSession(event.type === "open-app" ? event.appId : "rust_simulator");
    dispatch({ type: "api-failed", error: errorText(e) });
  }
}
