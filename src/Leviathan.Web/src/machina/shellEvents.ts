import type { AppManifest, AriadneScreenDto } from "./types";
import type { ShellRoute } from "./shellState";

export type LeviathanDispatch =
  | { type: "open-apps-list"; source?: "user" | "popstate" | "boot" }
  | { type: "open-app"; appId: string; source?: "user" | "popstate" | "boot"; sessionId?: string }
  | { type: "open-rust-simulator-app"; source?: "user" | "popstate" | "boot"; sessionId?: string }
  | { type: "start-ariadne-session"; appId: string }
  | { type: "apps-load-succeeded"; apps: AppManifest[] }
  | { type: "api-failed"; error: string }
  | { type: "ariadne-session-started"; screen: AriadneScreenDto }
  | { type: "ariadne-screen-updated"; screen: AriadneScreenDto; clearTextInput?: boolean }
  | { type: "open-ariadne-session"; screen: AriadneScreenDto }
  | { type: "advance-prompt"; promptId: string; revision: number }
  | {
      type: "choose-option";
      promptId: string;
      revision: number;
      choiceKey: string;
    }
  | { type: "set-text-input"; text: string }
  | {
      type: "submit-text-input";
      promptId: string;
      revision: number;
      text: string;
    };

export type DispatchFn = (event: LeviathanDispatch) => void;
export type RouteEvent = Extract<LeviathanDispatch, { type: "open-apps-list" | "open-app" | "open-rust-simulator-app" }>;

export const eventForRoute = (route: ShellRoute, source: RouteEvent["source"] = "user"): RouteEvent =>
  route === "rust-simulator"
    ? { type: "open-rust-simulator-app", source }
    : route === "scheduling"
      ? { type: "open-app", appId: "scheduling", source }
      : { type: "open-apps-list", source };
