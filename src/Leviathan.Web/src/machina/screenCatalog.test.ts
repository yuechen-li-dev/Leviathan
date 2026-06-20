import { describe, expect, it } from "vitest";
import {
  createLeviathanHandoffMetadata,
  createLeviathanScreenTasks,
  getLeviathanScreen,
  getLeviathanScreenMetadata,
  leviathanViewports,
  routeWithDebugOverlay,
} from "./screenCatalog";

describe("screen catalog", () => {
  it("expands to the same legacy screen and viewport coverage", () => {
    const tasks = createLeviathanScreenTasks();

    expect(tasks.map((task) => `${task.screenKey}-${task.viewportKey}`)).toEqual([
      "apps-route-desktop",
      "apps-route-tablet",
      "apps-route-phone",
      "scheduling-landing-desktop",
      "scheduling-landing-tablet",
      "scheduling-landing-phone",
      "provider-setup-desktop",
      "provider-setup-phone",
      "public-booking-desktop",
      "public-booking-tablet",
      "public-booking-phone",
      "booking-confirmation-desktop",
      "booking-confirmation-tablet",
      "booking-confirmation-phone",
      "cancelled-rescheduled-desktop",
      "payment-required-desktop",
      "notification-summary-desktop",
    ]);

    expect(leviathanViewports).toEqual([
      expect.objectContaining({ key: "desktop", width: 1440, height: 1024 }),
      expect.objectContaining({ key: "tablet", width: 768, height: 1024 }),
      expect.objectContaining({ key: "phone", width: 390, height: 844 }),
    ]);
  });

  it("preserves legacy artifact base names while adding catalog metadata", () => {
    const screen = getLeviathanScreen("public-booking");
    const metadata = getLeviathanScreenMetadata(screen);
    const task = createLeviathanScreenTasks().find((entry) => entry.key === "public-booking__phone");

    expect(screen.title).toBe("Public booking");
    expect(screen.fixture).toBe("public-booking");
    expect(metadata).toMatchObject({
      productArea: "scheduling",
      captureSource: "fixture-or-live",
      supportsLiveRoute: true,
      artifactBaseName: "public-booking",
      expectedHeading: "Choose a date and time",
      expectedNodeIdsByViewport: {
        phone: expect.arrayContaining([
          "booking-header-mobile",
          "booking-root-vertical",
          "booking-mobile-summary-card",
          "booking-mobile-calendar-card",
        ]),
      },
    });
    expect(task).toMatchObject({
      artifactBaseName: "public-booking__phone",
      tags: ["scheduling", "fixture", "mocked", "booking", "phone", "mobile"],
    });
    expect(createLeviathanHandoffMetadata(task!)).toMatchObject({
      screenTitle: "Public booking",
      legacyArtifactBaseName: "public-booking",
      debugOverlayMode: "nonInteractiveOverlay",
      taskKey: "public-booking__phone",
    });
  });

  it("tracks provider setup through the new guided setup regions", () => {
    const screen = getLeviathanScreen("provider-setup");
    const metadata = getLeviathanScreenMetadata(screen);
    const phoneTask = createLeviathanScreenTasks().find((entry) => entry.key === "provider-setup__phone");

    expect(metadata).toMatchObject({
      artifactBaseName: "provider-setup",
      expectedNodeIds: expect.arrayContaining([
        "provider-setup-root",
        "provider-setup-hero",
        "provider-setup-warning",
        "provider-setup-steps",
        "provider-setup-form",
        "provider-setup-preview",
        "provider-setup-result",
      ]),
    });
    expect(phoneTask).toMatchObject({
      artifactBaseName: "provider-setup__phone",
      tags: ["scheduling", "fixture", "mocked", "setup", "phone", "mobile"],
    });
  });

  it("adds snapshot overlay routes without renaming the underlying task artifacts", () => {
    expect(routeWithDebugOverlay("/apps?debug=1", "nonInteractiveOverlay")).toBe(
      "/apps?debug=1&debugOverlay=nonInteractiveOverlay",
    );
    expect(routeWithDebugOverlay("/apps?debug=1")).toBe("/apps?debug=1");
  });
});
