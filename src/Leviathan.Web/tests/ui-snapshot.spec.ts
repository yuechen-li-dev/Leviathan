import { expect, test, type Page } from "@playwright/test";
import { installLeviathanUiMocks } from "./support/mockApi";
import { captureLeviathanUiHandoffBundle } from "./support/uiSnapshot";
import { createUiSnapshotCases } from "./support/uiSnapshotMatrix";

const snapshotCases = createUiSnapshotCases();

test.describe("Leviathan UI snapshot workbench", () => {
  test.beforeEach(async ({ page }) => {
    await installLeviathanUiMocks(page);
  });

  for (const snapshotCase of snapshotCases) {
    test(`${snapshotCase.name} captures screenshot, DOM summary, and Machina snapshot`, async ({ page }, testInfo) => {
      const issues = monitorPage(page);
      await page.setViewportSize(snapshotCase.viewport);
      await page.goto(snapshotCase.route);
      await expect(page.getByRole("heading", { name: snapshotCase.expectedHeading }).first()).toBeVisible();
      await expect(page.locator("body")).toContainText(snapshotCase.expectedText);

      const bundle = await captureLeviathanUiHandoffBundle(page, testInfo, {
        name: snapshotCase.name,
        route: snapshotCase.route,
        task: snapshotCase.task,
        tags: snapshotCase.tags,
        metadata: snapshotCase.metadata,
      });

      const nodeIds = bundle.domSummary.nodes.map((node) => node.nodeId);
      for (const nodeId of snapshotCase.expectedNodeIds) {
        expect(nodeIds).toContain(nodeId);
      }

      expect(bundle.artifactExists.screenshot).toBe(true);
      expect(bundle.artifactExists.domSummary).toBe(true);
      expect(bundle.artifactExists.machinaSnapshot).toBe(true);
      expect(bundle.artifactExists.handoff).toBe(true);
      expect(bundle.machinaSnapshot).toMatchObject({
        snapshot: {
          route: snapshotCase.expectedMachinaRoute,
        },
      });
      expect(bundle.handoff).toMatchObject({
        testName: snapshotCase.name,
        route: snapshotCase.route,
        fixture: snapshotCase.task.fixture,
        screenKey: snapshotCase.task.screenKey,
        viewportKey: snapshotCase.task.viewportKey,
        tags: [...snapshotCase.tags],
        metadata: snapshotCase.metadata,
      });
      expect(issues.pageErrors).toEqual([]);
      expect(issues.consoleErrors).toEqual([]);
    });
  }

  test("nonInteractiveOverlay renders overlay labels without the docked inspector panel", async ({ page }) => {
    const overlayCase = snapshotCases.find((entry) => entry.name === "public-booking-phone");
    expect(overlayCase).toBeDefined();

    await page.setViewportSize(overlayCase!.viewport);
    await page.goto(overlayCase!.route);
    await expect(page.getByTestId("machina-debug-overlay")).toHaveAttribute(
      "data-machina-debug-overlay-mode",
      "nonInteractiveOverlay",
    );
    await expect(page.getByTestId("machina-debug-overlay-node-scheduling-main")).toBeVisible();
    await expect(page.getByRole("button", { name: /Inspector/ })).toHaveCount(0);
  });
});

function monitorPage(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  return { pageErrors, consoleErrors };
}
