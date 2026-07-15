import { describe, expect, it } from "vitest";
import { Atlas } from "machinalayout/atlas";
import { Table } from "machinalayout/table";
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

  it("maps each post-M4 surface to its owning directory and preserves the shell/layout boundary", () => {
    expect(SchedulingAtlas.sections.find((s) => s.key === "setup")?.file).toBe("setup/");
    expect(SchedulingAtlas.sections.find((s) => s.key === "front-page")?.file).toBe("landing/");
    expect(SchedulingAtlas.sections.find((s) => s.key === "public-booking")?.file).toBe("publicBooking/");
    expect(SchedulingAtlas.sections.find((s) => s.key === "confirmation")?.file).toBe("confirmation/");
    expect(SchedulingAtlas.sections.find((s) => s.key === "bookings")?.file).toBe("bookings/");
    expect(SchedulingAtlas.sections.find((s) => s.key === "shared-shell")?.file).toBe("views.tsx; layouts.ts");
  });

  it("M3.5: table-authored form actually catches malformed cells - the thing hand-written object literals never did across M1-M3's stale-note fixes", () => {
    // "surface" isn't one of the declared MachinaAtlasSectionKind values -
    // exactly the kind of typo that would have silently produced a
    // slightly-wrong runtime object in the old hand-written array.
    expect(() =>
      Table.defineWithSchema({
        id: "brokenAtlas",
        schema: Atlas.sectionTableSchema(),
        columns: {
          key: ["setup", "confirmation"],
          name: ["Provider setup wizard", "Booking confirmation"],
          kind: ["page", "surface" as unknown as "page"],
          route: [undefined, undefined],
          file: [undefined, undefined],
          fixture: [undefined, undefined],
          owns: [[], []],
          uses: [[], []],
          usedBy: [[], []],
          tags: [[], []],
          notes: [undefined, undefined],
        },
      }),
    ).toThrowError(/InvalidTableEnumValue.*brokenAtlas\.kind/s);
  });
});
