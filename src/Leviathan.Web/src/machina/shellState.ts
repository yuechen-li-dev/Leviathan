import type { AppManifest, AriadneScreenDto } from "./types";

export type ShellRoute = "apps" | "rust-simulator" | "scheduling";
export type ShellStatus =
  | "idle"
  | "loading-apps"
  | "starting-session"
  | "submitting"
  | "error";

export type ShellState = {
  route: ShellRoute;
  apps: AppManifest[];
  screen: AriadneScreenDto | null;
  status: ShellStatus;
  error: string | null;
  textInput: string;
  requestedSessionId: string | null;
};

export const createInitialShellState = (route: ShellRoute = "apps"): ShellState => ({
  route,
  apps: [],
  screen: null,
  status: "idle",
  error: null,
  textInput: "",
  requestedSessionId: null,
});
