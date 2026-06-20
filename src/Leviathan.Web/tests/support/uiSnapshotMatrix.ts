import {
  createViewportMatrix,
  defineMachinaScreens,
  defineMachinaViewports,
  expandScreenViewportTasks,
  type MachinaScreenViewportTask,
} from "machinalayout";

export type UiSnapshotCase = {
  name: string;
  route: string;
  viewport: { width: number; height: number };
  expectedHeading: string;
  expectedNodeIds: string[];
  expectedText: string;
  expectedMachinaRoute: "apps" | "scheduling";
  taskKey: string;
  artifactBaseName: string;
  task: MachinaScreenViewportTask;
};

type SnapshotScreenMetadata = {
  expectedHeading: string;
  expectedNodeIds: string[];
  expectedText: string;
  expectedMachinaRoute: "apps" | "scheduling";
};

const standardResponsiveViewports = createViewportMatrix("standard-responsive");
const viewportTemplateByKey = Object.fromEntries(
  standardResponsiveViewports.map((viewport) => [viewport.key, viewport] as const),
);

export const uiSnapshotViewports = defineMachinaViewports([
  { ...viewportTemplateByKey.desktop, width: 1440, height: 1024 },
  { ...viewportTemplateByKey.tablet, width: 768, height: 1024 },
  { ...viewportTemplateByKey.phone, width: 390, height: 844 },
]);

export const uiSnapshotScreens = defineMachinaScreens([
  {
    key: "apps-route",
    route: "/apps?debug=1",
    viewports: ["desktop", "tablet", "phone"],
    metadata: {
      expectedHeading: "Available apps",
      expectedNodeIds: ["apps-list", "debug-inspector"],
      expectedText: "Scheduling",
      expectedMachinaRoute: "apps",
    } satisfies SnapshotScreenMetadata,
  },
  {
    key: "scheduling-landing",
    route: "/apps/scheduling?debug=1&fixture=landing",
    fixture: "landing",
    viewports: ["desktop", "tablet", "phone"],
    tags: ["scheduling", "fixture"],
    metadata: {
      expectedHeading: "Scheduling landing",
      expectedNodeIds: ["scheduling-hero", "scheduling-main", "scheduling-sidebar", "debug-inspector"],
      expectedText: "Action cards",
      expectedMachinaRoute: "scheduling",
    } satisfies SnapshotScreenMetadata,
  },
  {
    key: "provider-setup",
    route: "/apps/scheduling/setup?debug=1&fixture=provider-setup",
    fixture: "provider-setup",
    viewports: ["desktop"],
    tags: ["scheduling", "fixture"],
    metadata: {
      expectedHeading: "Provider setup",
      expectedNodeIds: ["scheduling-hero", "scheduling-main", "scheduling-sidebar", "debug-inspector"],
      expectedText: "Suggested defaults",
      expectedMachinaRoute: "scheduling",
    } satisfies SnapshotScreenMetadata,
  },
  {
    key: "public-booking",
    route: "/book/demo-provider?debug=1&fixture=public-booking",
    fixture: "public-booking",
    viewports: ["desktop", "tablet", "phone"],
    tags: ["scheduling", "fixture"],
    metadata: {
      expectedHeading: "Pick a slot",
      expectedNodeIds: ["scheduling-hero", "scheduling-main", "scheduling-sidebar", "debug-inspector"],
      expectedText: "30 minute consult",
      expectedMachinaRoute: "scheduling",
    } satisfies SnapshotScreenMetadata,
  },
  {
    key: "booking-confirmation",
    route: "/book/demo-provider/confirmed/book_demo_confirmed?debug=1&fixture=booking-confirmation",
    fixture: "booking-confirmation",
    viewports: ["desktop"],
    tags: ["scheduling", "fixture"],
    metadata: {
      expectedHeading: "Booking confirmed",
      expectedNodeIds: ["scheduling-hero", "scheduling-main", "scheduling-sidebar", "debug-inspector"],
      expectedText: "Download ICS",
      expectedMachinaRoute: "scheduling",
    } satisfies SnapshotScreenMetadata,
  },
  {
    key: "cancelled-rescheduled",
    route: "/apps/scheduling/bookings?debug=1&fixture=cancelled-rescheduled",
    fixture: "cancelled-rescheduled",
    viewports: ["desktop"],
    tags: ["scheduling", "fixture"],
    metadata: {
      expectedHeading: "Provider bookings",
      expectedNodeIds: ["scheduling-hero", "scheduling-main", "scheduling-sidebar", "debug-inspector"],
      expectedText: "Rescheduled",
      expectedMachinaRoute: "scheduling",
    } satisfies SnapshotScreenMetadata,
  },
  {
    key: "payment-required",
    route: "/book/demo-provider?debug=1&fixture=payment-required",
    fixture: "payment-required",
    viewports: ["desktop"],
    tags: ["scheduling", "fixture"],
    metadata: {
      expectedHeading: "Pick a slot",
      expectedNodeIds: ["scheduling-hero", "scheduling-main", "scheduling-sidebar", "debug-inspector"],
      expectedText: "Payment is required before confirmation",
      expectedMachinaRoute: "scheduling",
    } satisfies SnapshotScreenMetadata,
  },
  {
    key: "notification-summary",
    route: "/apps/scheduling/bookings?debug=1&fixture=notification-summary",
    fixture: "notification-summary",
    viewports: ["desktop"],
    tags: ["scheduling", "fixture"],
    metadata: {
      expectedHeading: "Provider bookings",
      expectedNodeIds: ["scheduling-hero", "scheduling-main", "scheduling-sidebar", "debug-inspector"],
      expectedText: "Notifications",
      expectedMachinaRoute: "scheduling",
    } satisfies SnapshotScreenMetadata,
  },
]);

const taskTextOverrides: Record<string, string> = {
  "apps-route__desktop": "Scheduling",
  "apps-route__tablet": "Available apps",
  "apps-route__phone": "Rust Simulator",
  "scheduling-landing__desktop": "Action cards",
  "scheduling-landing__tablet": "Current proof points",
  "scheduling-landing__phone": "Unsafe local-dev ownership context",
  "public-booking__desktop": "30 minute consult",
  "public-booking__tablet": "Mon Jan 7, 9:00 AM",
  "public-booking__phone": "Controlled states",
};

export function createUiSnapshotCases(): UiSnapshotCase[] {
  return expandScreenViewportTasks(uiSnapshotScreens, uiSnapshotViewports).map((task) => {
    const metadata = task.screen.metadata as SnapshotScreenMetadata;

    return {
      name: `${task.screenKey}-${task.viewportKey}`,
      route: task.route,
      viewport: { width: task.viewport.width, height: task.viewport.height },
      expectedHeading: metadata.expectedHeading,
      expectedNodeIds: [...metadata.expectedNodeIds],
      expectedText: taskTextOverrides[task.key] ?? metadata.expectedText,
      expectedMachinaRoute: metadata.expectedMachinaRoute,
      taskKey: task.key,
      artifactBaseName: task.artifactBaseName,
      task,
    };
  });
}
