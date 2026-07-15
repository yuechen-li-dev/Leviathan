import {
  createViewportMatrix,
  defineMachinaScreens,
  defineMachinaViewports,
  expandScreenViewportTasks,
  type MachinaScreen,
  type MachinaScreenCatalog,
  type MachinaScreenViewportTask,
  type MachinaViewportMatrix,
} from "machinalayout";

export type LeviathanViewportKey = "desktop" | "tablet" | "phone";
export type LeviathanDebugOverlayMode = "nonInteractiveOverlay";
export type LeviathanScreenKey =
  | "apps-route"
  | "scheduling-landing"
  | "provider-setup"
  | "public-booking"
  | "booking-confirmation"
  | "cancelled-rescheduled"
  | "payment-required"
  | "notification-summary"
  | "reschedule-available"
  | "reschedule-picker"
  | "reschedule-result"
  | "rescheduled-booking-detail";

export type LeviathanScreenMetadata = {
  productArea: "apps" | "scheduling";
  captureSource: "route-only" | "fixture" | "fixture-or-live";
  supportsLiveRoute: boolean;
  artifactBaseName: string;
  expectedHeading: string;
  expectedHeadingByViewport?: Partial<Record<LeviathanViewportKey, string>>;
  expectedNodeIds: string[];
  expectedNodeIdsByViewport?: Partial<Record<LeviathanViewportKey, string[]>>;
  expectedText: string;
  expectedMachinaRoute: "apps" | "scheduling";
  debugOverlayByViewport?: Partial<Record<LeviathanViewportKey, LeviathanDebugOverlayMode>>;
};

const standardResponsiveViewports = createViewportMatrix("standard-responsive");
const viewportTemplateByKey = Object.fromEntries(
  standardResponsiveViewports.map((viewport) => [viewport.key, viewport] as const),
);

export const leviathanViewports: MachinaViewportMatrix = defineMachinaViewports([
  { ...viewportTemplateByKey.desktop, width: 1440, height: 1024 },
  { ...viewportTemplateByKey.tablet, width: 768, height: 1024 },
  { ...viewportTemplateByKey.phone, width: 390, height: 844 },
]);

const screens: readonly MachinaScreen[] = [
  {
    key: "apps-route",
    title: "Apps route",
    route: "/apps?debug=1",
    viewports: ["desktop", "tablet", "phone"],
    tags: ["apps", "catalog", "mocked"],
    metadata: {
      productArea: "apps",
      captureSource: "route-only",
      supportsLiveRoute: false,
      artifactBaseName: "apps-route",
      expectedHeading: "Available apps",
      expectedNodeIds: ["apps-list", "debug-inspector"],
      expectedText: "Scheduling",
      expectedMachinaRoute: "apps",
      debugOverlayByViewport: {
        desktop: "nonInteractiveOverlay",
      },
    } satisfies LeviathanScreenMetadata,
  },
  {
    key: "scheduling-landing",
    title: "Scheduling landing",
    route: "/apps/scheduling?debug=1&fixture=landing",
    fixture: "landing",
    viewports: ["desktop", "tablet", "phone"],
    tags: ["scheduling", "fixture", "mocked", "landing"],
    metadata: {
      productArea: "scheduling",
      captureSource: "fixture",
      supportsLiveRoute: false,
      artifactBaseName: "scheduling-landing",
      expectedHeading: "Scheduling",
      expectedNodeIds: ["scheduling-hero", "scheduling-main", "scheduling-sidebar", "debug-inspector"],
      expectedText: "Action cards",
      expectedMachinaRoute: "scheduling",
    } satisfies LeviathanScreenMetadata,
  },
  {
    key: "provider-setup",
    title: "Provider setup",
    route: "/apps/scheduling/setup?debug=1&fixture=provider-setup",
    fixture: "provider-setup",
    viewports: ["desktop", "phone"],
    tags: ["scheduling", "fixture", "mocked", "setup"],
    metadata: {
      productArea: "scheduling",
      captureSource: "fixture-or-live",
      supportsLiveRoute: true,
      artifactBaseName: "provider-setup",
      expectedHeading: "Provider setup",
      expectedNodeIds: [
        "scheduling-hero",
        "scheduling-main",
        "provider-setup-root",
        "scheduling-sidebar",
        "debug-inspector",
      ],
      expectedText: "Set up bookable availability",
      expectedMachinaRoute: "scheduling",
      debugOverlayByViewport: {
        phone: "nonInteractiveOverlay",
      },
    } satisfies LeviathanScreenMetadata,
  },
  {
    key: "public-booking",
    title: "Public booking",
    route: "/book/demo-provider?debug=1&fixture=public-booking",
    fixture: "public-booking",
    viewports: ["desktop", "tablet", "phone"],
    tags: ["scheduling", "fixture", "mocked", "booking"],
    metadata: {
      productArea: "scheduling",
      captureSource: "fixture-or-live",
      supportsLiveRoute: true,
      artifactBaseName: "public-booking",
      expectedHeading: "Choose a date and time",
      expectedHeadingByViewport: {
        phone: "Choose a date",
      },
      expectedNodeIds: [
        "booking-header",
        "booking-root-horizontal",
        "booking-summary-panel",
        "booking-main-panel",
        "booking-main-header",
        "booking-calendar-region",
        "booking-slots-region",
        "booking-footer-summary",
        "debug-inspector",
      ],
      expectedNodeIdsByViewport: {
        phone: [
          "booking-header-mobile",
          "booking-root-vertical",
          "booking-mobile-summary-card",
          "booking-mobile-step-status",
          "booking-mobile-calendar-card",
          "booking-mobile-slots-card",
          "booking-mobile-intake-card",
          "booking-mobile-confirm-footer",
          "debug-inspector",
        ],
      },
      expectedText: "30 min Intro Call",
      expectedMachinaRoute: "scheduling",
      debugOverlayByViewport: {
        phone: "nonInteractiveOverlay",
      },
    } satisfies LeviathanScreenMetadata,
  },
  {
    key: "booking-confirmation",
    title: "Booking confirmation",
    route: "/book/demo-provider/confirmed/book_demo_confirmed?debug=1&fixture=booking-confirmation",
    fixture: "booking-confirmation",
    viewports: ["desktop", "tablet", "phone"],
    tags: ["scheduling", "fixture", "mocked", "confirmation"],
    metadata: {
      productArea: "scheduling",
      captureSource: "fixture-or-live",
      supportsLiveRoute: true,
      artifactBaseName: "booking-confirmation",
      expectedHeading: "Booking confirmed",
      expectedNodeIds: [
        "scheduling-hero",
        "scheduling-main",
        "booking-status-root",
        "scheduling-sidebar",
        "debug-inspector",
      ],
      expectedText: "What happens next",
      expectedMachinaRoute: "scheduling",
      debugOverlayByViewport: {
        phone: "nonInteractiveOverlay",
      },
    } satisfies LeviathanScreenMetadata,
  },
  {
    key: "reschedule-available",
    title: "Reschedule available",
    route: "/book/demo-provider/confirmed/book_demo_confirmed?debug=1&fixture=reschedule-available",
    fixture: "reschedule-available",
    viewports: ["desktop"],
    tags: ["scheduling", "fixture", "mocked", "confirmation", "reschedule"],
    metadata: {
      productArea: "scheduling",
      captureSource: "fixture-or-live",
      supportsLiveRoute: true,
      artifactBaseName: "reschedule-available",
      expectedHeading: "Booking confirmed",
      expectedNodeIds: [
        "scheduling-hero",
        "scheduling-main",
        "booking-status-root",
        "scheduling-sidebar",
        "debug-inspector",
      ],
      expectedText: "Your current booking stays confirmed until the new time is confirmed.",
      expectedMachinaRoute: "scheduling",
    } satisfies LeviathanScreenMetadata,
  },
  {
    key: "reschedule-picker",
    title: "Reschedule picker",
    route: "/book/demo-provider/confirmed/book_demo_confirmed?debug=1&fixture=reschedule-picker",
    fixture: "reschedule-picker",
    viewports: ["desktop"],
    tags: ["scheduling", "fixture", "mocked", "confirmation", "reschedule"],
    metadata: {
      productArea: "scheduling",
      captureSource: "fixture-or-live",
      supportsLiveRoute: true,
      artifactBaseName: "reschedule-picker",
      expectedHeading: "Booking confirmed",
      expectedNodeIds: [
        "scheduling-hero",
        "scheduling-main",
        "booking-status-root",
        "scheduling-sidebar",
        "debug-inspector",
      ],
      expectedText: "Choose a replacement time",
      expectedMachinaRoute: "scheduling",
    } satisfies LeviathanScreenMetadata,
  },
  {
    key: "reschedule-result",
    title: "Reschedule result",
    route: "/book/demo-provider/confirmed/book_demo_rescheduled_old?debug=1&fixture=reschedule-result",
    fixture: "reschedule-result",
    viewports: ["desktop"],
    tags: ["scheduling", "fixture", "mocked", "confirmation", "reschedule"],
    metadata: {
      productArea: "scheduling",
      captureSource: "fixture-or-live",
      supportsLiveRoute: true,
      artifactBaseName: "reschedule-result",
      expectedHeading: "Booking rescheduled",
      expectedNodeIds: [
        "scheduling-hero",
        "scheduling-main",
        "booking-status-root",
        "scheduling-sidebar",
        "debug-inspector",
      ],
      expectedText: "Replacement confirmed",
      expectedMachinaRoute: "scheduling",
    } satisfies LeviathanScreenMetadata,
  },
  {
    key: "cancelled-rescheduled",
    title: "Cancelled and rescheduled bookings",
    route: "/apps/scheduling/bookings?debug=1&fixture=cancelled-rescheduled",
    fixture: "cancelled-rescheduled",
    viewports: ["desktop"],
    tags: ["scheduling", "fixture", "mocked", "bookings"],
    metadata: {
      productArea: "scheduling",
      captureSource: "fixture-or-live",
      supportsLiveRoute: true,
      artifactBaseName: "cancelled-rescheduled",
      expectedHeading: "Provider bookings",
      expectedNodeIds: [
        "scheduling-hero",
        "scheduling-main",
        "provider-bookings-root",
        "scheduling-sidebar",
        "debug-inspector",
      ],
      expectedText: "Cancelled",
      expectedMachinaRoute: "scheduling",
    } satisfies LeviathanScreenMetadata,
  },
  {
    key: "rescheduled-booking-detail",
    title: "Rescheduled booking detail",
    route: "/apps/scheduling/bookings?debug=1&fixture=rescheduled-booking-detail",
    fixture: "rescheduled-booking-detail",
    viewports: ["desktop"],
    tags: ["scheduling", "fixture", "mocked", "bookings", "reschedule"],
    metadata: {
      productArea: "scheduling",
      captureSource: "fixture-or-live",
      supportsLiveRoute: true,
      artifactBaseName: "rescheduled-booking-detail",
      expectedHeading: "Provider bookings",
      expectedNodeIds: [
        "scheduling-hero",
        "scheduling-main",
        "provider-bookings-root",
        "scheduling-sidebar",
        "debug-inspector",
      ],
      expectedText: "Replacement already confirmed",
      expectedMachinaRoute: "scheduling",
    } satisfies LeviathanScreenMetadata,
  },
  {
    key: "payment-required",
    title: "Payment required",
    route: "/book/demo-provider?debug=1&fixture=payment-required",
    fixture: "payment-required",
    viewports: ["desktop"],
    tags: ["scheduling", "fixture", "mocked", "payment"],
    metadata: {
      productArea: "scheduling",
      captureSource: "fixture-or-live",
      supportsLiveRoute: true,
      artifactBaseName: "payment-required",
      expectedHeading: "Choose a date and time",
      expectedNodeIds: [
        "booking-header",
        "booking-root-horizontal",
        "booking-summary-panel",
        "booking-main-panel",
        "booking-main-header",
        "booking-calendar-region",
        "booking-slots-region",
        "booking-footer-summary",
        "debug-inspector",
      ],
      expectedText: "controlled local/test payment satisfaction before confirmation",
      expectedMachinaRoute: "scheduling",
    } satisfies LeviathanScreenMetadata,
  },
  {
    key: "notification-summary",
    title: "Notification summary",
    route: "/apps/scheduling/bookings?debug=1&fixture=notification-summary",
    fixture: "notification-summary",
    viewports: ["desktop"],
    tags: ["scheduling", "fixture", "mocked", "notifications"],
    metadata: {
      productArea: "scheduling",
      captureSource: "fixture-or-live",
      supportsLiveRoute: true,
      artifactBaseName: "notification-summary",
      expectedHeading: "Provider bookings",
      expectedNodeIds: [
        "scheduling-hero",
        "scheduling-main",
        "provider-bookings-root",
        "scheduling-sidebar",
        "debug-inspector",
      ],
      expectedText: "Notifications",
      expectedMachinaRoute: "scheduling",
    } satisfies LeviathanScreenMetadata,
  },
];

export const leviathanScreenCatalog: MachinaScreenCatalog = defineMachinaScreens(screens);

export function getLeviathanScreen(screenKey: LeviathanScreenKey): MachinaScreen {
  return leviathanScreenCatalog.screens[screenKey];
}

export function getLeviathanScreenMetadata(
  taskOrScreen: MachinaScreenViewportTask | MachinaScreen,
): LeviathanScreenMetadata {
  const screen = "screen" in taskOrScreen ? taskOrScreen.screen : taskOrScreen;
  return screen.metadata as LeviathanScreenMetadata;
}

export function createLeviathanScreenTasks(): MachinaScreenViewportTask[] {
  return expandScreenViewportTasks(leviathanScreenCatalog, leviathanViewports);
}

export function routeWithDebugOverlay(
  route: string,
  mode?: LeviathanDebugOverlayMode,
): string {
  if (!mode) return route;

  const url = new URL(route, "http://leviathan.local");
  url.searchParams.set("debugOverlay", mode);
  return `${url.pathname}${url.search}`;
}

export function createLeviathanHandoffMetadata(task: MachinaScreenViewportTask): Record<string, unknown> {
  const metadata = getLeviathanScreenMetadata(task);
  const screenTitle = task.screen.title ?? task.screen.key;
  const debugOverlayMode =
    metadata.debugOverlayByViewport?.[task.viewportKey as LeviathanViewportKey] ?? "collapsed";

  return {
    screenTitle,
    productArea: metadata.productArea,
    captureSource: metadata.captureSource,
    supportsLiveRoute: metadata.supportsLiveRoute,
    legacyArtifactBaseName: metadata.artifactBaseName,
    debugOverlayMode,
    taskKey: task.key,
  };
}
