import { api } from "./api";
import type { AppManifest, AriadneScreenDto } from "./types";
import type { DispatchFn, LeviathanDispatch } from "./shellEvents";
import type { ShellState } from "./shellState";

export type ShellCommandDeps = { request: typeof api };
const defaultDeps: ShellCommandDeps = { request: api };

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function commandForEvent(event: LeviathanDispatch): boolean {
  return [
    "open-apps-list",
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
    if (event.type === "open-rust-simulator-app") {
      dispatch({ type: "start-ariadne-session", appId: "rust_simulator" });
      return;
    }
    if (event.type === "start-ariadne-session") {
      const r = await deps.request<{ sessionId: string; screen: AriadneScreenDto }>("/ariadne/sessions", {
        method: "POST",
        body: JSON.stringify({ appId: event.appId }),
      });
      dispatch({ type: "ariadne-session-started", screen: r.screen });
      return;
    }
    const sessionId = getState().screen?.sessionId;
    if (!sessionId) return;
    if (event.type === "advance-prompt") {
      const screen = await deps.request<AriadneScreenDto>(`/ariadne/sessions/${sessionId}/advance`, {
        method: "POST",
        body: JSON.stringify({ promptId: event.promptId, revision: event.revision }),
      });
      dispatch({ type: "ariadne-screen-updated", screen });
      return;
    }
    if (event.type === "choose-option") {
      const screen = await deps.request<AriadneScreenDto>(`/ariadne/sessions/${sessionId}/choose`, {
        method: "POST",
        body: JSON.stringify({ promptId: event.promptId, revision: event.revision, choiceKey: event.choiceKey }),
      });
      dispatch({ type: "ariadne-screen-updated", screen });
      return;
    }
    if (event.type === "submit-text-input") {
      const screen = await deps.request<AriadneScreenDto>(`/ariadne/sessions/${sessionId}/input`, {
        method: "POST",
        body: JSON.stringify({ promptId: event.promptId, revision: event.revision, text: event.text }),
      });
      dispatch({ type: "ariadne-screen-updated", screen, clearTextInput: true });
    }
  } catch (e) {
    dispatch({ type: "api-failed", error: errorText(e) });
  }
}
