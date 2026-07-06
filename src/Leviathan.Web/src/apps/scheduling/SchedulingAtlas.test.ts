import { describe, expect, it } from "vitest";
import { SchedulingAtlas } from "./SchedulingAtlas";

describe("SchedulingAtlas", () => {
  it("validates via defineMachinaAtlas without throwing and preserves section order", () => {
    expect(SchedulingAtlas.app).toBe("Scheduling");
    expect(SchedulingAtlas.sections.map((s) => s.key)).toEqual([
      "setup",
      "shared-format",
      "shared-live-context",
      "shared-admin-gate-banner",
      "shared-status-chip",
      "shared-booking-meta-panels",
      "shared-booking-status-summary",
      "front-page",
      "public-booking",
      "confirmation",
      "bookings",
      "shared-shell",
    ]);
  });

  it("the setup section (M0's actual deliverable) is fully described, not a placeholder", () => {
    const setup = SchedulingAtlas.sections.find((s) => s.key === "setup");
    expect(setup?.owns).toContain("LiveProviderSetupView");
    expect(setup?.tags).toContain("deusmachina");
  });

  it("the bookings section reflects the M2.5 async task port, not a deferred TODO anymore", () => {
    const bookings = SchedulingAtlas.sections.find((s) => s.key === "bookings");
    expect(bookings?.owns).toContain("LiveProviderBookingsView");
    expect(bookings?.owns).toContain("cancelBookingTask");
    expect(bookings?.tags).toContain("async");
  });

  it("the confirmation section (M2's deliverable) reflects the real DeusMachina + async port", () => {
    const confirmation = SchedulingAtlas.sections.find((s) => s.key === "confirmation");
    expect(confirmation?.owns).toContain("createRescheduleMachine");
    expect(confirmation?.owns).toContain("confirmReplacementTask");
    expect(confirmation?.owns).toContain("getBookingForConfirmationTask");
    expect(confirmation?.tags).toEqual(expect.arrayContaining(["deusmachina", "async"]));
  });

  it("the setup section reflects M2.5's async task port on top of M0's Deus port", () => {
    const setup = SchedulingAtlas.sections.find((s) => s.key === "setup");
    expect(setup?.owns).toContain("createProviderTask");
    expect(setup?.tags).toEqual(expect.arrayContaining(["deusmachina", "async"]));
  });

  it("the public-booking section (M3's deliverable) reflects the real DeusMachina + async port and the dead-code deletion", () => {
    const publicBooking = SchedulingAtlas.sections.find((s) => s.key === "public-booking");
    expect(publicBooking?.owns).toContain("createPublicBookingMachine");
    expect(publicBooking?.owns).not.toContain("PublicBookingFlowView");
    expect(publicBooking?.owns).not.toContain("LivePublicBookingView");
    expect(publicBooking?.tags).toEqual(expect.arrayContaining(["deusmachina", "async"]));
  });
});
