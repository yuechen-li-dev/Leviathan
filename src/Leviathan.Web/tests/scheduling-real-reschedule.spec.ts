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
    const networkJournal = monitorRescheduleNetwork(page);
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

    await clickActionAndWaitForPost(page, "booking-reschedule-submit-intake", "/intake");
    let confirmationResponse = await clickActionAndWaitForPost(page, "booking-reschedule-confirm", "/bookings/confirm");
    if (confirmationResponse.status() === 400) {
      // The backend's controlled first confirmation establishes that this
      // replacement needs local/test payment. Only then is the payment
      // command eligible; await each task-backed command before continuing.
      const paymentButton = page.getByTestId("booking-reschedule-fake-satisfy-payment");
      await expect(paymentButton).toBeVisible({ timeout: 30_000 });
      await expect(paymentButton).toBeEnabled({ timeout: 30_000 });
      const paymentResponse = await clickActionAndWaitForPost(page, "booking-reschedule-fake-satisfy-payment", "/payment/fake-satisfy");
      expect(paymentResponse.ok()).toBe(true);
      expect(await paymentResponse.json()).toMatchObject({ paymentRequirementStatus: "satisfied" });
      await expect(page.getByText("No payment required for this replacement.")).toBeVisible({ timeout: 30_000 });
      confirmationResponse = await clickActionAndWaitForPost(page, "booking-reschedule-confirm", "/bookings/confirm");
    }
    expect(confirmationResponse.ok()).toBe(true);
    await testInfo.attach("reschedule-network-after-confirm.json", {
      body: Buffer.from(JSON.stringify(networkJournal.entries, null, 2), "utf8"),
      contentType: "application/json",
    });
    await page.waitForTimeout(1_000);
    const liveContextJson = await page.evaluate(() => window.localStorage.getItem("leviathan.scheduling.liveContext"));
    const liveContext = liveContextJson ? JSON.parse(liveContextJson) as { providerId?: string } : {};
    await testInfo.attach("reschedule-live-context.json", {
      body: Buffer.from(JSON.stringify(liveContext, null, 2), "utf8"),
      contentType: "application/json",
    });
    await expect(page.getByTestId("booking-reschedule-result")).toContainText("Replacement confirmed");
    await expect(page.getByTestId("booking-reschedule-result")).toContainText("Rescheduled to");
    await expect(page.getByTestId("booking-reschedule-result")).toContainText("Rescheduled from");
    if (!liveContext.providerId) {
      throw new Error("Provider id was not preserved in live scheduling context after reschedule confirmation.");
    }
    await page.goto(`/apps/scheduling/bookings?providerId=${encodeURIComponent(liveContext.providerId)}&${routeQuery}`);
    await page.waitForLoadState("networkidle");
    const providerRoute = page.url();
    const providerBody = await page.locator("body").innerText();
    await testInfo.attach("reschedule-provider-route.txt", {
      body: Buffer.from(providerRoute, "utf8"),
      contentType: "text/plain",
    });
    await testInfo.attach("reschedule-provider-body.txt", {
      body: Buffer.from(providerBody, "utf8"),
      contentType: "text/plain",
    });
    await expect(page.getByRole("heading", { name: "Provider bookings" }).first()).toBeVisible();
    await expect(page.getByTestId("provider-bookings-list")).toContainText("Rescheduled");
    await expect(page.getByTestId("provider-bookings-list")).toContainText("Confirmed");
    await expect(page.getByTestId("provider-booking-detail")).toContainText("Rescheduled to");
    const replacementBookingRow = page.locator("[data-testid^='booking-row-']").filter({ has: page.getByTestId("booking-cancel") }).first();
    await replacementBookingRow.getByRole("button", { name: "Inspect" }).evaluate((element) => {
      (element as HTMLButtonElement).click();
    });
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

function monitorRescheduleNetwork(page: Page) {
  const entries: Array<Record<string, unknown>> = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (
      !url.includes("/api/apps/scheduling/")
      || (!url.includes("/reschedule/holds")
        && !url.includes("/payment/fake-satisfy")
        && !url.includes("/bookings/confirm")
        && !url.includes("/bookings?")
        && !url.includes("/bookings/")
        && !url.includes("/lifecycle"))
    ) {
      return;
    }

    let body: unknown;
    try {
      body = summarizeSchedulingPayload(await response.json());
    } catch {
      try {
        body = await response.text();
      } catch (error) {
        body = `unavailable: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    entries.push({
      status: response.status(),
      url,
      body,
    });
  });
  return { entries };
}

function summarizeSchedulingPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => summarizeSchedulingPayload(entry));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const summaryKeys = [
    "holdId",
    "replacementHoldId",
    "bookingId",
    "oldBookingId",
    "claimToken",
    "status",
    "paymentRequirementStatus",
    "paymentStatus",
    "paymentReference",
    "confirmedAt",
    "rescheduledAt",
    "rescheduledToBookingId",
    "rescheduledFromBookingId",
    "replacementBookingId",
    "replacementHoldId",
    "lastDecisionCode",
    "workflowState",
    "currentWorkflowState",
  ];
  const summarized: Record<string, unknown> = {};
  for (const key of summaryKeys) {
    if (key in record) summarized[key] = record[key];
  }
  if ("id" in record && typeof record.id === "object" && record.id && "value" in (record.id as Record<string, unknown>)) {
    summarized.id = (record.id as Record<string, unknown>).value;
  }
  if ("providerId" in record && typeof record.providerId === "object" && record.providerId && "value" in (record.providerId as Record<string, unknown>)) {
    summarized.providerId = (record.providerId as Record<string, unknown>).value;
  }
  if ("serviceId" in record && typeof record.serviceId === "object" && record.serviceId && "value" in (record.serviceId as Record<string, unknown>)) {
    summarized.serviceId = (record.serviceId as Record<string, unknown>).value;
  }
  if ("resourceId" in record && typeof record.resourceId === "object" && record.resourceId && "value" in (record.resourceId as Record<string, unknown>)) {
    summarized.resourceId = (record.resourceId as Record<string, unknown>).value;
  }
  if ("range" in record) summarized.range = record.range;
  if ("lifecycle" in record) summarized.lifecycle = summarizeSchedulingPayload(record.lifecycle);
  if ("booking" in record) summarized.booking = summarizeSchedulingPayload(record.booking);
  return Object.keys(summarized).length ? summarized : record;
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

async function clickActionAndWaitForPost(page: Page, testId: string, endpoint: string) {
  const response = page.waitForResponse(
    (candidate) => candidate.request().method() === "POST" && candidate.url().includes(endpoint),
  );
  // The non-interactive debug overlay leaves this lower-page action outside
  // Playwright's viewport hit target. Dispatch the normal DOM click, as the
  // existing smoke helper does, while still waiting for its network result.
  await page.getByTestId(testId).evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  return response;
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
