import { expect, test, type Page } from "@playwright/test";
import { captureLeviathanUiHandoffBundle } from "./support/uiSnapshot";
import { realBackendBaseUrl, startRealBackend } from "./support/realBackend";

test.skip(!process.env.LEVIATHAN_REAL_SMOKE, "Real backend smoke runs only under npm run test:e2e:real.");

test.describe("Scheduling real backend smoke", () => {
  let apiBaseUrl = `${realBackendBaseUrl}/api`;
  let stopBackend: (() => Promise<void>) | undefined;

  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    const backend = await startRealBackend();
    apiBaseUrl = backend.apiBaseUrl;
    stopBackend = backend.stop;
  });

  test.afterAll(async () => {
    await stopBackend?.();
  });

  test("walks the live scheduling path and captures real-backend handoff bundles", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const issues = monitorPage(page);
    const routeQuery = `debug=1&apiBaseUrl=${encodeURIComponent(apiBaseUrl)}`;

    await page.goto(`/apps/scheduling/setup?${routeQuery}`);
    await closeInspector(page);
    await expect(page.getByRole("heading", { name: "Provider setup" })).toBeVisible();

    await page.getByTestId("setup-create-provider").click();
    await expect(page.getByText(/Provider: /)).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("setup-create-resource").click();
    await expect(page.getByText(/Resource: /)).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("setup-create-service").click();
    await expect(page.getByText(/Service: /)).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("setup-create-availability").click();
    await expect(page.getByText(/Availability rule: /)).toBeVisible({ timeout: 30_000 });

    await captureLeviathanUiHandoffBundle(page, testInfo, {
      name: "real-provider-setup-created",
      route: `/apps/scheduling/setup?${routeQuery}`,
      artifactRoot: "ui-snapshots-real",
    });

    await navigateToHref(page, "setup-public-link");
    await expect(page.getByRole("heading", { name: "Pick a slot" })).toBeVisible();
    await expect(page.locator(".scheduling-slot-button").first()).toBeVisible();

    await captureLeviathanUiHandoffBundle(page, testInfo, {
      name: "real-public-booking-slots",
      route: page.url(),
      artifactRoot: "ui-snapshots-real",
    });

    await page.locator(".scheduling-slot-button").first().click();
    await expect(page.getByTestId("public-hold-state")).toContainText("Hold id:");
    await clickAction(page, "public-submit-intake");

    await captureLeviathanUiHandoffBundle(page, testInfo, {
      name: "real-hold-intake",
      route: page.url(),
      artifactRoot: "ui-snapshots-real",
    });

    await clickAction(page, "public-confirm-booking");
    await expect(page.getByTestId("public-payment-required")).toBeVisible();

    await captureLeviathanUiHandoffBundle(page, testInfo, {
      name: "real-payment-required",
      route: page.url(),
      artifactRoot: "ui-snapshots-real",
    });

    await clickAction(page, "public-fake-satisfy-payment");
    await expect(page.getByTestId("public-hold-state")).not.toContainText("Payment reference: none");
    await clickAction(page, "public-confirm-booking");
    await expect(page.getByRole("heading", { name: "Booking confirmed" }).first()).toBeVisible({ timeout: 30_000 });

    await captureLeviathanUiHandoffBundle(page, testInfo, {
      name: "real-confirmed-booking",
      route: page.url(),
      artifactRoot: "ui-snapshots-real",
    });

    await navigateToHref(page, "confirmation-open-bookings");
    await expect(page.getByRole("heading", { name: "Provider bookings" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Audit and lifecycle" }).first()).toBeVisible();

    await captureLeviathanUiHandoffBundle(page, testInfo, {
      name: "real-audit-lifecycle",
      route: page.url(),
      artifactRoot: "ui-snapshots-real",
    });

    await clickAction(page, "booking-cancel");
    await expect(page.locator("body")).toContainText("Cancelled");
    await expect(page.locator("body")).toContainText("booking_cancelled");

    await captureLeviathanUiHandoffBundle(page, testInfo, {
      name: "real-booking-cancelled",
      route: page.url(),
      artifactRoot: "ui-snapshots-real",
    });

    const unexpectedBadResponses = issues.badResponses.filter((entry) => !isExpectedPaymentRequiredResponse(entry));
    const unexpectedConsoleErrors = issues.consoleErrors.filter((entry) => !(entry.includes("400 (Bad Request)") && issues.badResponses.some(isExpectedPaymentRequiredResponse)));

    expect(issues.pageErrors).toEqual([]);
    expect(unexpectedBadResponses).toEqual([]);
    expect(unexpectedConsoleErrors).toEqual([]);
  });
});

function monitorPage(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const badResponses: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
  });
  return { pageErrors, consoleErrors, badResponses };
}

function isExpectedPaymentRequiredResponse(entry: string) {
  return entry.includes("400") && entry.includes("/api/apps/scheduling/bookings/confirm");
}

async function closeInspector(page: Page) {
  const toggle = page.getByRole("button", { name: /Inspector/ });
  if (await toggle.isVisible()) {
    const label = await toggle.textContent();
    if (label?.includes("−")) await toggle.click();
  }
}

async function clickAction(page: Page, testId: string) {
  const locator = page.getByTestId(testId);
  await locator.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
}

async function navigateToHref(page: Page, testId: string) {
  const href = await page.getByTestId(testId).getAttribute("href");
  if (!href) throw new Error(`Missing href for ${testId}.`);
  await page.goto(href);
}
