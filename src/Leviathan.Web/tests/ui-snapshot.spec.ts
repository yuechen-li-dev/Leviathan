import { expect, test, type Page } from "@playwright/test";
import { installLeviathanUiMocks } from "./support/mockApi";
import { snapshotCases } from "./support/uiSnapshotMatrix";
import { captureLeviathanUiHandoffBundle } from "./support/uiSnapshot";

test.describe("Leviathan UI snapshot workbench", () => {
  test.beforeEach(async ({ page }) => {
    await installLeviathanUiMocks(page);
  });

  for (const snapshotCase of snapshotCases) {
    test(`${snapshotCase.name} captures screenshot, DOM summary, and Machina snapshot`, async ({
      page,
    }, testInfo) => {
      const issues = monitorPage(page);
      await page.setViewportSize(snapshotCase.viewport);
      await page.goto(snapshotCase.route);
      await expect(
        page.getByRole("heading", { name: snapshotCase.expectedHeading }).first(),
      ).toBeVisible();
      await expect(page.locator("body")).toContainText(snapshotCase.expectedText);

      const bundle = await captureLeviathanUiHandoffBundle(page, testInfo, {
        name: snapshotCase.name,
        route: snapshotCase.route,
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
          route: snapshotCase.route.startsWith("/apps")
            ? snapshotCase.route.startsWith("/apps?")
              ? "apps"
              : "scheduling"
            : "scheduling",
        },
      });
      expect(issues.pageErrors).toEqual([]);
      expect(issues.consoleErrors).toEqual([]);
    });
  }
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
