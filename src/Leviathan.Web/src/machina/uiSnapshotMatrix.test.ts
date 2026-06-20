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
      "public-booking-desktop",
      "public-booking-tablet",
      "public-booking-phone",
      "booking-confirmation-desktop",
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

    expect(publicBookingPhone).toMatchObject({
      name: "public-booking-phone",
      taskKey: "public-booking__phone",
      artifactBaseName: "public-booking__phone",
      route: "/book/demo-provider?debug=1&fixture=public-booking",
      expectedText: "Controlled states",
      expectedMachinaRoute: "scheduling",
      task: expect.objectContaining({
        screenKey: "public-booking",
        viewportKey: "phone",
      }),
    });
  });
});
