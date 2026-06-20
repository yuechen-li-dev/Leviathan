import {
  createViewportMatrix,
  defineMachinaScreens,
  defineMachinaViewports,
  expandScreenViewportTasks,
  type MachinaScreenViewportTask,
} from "machinalayout";

type SnapshotCase = {
  name: string;
  route: string;
  viewport: { width: number; height: number };
  expectedHeading: string;
  expectedNodeIds: string[];
  expectedText: string;
};

const snapshotViewports = defineMachinaViewports([
  { ...createViewportMatrix("standard-responsive")[0], height: 1024 },
  { ...createViewportMatrix("standard-responsive")[1], width: 768, height: 1024 },
  createViewportMatrix("standard-responsive")[2],
]);

const snapshotScreens = defineMachinaScreens([
  {
    key: "apps-route",
    route: "/apps?debug=1",
    viewports: ["desktop", "tablet", "phone"],
    metadata: {
      expectedHeading: "Available apps",
      expectedNodeIds: ["apps-list", "debug-inspector"],
      expectedTextByViewport: {
        desktop: "Scheduling",
        tablet: "Available apps",
        phone: "Rust Simulator",
      },
    },
  },
  {
    key: "scheduling-landing",
    route: "/apps/scheduling?debug=1&fixture=landing",
    fixture: "landing",
    viewports: ["desktop", "tablet", "phone"],
    metadata: {
      expectedHeading: "Scheduling landing",
      expectedNodeIds: [
        "scheduling-hero",
        "scheduling-main",
        "scheduling-sidebar",
        "debug-inspector",
      ],
      expectedTextByViewport: {
        desktop: "Action cards",
        tablet: "Current proof points",
        phone: "Unsafe local-dev ownership context",
      },
    },
  },
  {
    key: "provider-setup",
    route: "/apps/scheduling/setup?debug=1&fixture=provider-setup",
    fixture: "provider-setup",
    viewports: ["desktop"],
    metadata: {
      expectedHeading: "Provider setup",
      expectedNodeIds: [
        "scheduling-hero",
        "scheduling-main",
        "scheduling-sidebar",
        "debug-inspector",
      ],
      expectedText: "Suggested defaults",
    },
  },
  {
    key: "public-booking",
    route: "/book/demo-provider?debug=1&fixture=public-booking",
    fixture: "public-booking",
    viewports: ["desktop", "tablet", "phone"],
    metadata: {
      expectedHeading: "Pick a slot",
      expectedNodeIds: [
        "scheduling-hero",
        "scheduling-main",
        "scheduling-sidebar",
        "debug-inspector",
      ],
      expectedTextByViewport: {
        desktop: "30 minute consult",
        tablet: "Mon Jan 7, 9:00 AM",
        phone: "Controlled states",
      },
    },
  },
  {
    key: "booking-confirmation",
    route: "/book/demo-provider/confirmed/book_demo_confirmed?debug=1&fixture=booking-confirmation",
    fixture: "booking-confirmation",
    viewports: ["desktop"],
    metadata: {
      expectedHeading: "Booking confirmed",
      expectedNodeIds: [
        "scheduling-hero",
        "scheduling-main",
        "scheduling-sidebar",
        "debug-inspector",
      ],
      expectedText: "Download ICS",
    },
  },
  {
    key: "cancelled-rescheduled",
    route: "/apps/scheduling/bookings?debug=1&fixture=cancelled-rescheduled",
    fixture: "cancelled-rescheduled",
    viewports: ["desktop"],
    metadata: {
      expectedHeading: "Provider bookings",
      expectedNodeIds: [
        "scheduling-hero",
        "scheduling-main",
        "scheduling-sidebar",
        "debug-inspector",
      ],
      expectedText: "Rescheduled",
    },
  },
  {
    key: "payment-required",
    route: "/book/demo-provider?debug=1&fixture=payment-required",
    fixture: "payment-required",
    viewports: ["desktop"],
    metadata: {
      expectedHeading: "Pick a slot",
      expectedNodeIds: [
        "scheduling-hero",
        "scheduling-main",
        "scheduling-sidebar",
        "debug-inspector",
      ],
      expectedText: "Payment is required before confirmation",
    },
  },
  {
    key: "notification-summary",
    route: "/apps/scheduling/bookings?debug=1&fixture=notification-summary",
    fixture: "notification-summary",
    viewports: ["desktop"],
    metadata: {
      expectedHeading: "Provider bookings",
      expectedNodeIds: [
        "scheduling-hero",
        "scheduling-main",
        "scheduling-sidebar",
        "debug-inspector",
      ],
      expectedText: "Notifications",
    },
  },
]);

export const snapshotCases: SnapshotCase[] = expandScreenViewportTasks(
  snapshotScreens,
  snapshotViewports,
).map(toSnapshotCase);

function toSnapshotCase(task: MachinaScreenViewportTask): SnapshotCase {
  const metadata = task.screen.metadata as {
    expectedHeading: string;
    expectedNodeIds: string[];
    expectedText?: string;
    expectedTextByViewport?: Record<string, string>;
  };

  return {
    name: task.artifactBaseName.replace("__", "-"),
    route: task.route,
    viewport: { width: task.viewport.width, height: task.viewport.height },
    expectedHeading: metadata.expectedHeading,
    expectedNodeIds: metadata.expectedNodeIds,
    expectedText:
      metadata.expectedTextByViewport?.[task.viewportKey] ?? metadata.expectedText ?? "",
  };
}

