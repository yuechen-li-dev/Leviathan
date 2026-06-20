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
  "public-booking__desktop": "30 minute consult",
  "public-booking__tablet": "Mon Jan 7, 9:00 AM",
  "public-booking__phone": "Controlled states",
};

export function createUiSnapshotCases(): UiSnapshotCase[] {
  return createLeviathanScreenTasks().map((task) => {
    const metadata = getLeviathanScreenMetadata(task);
    const overlayMode = metadata.debugOverlayByViewport?.[task.viewportKey as "desktop" | "tablet" | "phone"];

    return {
      name: `${task.screenKey}-${task.viewportKey}`,
      route: routeWithDebugOverlay(task.route, overlayMode),
      viewport: { width: task.viewport.width, height: task.viewport.height },
      expectedHeading: metadata.expectedHeading,
      expectedNodeIds: overlayMode
        ? metadata.expectedNodeIds.filter((nodeId) => nodeId !== "debug-inspector")
        : [...metadata.expectedNodeIds],
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
