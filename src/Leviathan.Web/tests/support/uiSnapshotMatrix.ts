import type { MachinaScreenViewportTask } from "machinalayout";
import {
  createLeviathanHandoffMetadata,
  createLeviathanScreenTasks,
  getLeviathanScreenMetadata,
  leviathanScreenCatalog,
  leviathanViewports,
  routeWithDebugOverlay,
} from "../../src/machina/screenCatalog";

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
  tags: readonly string[];
  metadata: Record<string, unknown>;
  task: MachinaScreenViewportTask;
};

export const uiSnapshotViewports = leviathanViewports;
export const uiSnapshotScreens = leviathanScreenCatalog;

const taskTextOverrides: Record<string, string> = {
  "apps-route__desktop": "Scheduling",
  "apps-route__tablet": "Available apps",
  "apps-route__phone": "Rust Simulator",
  "scheduling-landing__desktop": "Action cards",
  "scheduling-landing__tablet": "Current proof points",
  "scheduling-landing__phone": "Unsafe local-dev ownership context",
  "public-booking__desktop": "30 min Intro Call",
  "public-booking__tablet": "Friday, May 16",
  "public-booking__phone": "Continue to confirmation",
  "booking-confirmation__tablet": "What happens next",
  "booking-confirmation__phone": "Actions",
  "reschedule-available__desktop": "Your current booking stays confirmed until the new time is confirmed.",
  "reschedule-picker__desktop": "Choose a replacement time",
  "reschedule-result__desktop": "Replacement confirmed",
  "rescheduled-booking-detail__desktop": "Replacement already confirmed",
};

export function createUiSnapshotCases(): UiSnapshotCase[] {
  return createLeviathanScreenTasks().map((task) => {
    const metadata = getLeviathanScreenMetadata(task);
    const overlayMode = metadata.debugOverlayByViewport?.[task.viewportKey as "desktop" | "tablet" | "phone"];
    const expectedNodeIds = metadata.expectedNodeIdsByViewport?.[task.viewportKey as "desktop" | "tablet" | "phone"] ?? metadata.expectedNodeIds;

    return {
      name: `${task.screenKey}-${task.viewportKey}`,
      route: routeWithDebugOverlay(task.route, overlayMode),
      viewport: { width: task.viewport.width, height: task.viewport.height },
      expectedHeading: metadata.expectedHeadingByViewport?.[task.viewportKey as "desktop" | "tablet" | "phone"] ?? metadata.expectedHeading,
      expectedNodeIds: overlayMode
        ? expectedNodeIds.filter((nodeId) => nodeId !== "debug-inspector")
        : [...expectedNodeIds],
      expectedText: taskTextOverrides[task.key] ?? metadata.expectedText,
      expectedMachinaRoute: metadata.expectedMachinaRoute,
      taskKey: task.key,
      artifactBaseName: task.artifactBaseName,
      tags: task.tags,
      metadata: createLeviathanHandoffMetadata(task),
      task,
    };
  });
}
