import { describe, expect, it } from "vitest";
import { createUiSnapshotCases, uiSnapshotViewports } from "../../tests/support/uiSnapshotMatrix";

describe("UI snapshot task matrix", () => {
  it("preserves the legacy snapshot case names and viewport coverage", () => {
    const cases = createUiSnapshotCases();

    expect(cases.map((entry) => entry.name)).toEqual([
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

    expect(uiSnapshotViewports).toEqual([
      expect.objectContaining({ key: "desktop", width: 1440, height: 1024 }),
      expect.objectContaining({ key: "tablet", width: 768, height: 1024 }),
      expect.objectContaining({ key: "phone", width: 390, height: 844 }),
    ]);
  });

  it("keeps task metadata mapped back to stable artifact names and routes", () => {
    const cases = createUiSnapshotCases();
    const publicBookingPhone = cases.find((entry) => entry.name === "public-booking-phone");
    const appsRouteDesktop = cases.find((entry) => entry.name === "apps-route-desktop");

    expect(publicBookingPhone).toMatchObject({
      name: "public-booking-phone",
      taskKey: "public-booking__phone",
      artifactBaseName: "public-booking__phone",
      route: "/book/demo-provider?debug=1&fixture=public-booking&debugOverlay=nonInteractiveOverlay",
      expectedText: "Continue to confirmation",
      expectedMachinaRoute: "scheduling",
      tags: ["scheduling", "fixture", "mocked", "booking", "phone", "mobile"],
      metadata: {
        screenTitle: "Public booking",
        productArea: "scheduling",
        captureSource: "fixture-or-live",
        supportsLiveRoute: true,
        legacyArtifactBaseName: "public-booking",
        debugOverlayMode: "nonInteractiveOverlay",
        taskKey: "public-booking__phone",
      },
      task: expect.objectContaining({
        screenKey: "public-booking",
        viewportKey: "phone",
      }),
    });

    expect(appsRouteDesktop).toMatchObject({
      route: "/apps?debug=1&debugOverlay=nonInteractiveOverlay",
      metadata: {
        debugOverlayMode: "nonInteractiveOverlay",
      },
    });
  });
});
