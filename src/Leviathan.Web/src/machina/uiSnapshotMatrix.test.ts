import { describe, expect, test } from "vitest";
import { snapshotCases } from "../../tests/support/uiSnapshotMatrix";

describe("Machina viewport matrix snapshot metadata", () => {
  test("preserves the M25 route, fixture, viewport, and artifact name coverage", () => {
    expect(snapshotCases.map((snapshotCase) => snapshotCase.name)).toEqual([
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
    expect(snapshotCases.map(({ route, viewport }) => ({ route, viewport }))).toContainEqual({
      route: "/book/demo-provider?debug=1&fixture=public-booking",
      viewport: { width: 390, height: 844 },
    });
  });
});
