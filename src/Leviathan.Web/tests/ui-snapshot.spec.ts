import { expect, test } from "@playwright/test";
import { installLeviathanUiMocks } from "./support/mockApi";
import { captureLeviathanUiHandoffBundle } from "./support/uiSnapshot";

test.describe("Leviathan UI snapshot workbench", () => {
  test.beforeEach(async ({ page }) => {
    await installLeviathanUiMocks(page);
  });

  test("/apps renders app list and captures handoff bundle", async ({ page }, testInfo) => {
    await page.goto("/apps?debug=1");
    await expect(page.getByRole("heading", { name: "Available apps" })).toBeVisible();

    const bundle = await captureLeviathanUiHandoffBundle(page, testInfo, {
      name: "apps-route",
      route: "/apps?debug=1",
    });

    const nodeIds = bundle.domSummary.nodes.map((node) => node.nodeId);
    expect(nodeIds).toContain("apps-list");
    expect(bundle.domSummary.nodes.some((node) => node.debugLabel?.includes("Apps list"))).toBe(true);
    expect(bundle.machinaSnapshot).toMatchObject({
      snapshot: {
        route: "apps",
      },
    });
  });

  test("/apps/scheduling renders scheduling shell and captures handoff bundle", async ({ page }, testInfo) => {
    await page.goto("/apps/scheduling?debug=1");
    await expect(page.getByRole("heading", { name: "Scheduling" })).toBeVisible();

    const bundle = await captureLeviathanUiHandoffBundle(page, testInfo, {
      name: "apps-scheduling-route",
      route: "/apps/scheduling?debug=1",
    });

    const nodeIds = bundle.domSummary.nodes.map((node) => node.nodeId);
    expect(nodeIds).toContain("scheduling-home");
    expect(bundle.domSummary.nodes.some((node) => node.debugLabel?.includes("Scheduling"))).toBe(true);
    expect(bundle.machinaSnapshot).toMatchObject({
      snapshot: {
        route: "scheduling",
      },
    });
  });
});
