// Live-mode routing, local-dev admin gate, and browser-localStorage-backed
// smoke-context helpers for the scheduling app. Extracted from views.tsx
// (M0 foundation work, same pass as the setup wizard rewrite) - needed as
// its own module specifically to avoid a circular import: the new
// `setup/` directory needs isFixtureMode/loadLiveContext/etc, and if those
// stayed in views.tsx while views.tsx also imports the new setup views,
// that's a cycle between two modules with top-level `const` initialization,
// which is exactly the kind of thing that silently breaks at runtime
// depending on import order. This was already flagged as the right boundary
// in the earlier scheduling-app restructuring audit; extracting it now.
// Zero behavior change - moved verbatim.

export type LiveSchedulingContext = {
  providerId?: string;
  providerSlug?: string;
  providerName?: string;
  providerTimeZone?: string;
  resourceId?: string;
  serviceId?: string;
  bookingId?: string;
};

const liveSchedulingStorageKey = "leviathan.scheduling.liveContext";
export const defaultProviderSlug = "m24-smoke-provider";
export const defaultCustomer = {
  name: "M24 Smoke Customer",
  email: "m24-smoke@example.test",
  phone: "555-0100",
  notes: "Created by the Leviathan M24 real-backend smoke.",
};

export const fixtureCustomer = {
  name: "",
  email: "",
  phone: "",
  notes: "",
};

export const livePaymentPolicy = {
  requiresDeposit: false,
  requiresPrepay: true,
  depositAmount: null,
  prepayAmount: { minorUnits: 2500, currency: "USD" },
  currency: "USD",
  paymentTiming: "before_confirmation",
  paymentProviderMode: "fake/local",
  cancellationPaymentPolicy: "no_refund_policy_yet",
  reschedulePaymentPolicy: "carry_payment_forward_deferred",
} as const;

export const liveNotificationPolicy = {
  enabled: true,
  rules: [
    {
      trigger: "booking_confirmed",
      channel: "app",
      recipientType: "manual_test",
      templateKey: "booking-confirmed-local",
      offsetMinutesBeforeStart: null,
    },
  ],
};

export const localDevAdminWarning =
  "Local/dev admin mode. Provider setup endpoints are intentionally unsafe and require `LEVIATHAN_ALLOW_UNSAFE_ADMIN=true`. Do not expose this server publicly.";
export const adminGateMessage =
  "Provider setup is blocked because unsafe local/dev admin mode is disabled. Restart the backend with LEVIATHAN_ALLOW_UNSAFE_ADMIN=true for local demos only.";
export const isUnsafeAdminError = (message?: string) =>
  !!message &&
  (message.includes("unsafe_admin_disabled") ||
    message.includes("LEVIATHAN_ALLOW_UNSAFE_ADMIN") ||
    message.includes("X-Leviathan-Unsafe-Admin"));
export const isOwnershipError = (message?: string) =>
  !!message && (message.includes("provider_owner_forbidden") || message.includes("not owned") || message.includes("owner_forbidden"));

export function isFixtureMode() {
  if (typeof window === "undefined") return true;
  return new URLSearchParams(window.location.search).has("fixture");
}

export function pathname() {
  return typeof window === "undefined" ? "/apps/scheduling" : window.location.pathname;
}

export function bookingIdFromPath() {
  const match = pathname().match(/\/confirmed\/([^/?#]+)/);
  return match?.[1];
}

export function providerSlugFromPath() {
  const match = pathname().match(/^\/book\/([^/?#]+)/);
  return match?.[1];
}

export function currentQueryString() {
  return typeof window === "undefined" ? "" : window.location.search;
}

export function queryValue(name: string) {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get(name) ?? undefined;
}

export function linkWithCurrentQuery(path: string) {
  if (typeof window === "undefined") return path;
  const url = new URL(path, window.location.origin);
  const current = new URLSearchParams(window.location.search);
  current.forEach((value, key) => {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  });
  return `${url.pathname}${url.search}`;
}

export function loadLiveContext(): LiveSchedulingContext {
  if (typeof window === "undefined") return {};
  try {
    const stored = window.localStorage.getItem(liveSchedulingStorageKey);
    if (!stored) return {};
    return JSON.parse(stored) as LiveSchedulingContext;
  } catch {
    return {};
  }
}

export function saveLiveContext(next: LiveSchedulingContext) {
  if (typeof window === "undefined") return;
  const merged = { ...loadLiveContext(), ...next };
  window.localStorage.setItem(liveSchedulingStorageKey, JSON.stringify(merged));
}

export function liveRouteLabel() {
  if (pathname().startsWith("/apps/scheduling/setup")) return "Real backend provider setup";
  if (pathname().startsWith("/apps/scheduling/bookings")) return "Real backend provider bookings";
  if (pathname().includes("/confirmed/")) return "Real backend booking confirmation";
  if (pathname().startsWith("/book/")) return "Real backend public booking";
  return "Real backend scheduling smoke";
}

export function liveRouteTitle() {
  if (pathname().startsWith("/apps/scheduling/setup")) return "Provider setup";
  if (pathname().startsWith("/apps/scheduling/bookings")) return "Provider bookings";
  if (pathname().includes("/confirmed/")) return "Booking confirmed";
  if (pathname().startsWith("/book/")) return "Public booking";
  return "Scheduling";
}

export function controlledSchedulingError(message: string) {
  return isUnsafeAdminError(message)
    ? adminGateMessage
    : isOwnershipError(message)
      ? "This provider is not owned by the current local-dev Scheduling installation."
      : message.includes("payment_required")
        ? "Payment is required before confirmation in this local demo state."
        : message;
}
