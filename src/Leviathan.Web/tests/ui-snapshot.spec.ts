import { expect, test, type Page } from "@playwright/test";
import { installLeviathanUiMocks } from "./support/mockApi";
import { captureLeviathanUiHandoffBundle } from "./support/uiSnapshot";

type SnapshotCase = {
  name: string;
  route: string;
  viewport: { width: number; height: number };
  expectedHeading: string;
  expectedNodeIds: string[];
  expectedText: string;
};

const desktop = { width: 1440, height: 1024 };
const tablet = { width: 768, height: 1024 };
const phone = { width: 390, height: 844 };

const snapshotCases: SnapshotCase[] = [
  {
    name: "apps-route-desktop",
    route: "/apps?debug=1",
    viewport: desktop,
    expectedHeading: "Available apps",
    expectedNodeIds: ["apps-list", "debug-inspector"],
    expectedText: "Scheduling",
  },
  {
    name: "apps-route-tablet",
    route: "/apps?debug=1",
    viewport: tablet,
    expectedHeading: "Available apps",
    expectedNodeIds: ["apps-list", "debug-inspector"],
    expectedText: "Available apps",
  },
  {
    name: "apps-route-phone",
    route: "/apps?debug=1",
    viewport: phone,
    expectedHeading: "Available apps",
    expectedNodeIds: ["apps-list", "debug-inspector"],
    expectedText: "Rust Simulator",
  },
  {
    name: "scheduling-landing-desktop",
    route: "/apps/scheduling?debug=1&fixture=landing",
    viewport: desktop,
    expectedHeading: "Scheduling landing",
    expectedNodeIds: ["scheduling-hero", "scheduling-main", "scheduling-sidebar", "debug-inspector"],
    expectedText: "Action cards",
  },
  {
    name: "scheduling-landing-tablet",
    route: "/apps/scheduling?debug=1&fixture=landing",
    viewport: tablet,
    expectedHeading: "Scheduling landing",
    expectedNodeIds: ["scheduling-hero", "scheduling-main", "scheduling-sidebar", "debug-inspector"],
    expectedText: "Current proof points",
  },
  {
    name: "scheduling-landing-phone",
    route: "/apps/scheduling?debug=1&fixture=landing",
    viewport: phone,
    expectedHeading: "Scheduling landing",
    expectedNodeIds: ["scheduling-hero", "scheduling-main", "scheduling-sidebar", "debug-inspector"],
    expectedText: "Unsafe local-dev ownership context",
  },
  {
    name: "provider-setup-desktop",
    route: "/apps/scheduling/setup?debug=1&fixture=provider-setup",
    viewport: desktop,
    expectedHeading: "Provider setup",
    expectedNodeIds: ["scheduling-hero", "scheduling-main", "scheduling-sidebar", "debug-inspector"],
    expectedText: "Suggested defaults",
  },
  {
    name: "public-booking-desktop",
    route: "/book/demo-provider?debug=1&fixture=public-booking",
    viewport: desktop,
    expectedHeading: "Pick a slot",
    expectedNodeIds: ["scheduling-hero", "scheduling-main", "scheduling-sidebar", "debug-inspector"],
    expectedText: "30 minute consult",
  },
  {
    name: "public-booking-tablet",
    route: "/book/demo-provider?debug=1&fixture=public-booking",
    viewport: tablet,
    expectedHeading: "Pick a slot",
    expectedNodeIds: ["scheduling-hero", "scheduling-main", "scheduling-sidebar", "debug-inspector"],
    expectedText: "Mon Jan 7, 9:00 AM",
  },
  {
    name: "public-booking-phone",
    route: "/book/demo-provider?debug=1&fixture=public-booking",
    viewport: phone,
    expectedHeading: "Pick a slot",
    expectedNodeIds: ["scheduling-hero", "scheduling-main", "scheduling-sidebar", "debug-inspector"],
    expectedText: "Controlled states",
  },
  {
    name: "booking-confirmation-desktop",
    route: "/book/demo-provider/confirmed/book_demo_confirmed?debug=1&fixture=booking-confirmation",
    viewport: desktop,
    expectedHeading: "Booking confirmed",
    expectedNodeIds: ["scheduling-hero", "scheduling-main", "scheduling-sidebar", "debug-inspector"],
    expectedText: "Download ICS",
  },
  {
    name: "cancelled-rescheduled-desktop",
    route: "/apps/scheduling/bookings?debug=1&fixture=cancelled-rescheduled",
    viewport: desktop,
    expectedHeading: "Provider bookings",
    expectedNodeIds: ["scheduling-hero", "scheduling-main", "scheduling-sidebar", "debug-inspector"],
    expectedText: "Rescheduled",
  },
  {
    name: "payment-required-desktop",
    route: "/book/demo-provider?debug=1&fixture=payment-required",
    viewport: desktop,
    expectedHeading: "Pick a slot",
    expectedNodeIds: ["scheduling-hero", "scheduling-main", "scheduling-sidebar", "debug-inspector"],
    expectedText: "Payment is required before confirmation",
  },
  {
    name: "notification-summary-desktop",
    route: "/apps/scheduling/bookings?debug=1&fixture=notification-summary",
    viewport: desktop,
    expectedHeading: "Provider bookings",
    expectedNodeIds: ["scheduling-hero", "scheduling-main", "scheduling-sidebar", "debug-inspector"],
    expectedText: "Notifications",
  },
];

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
          route: snapshotCase.route.startsWith("/apps") ? (snapshotCase.route.startsWith("/apps?") ? "apps" : "scheduling") : "scheduling",
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
