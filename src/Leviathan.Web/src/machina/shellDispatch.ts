import { defineDispatchTables, dispatchEvent } from "machinalayout/dispatch";
import type { LeviathanDispatch } from "./shellEvents";
import type { ShellState } from "./shellState";

const routeTables = defineDispatchTables<ShellState>({
  set: {
    events: ["route.apps", "route.rust-simulator"],
    fields: ["route", "route"],
    values: ["apps", "rust-simulator"],
  },
});

const statusTables = defineDispatchTables<ShellState>({
  set: {
    events: ["status.idle", "status.loading-apps", "status.starting-session", "status.submitting", "status.error"],
    fields: ["status", "status", "status", "status", "status"],
    values: ["idle", "loading-apps", "starting-session", "submitting", "error"],
  },
});

const clearErrorTables = defineDispatchTables<ShellState>({
  set: { events: ["error.clear"], fields: ["error"], values: [null] },
});

const withTableEvent = (state: ShellState, event: string): ShellState =>
  dispatchEvent(dispatchEvent(dispatchEvent(state, event, routeTables), event, statusTables), event, clearErrorTables);

export function reduceShellState(state: ShellState, event: LeviathanDispatch): ShellState {
  switch (event.type) {
    case "open-apps-list":
      return { ...withTableEvent(withTableEvent(state, "route.apps"), "status.loading-apps"), error: null };
    case "open-rust-simulator-app":
      return {
        ...withTableEvent(withTableEvent(state, "route.rust-simulator"), "status.starting-session"),
        screen: null,
        error: null,
      };
    case "start-ariadne-session":
      return { ...withTableEvent(state, "status.starting-session"), route: "rust-simulator", error: null };
    case "apps-load-succeeded":
      return { ...withTableEvent(state, "status.idle"), apps: event.apps, error: null };
    case "api-failed":
      return { ...withTableEvent(state, "status.error"), error: event.error };
    case "ariadne-session-started":
    case "open-ariadne-session":
      return { ...withTableEvent(state, "status.idle"), screen: event.screen, error: null };
    case "ariadne-screen-updated":
      return {
        ...withTableEvent(state, "status.idle"),
        screen: event.screen,
        error: null,
        textInput: event.clearTextInput ? "" : state.textInput,
      };
    case "advance-prompt":
    case "choose-option":
    case "submit-text-input":
      return { ...withTableEvent(state, "status.submitting"), error: null };
    case "set-text-input":
      return { ...state, textInput: event.text };
  }
}
