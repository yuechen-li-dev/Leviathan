import type { DispatchFn } from "./shellEvents";
import { eventForRoute } from "./shellEvents";
import type { ShellRoute, ShellState } from "./shellState";

export const routeFromPath = (pathname: string): ShellRoute =>
  pathname.startsWith("/apps/rust-simulator") ? "rust-simulator" : "apps";

export const sessionIdFromPath = (pathname: string): string | null => {
  const match = pathname.match(/^\/apps\/rust-simulator\/sessions\/([^/]+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
};

export const pathForRoute = (route: ShellRoute, sessionId?: string | null): string =>
  route === "rust-simulator"
    ? sessionId
      ? `/apps/rust-simulator/sessions/${encodeURIComponent(sessionId)}`
      : "/apps/rust-simulator"
    : "/apps";

export function initialRouteFromLocation(locationLike: Pick<Location, "pathname">): ShellRoute {
  return routeFromPath(locationLike.pathname);
}

export function mirrorRouteToHistory(
  state: ShellState,
  historyLike: Pick<History, "pushState" | "replaceState"> = window.history,
  locationLike: Pick<Location, "pathname"> = window.location,
) {
  const nextPath = pathForRoute(state.route, state.screen?.sessionId ?? state.requestedSessionId);
  if (locationLike.pathname === nextPath) return;
  historyLike.pushState(null, "", nextPath);
}

export function replaceUnknownRoute(
  historyLike: Pick<History, "replaceState"> = window.history,
  locationLike: Pick<Location, "pathname"> = window.location,
) {
  if (locationLike.pathname !== pathForRoute(routeFromPath(locationLike.pathname))) {
    historyLike.replaceState(null, "", "/apps");
  }
}

export function attachPopstateRouteAdapter(dispatch: DispatchFn, win: Pick<Window, "addEventListener" | "removeEventListener" | "location"> = window) {
  const onPopstate = () => {
    const route = routeFromPath(win.location.pathname);
    dispatch(
      route === "rust-simulator"
        ? { type: "open-rust-simulator-app", source: "popstate", sessionId: sessionIdFromPath(win.location.pathname) ?? undefined }
        : eventForRoute(route, "popstate"),
    );
  };
  win.addEventListener("popstate", onPopstate);
  return () => win.removeEventListener("popstate", onPopstate);
}
