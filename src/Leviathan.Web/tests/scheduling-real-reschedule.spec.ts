import { expect, test, type Page } from "@playwright/test";
import { captureLeviathanUiHandoffBundle } from "./support/uiSnapshot";
import { realBackendBaseUrl, startRealBackend } from "./support/realBackend";

test.skip(!process.env.LEVIATHAN_REAL_SMOKE, "Real backend reschedule smoke runs only under npm run test:e2e:reschedule.");

test.describe("Scheduling real backend reschedule smoke", () => {
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

  test("walks the live reschedule replacement flow and verifies old/new booking relations", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const issues = monitorPage(page);
    const routeQuery = `debug=1&debugOverlay=nonInteractiveOverlay&apiBaseUrl=${encodeURIComponent(apiBaseUrl)}`;

    await page.goto(`/apps/scheduling/setup?${routeQuery}`);
    await expect(page.getByRole("heading", { name: "Provider setup" })).toBeVisible();

    await runSetupStep(page, "setup-create-provider", "setup-provider-entity");
    await runSetupStep(page, "setup-create-resource", "setup-resource-entity");
    await runSetupStep(page, "setup-create-service", "setup-service-entity");
    await runSetupStep(page, "setup-create-availability", "setup-availability-entity");

    await navigateToHref(page, "setup-public-link");
    await expect(page.getByRole("heading", { name: "Choose a date and time" })).toBeVisible();

    await page.getByTestId("public-slot-option").first().click();
    await clickAction(page, "public-submit-intake");
    await clickAction(page, "public-confirm-booking");
    await expect(page.getByTestId("public-payment-required")).toBeVisible();
    await clickAction(page, "public-fake-satisfy-payment");
    await clickAction(page, "public-confirm-booking");
    await expect(page.getByRole("heading", { name: "Booking confirmed" }).first()).toBeVisible({ timeout: 30_000 });

    await captureLeviathanUiHandoffBundle(page, testInfo, {
      name: "real-reschedule-available",
      route: page.url(),
      artifactRoot: "ui-snapshots-real",
    });

    await clickAction(page, "booking-reschedule-open");
    await expect(page.getByTestId("booking-reschedule-root")).toContainText("Your current booking stays confirmed until the new time is confirmed.");

    const replacementOptions = page.getByTestId("booking-reschedule-slot-option");
    await expect(replacementOptions.first()).toBeVisible({ timeout: 30_000 });
    await replacementOptions.first().evaluate((element) => {
      (element as HTMLButtonElement).click();
    });
    await clickAction(page, "booking-reschedule-create-hold");
    await expect(page.getByTestId("booking-reschedule-root")).toContainText("Replacement hold created");

    await captureLeviathanUiHandoffBundle(page, testInfo, {
      name: "real-reschedule-picker",
      route: page.url(),
      artifactRoot: "ui-snapshots-real",
    });

    await clickAction(page, "booking-reschedule-submit-intake");
    if (await page.getByTestId("booking-reschedule-fake-satisfy-payment").count()) {
      const paymentButton = page.getByTestId("booking-reschedule-fake-satisfy-payment");
      if (await paymentButton.isVisible()) {
        await paymentButton.click();
      }
    }
    await clickAction(page, "booking-reschedule-confirm");
    if (await page.getByTestId("booking-reschedule-fake-satisfy-payment").count()) {
      const paymentButton = page.getByTestId("booking-reschedule-fake-satisfy-payment");
      if (await paymentButton.isVisible()) {
        await paymentButton.evaluate((element) => {
          (element as HTMLButtonElement).click();
        });
        await expect(page.getByText("No payment required for this replacement.")).toBeVisible({ timeout: 30_000 });
        await clickAction(page, "booking-reschedule-confirm");
      }
    }
    await page.waitForTimeout(1_000);
    const liveContextJson = await page.evaluate(() => window.localStorage.getItem("leviathan.scheduling.liveContext"));
    const liveContext = liveContextJson ? JSON.parse(liveContextJson) as { providerId?: string } : {};
    if (!liveContext.providerId) {
      throw new Error("Provider id was not preserved in live scheduling context after reschedule confirmation.");
    }
    await page.goto(`/apps/scheduling/bookings?providerId=${encodeURIComponent(liveContext.providerId)}&${routeQuery}`);
    await expect(page.getByRole("heading", { name: "Provider bookings" }).first()).toBeVisible();
    await expect(page.getByTestId("provider-bookings-list")).toContainText("Rescheduled");
    await expect(page.getByTestId("provider-booking-detail")).toContainText("Rescheduled to");
    await expect(page.getByTestId("provider-booking-detail")).toContainText("Rescheduled from");

    await captureLeviathanUiHandoffBundle(page, testInfo, {
      name: "real-reschedule-result",
      route: page.url(),
      artifactRoot: "ui-snapshots-real",
    });

    const unexpectedBadResponses = issues.badResponses.filter((entry) => !isExpectedControlledResponse(entry));
    const unexpectedConsoleErrors = issues.consoleErrors.filter((entry) => !(entry.includes("400 (Bad Request)") && issues.badResponses.some(isExpectedControlledResponse)));

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

function isExpectedControlledResponse(entry: string) {
  return entry.includes("400") && entry.includes("/api/apps/scheduling/bookings/confirm");
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

async function runSetupStep(page: Page, actionTestId: string, entityTestId: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await clickAction(page, actionTestId);
    try {
      await expect(page.getByTestId(entityTestId)).toBeVisible({ timeout: 8_000 });
      return;
    } catch (error) {
      const bodyText = await page.locator("body").innerText();
      if (!bodyText.includes("process cannot access the file") || attempt === 3) {
        throw error;
      }
      await page.waitForTimeout(1_000);
    }
  }
}
