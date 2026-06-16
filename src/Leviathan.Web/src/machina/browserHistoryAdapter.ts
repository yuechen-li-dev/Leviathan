import type { DispatchFn } from "./shellEvents";
import { eventForRoute } from "./shellEvents";
import type { ShellRoute, ShellState } from "./shellState";

export const routeFromPath = (pathname: string): ShellRoute =>
  pathname.startsWith("/apps/rust-simulator") ? "rust-simulator" : "apps";

export const pathForRoute = (route: ShellRoute): string =>
  route === "rust-simulator" ? "/apps/rust-simulator" : "/apps";

export function initialRouteFromLocation(locationLike: Pick<Location, "pathname">): ShellRoute {
  return routeFromPath(locationLike.pathname);
}

export function mirrorRouteToHistory(
  state: ShellState,
  historyLike: Pick<History, "pushState" | "replaceState"> = window.history,
  locationLike: Pick<Location, "pathname"> = window.location,
) {
  const nextPath = pathForRoute(state.route);
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
  const onPopstate = () => dispatch(eventForRoute(routeFromPath(win.location.pathname), "popstate"));
  win.addEventListener("popstate", onPopstate);
  return () => win.removeEventListener("popstate", onPopstate);
}
