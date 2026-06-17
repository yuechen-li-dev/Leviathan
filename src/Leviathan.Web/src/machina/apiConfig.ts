const API_BASE_STORAGE_KEY = "leviathan.apiBaseUrl";
const ABSOLUTE_URL_PATTERN = /^https?:\/\//i;

type RuntimeLocation = Pick<Location, "search">;
type RuntimeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function trimToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeBaseUrl(value: string | undefined): string | undefined {
  const trimmed = trimToUndefined(value);
  if (!trimmed) return undefined;
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

export function resolveApiBaseUrl(
  envBaseUrl = trimToUndefined(import.meta.env.VITE_LEVIATHAN_API_BASE_URL),
  location: RuntimeLocation = window.location,
  storage: RuntimeStorage = window.localStorage,
): string {
  const params = new URLSearchParams(location.search);
  const queryBaseUrl = trimToUndefined(params.get("apiBaseUrl") ?? undefined);
  if (queryBaseUrl === "0") {
    storage.removeItem(API_BASE_STORAGE_KEY);
  } else if (queryBaseUrl) {
    storage.setItem(API_BASE_STORAGE_KEY, queryBaseUrl);
  }

  return (
    normalizeBaseUrl(queryBaseUrl === "0" ? undefined : queryBaseUrl) ??
    normalizeBaseUrl(storage.getItem(API_BASE_STORAGE_KEY) ?? undefined) ??
    normalizeBaseUrl(envBaseUrl) ??
    "/api"
  );
}

export function joinApiUrl(path: string, baseUrl = resolveApiBaseUrl()): string {
  if (ABSOLUTE_URL_PATTERN.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl) ?? "/api";
  return normalizedBaseUrl === "/" ? normalizedPath : `${normalizedBaseUrl}${normalizedPath}`;
}

export function setApiBaseUrlOverride(storage: RuntimeStorage, baseUrl?: string): void {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized) {
    storage.setItem(API_BASE_STORAGE_KEY, normalized);
    return;
  }

  storage.removeItem(API_BASE_STORAGE_KEY);
}
