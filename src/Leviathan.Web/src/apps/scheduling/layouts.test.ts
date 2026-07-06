import { describe, expect, it } from "vitest";
import { resolveLayoutRows } from "machinalayout";
import { resolveSchedulingFixtureScenario } from "./fixtures";
import {
  buildPublicBookingHorizontalLayout,
  buildPublicBookingVerticalLayout,
  buildSchedulingLayout,
  getPublicBookingLayoutMode,
  publicBookingVerticalBreakpoint,
} from "./layouts";

const landingScenario = resolveSchedulingFixtureScenario({
  pathname: "/apps/scheduling",
  search: "?fixture=landing",
} as Location);
const bookingScenario = resolveSchedulingFixtureScenario({
  pathname: "/book/demo-provider",
  search: "?fixture=public-booking",
} as Location);
const setupScenario = resolveSchedulingFixtureScenario({
  pathname: "/apps/scheduling/setup",
  search: "?fixture=provider-setup",
} as Location);
const confirmationScenario = resolveSchedulingFixtureScenario({
  pathname: "/book/demo-provider/confirmed/book_demo_confirmed",
  search: "?fixture=booking-confirmation",
} as Location);
const bookingsScenario = resolveSchedulingFixtureScenario({
  pathname: "/apps/scheduling/bookings",
  search: "?fixture=notification-summary",
} as Location);

function fixedFrame(
  rows: ReturnType<typeof buildSchedulingLayout>["rows"],
  id: string,
) {
  const row = rows.find((entry) => entry.id === id);
  expect(row?.frame.kind).toBe("fixed");
  return row?.frame.kind === "fixed" ? row.frame : null;
}

describe("scheduling layout geometry", () => {
  it("keeps the wide sidebar aligned to the resolved content stack height", () => {
    const rootRect = { x: 0, y: 0, width: 1440, height: 1024 };
    const { rows } = buildSchedulingLayout(rootRect, landingScenario, true);
    const sidebar = fixedFrame(rows, "scheduling-sidebar");

    expect(sidebar).toMatchObject({
      kind: "fixed",
      width: 420,
    });
    expect(sidebar?.height).toBe(504);
  });

  it("keeps the narrow sidebar width and height on the legacy phone capture path", () => {
    const rootRect = { x: 0, y: 0, width: 390, height: 844 };
    const { rows } = buildSchedulingLayout(rootRect, landingScenario, true);
    const sidebar = fixedFrame(rows, "scheduling-sidebar");

    expect(sidebar).toMatchObject({
      kind: "fixed",
      width: 358,
      height: 160,
    });
  });

  it("adds explicit Machina booking regions for the public booking desktop surface", () => {
    const rootRect = { x: 0, y: 0, width: 1440, height: 1024 };
    const { rows } = buildSchedulingLayout(rootRect, bookingScenario, false);

    expect(rows.map((row) => row.id)).toEqual(
      expect.arrayContaining([
        "booking-header",
        "booking-root-horizontal",
        "booking-summary-panel",
        "booking-main-panel",
        "booking-main-header",
        "booking-calendar-region",
        "booking-slots-region",
        "booking-footer-summary",
      ]),
    );
  });

  it("resolves the guided setup surface through a single rendered slot (M0: dead sub-rows removed)", () => {
    const rootRect = { x: 0, y: 0, width: 1440, height: 1024 };
    const { rows } = buildSchedulingLayout(rootRect, setupScenario, false);

    expect(rows.map((row) => row.id)).toEqual(expect.arrayContaining(["scheduling-main", "provider-setup-root"]));
    // M0 finding: the pre-rewrite version of this branch also emitted
    // provider-setup-hero/-warning/-steps/-form/-preview/-result as
    // absolute-positioned rows, computed from ~40 lines of cascading pixel
    // math, but never assigned any of them a `view` - nothing ever rendered
    // through them. ProviderSetupFlow renders as one Tailwind-laid-out tree
    // inside provider-setup-root's single "schedulingMain" slot. Removed as
    // dead code; asserting their absence here so they don't quietly come
    // back in a future edit.
    expect(rows.map((row) => row.id)).not.toEqual(
      expect.arrayContaining([
        "provider-setup-hero",
        "provider-setup-warning",
        "provider-setup-steps",
        "provider-setup-form",
        "provider-setup-preview",
        "provider-setup-result",
      ]),
    );
    const root = rows.find((row) => row.id === "provider-setup-root");
    expect(root?.view).toBe("schedulingMain");
    expect(root?.frame).toMatchObject({ kind: "fixed" });
    expect(() => resolveLayoutRows(rows, rootRect)).not.toThrow();
  });

  it("resolves the public booking layout without Machina overflow", () => {
    const rootRect = { x: 0, y: 0, width: 1440, height: 1024 };
    const { rows } = buildSchedulingLayout(rootRect, bookingScenario, false);
    expect(() => resolveLayoutRows(rows.slice(0, 5), rootRect)).not.toThrow();
    expect(() => resolveLayoutRows(rows.slice(0, 8), rootRect)).not.toThrow();
    expect(() => resolveLayoutRows(rows.slice(0, 9), rootRect)).not.toThrow();
    expect(() => resolveLayoutRows(rows, rootRect)).not.toThrow();
  });

  it("uses a simple width breakpoint to choose the vertical booking layout", () => {
    expect(getPublicBookingLayoutMode({ x: 0, y: 0, width: publicBookingVerticalBreakpoint - 1, height: 844 })).toBe("vertical");
    expect(getPublicBookingLayoutMode({ x: 0, y: 0, width: publicBookingVerticalBreakpoint, height: 844 })).toBe("horizontal");
  });

  it("builds the horizontal public booking layout for desktop and tablet-like widths", () => {
    const desktopRows = buildPublicBookingHorizontalLayout({ x: 0, y: 0, width: 1440, height: 1024 }, bookingScenario, false).rows;
    const tabletRows = buildSchedulingLayout({ x: 0, y: 0, width: 768, height: 1024 }, bookingScenario, false).rows;

    expect(desktopRows.map((row) => row.id)).toEqual(
      expect.arrayContaining([
        "booking-header",
        "booking-root-horizontal",
        "booking-summary-panel",
        "booking-main-panel",
        "booking-main-header",
        "booking-calendar-region",
        "booking-slots-region",
        "booking-footer-summary",
      ]),
    );
    expect(tabletRows.map((row) => row.id)).toContain("booking-root-horizontal");
  });

  it("keeps the horizontal public booking layout valid at compact desktop heights", () => {
    const rootRect = { x: 0, y: 0, width: 1280, height: 608 };
    expect(() => resolveLayoutRows(buildSchedulingLayout(rootRect, bookingScenario, false).rows, rootRect)).not.toThrow();
  });

  it("keeps the horizontal public booking layout valid when the docked inspector is open", () => {
    const rootRect = { x: 0, y: 0, width: 1280, height: 720 };
    expect(() => resolveLayoutRows(buildSchedulingLayout(rootRect, bookingScenario, true).rows, rootRect)).not.toThrow();
  });

  it("keeps the tablet public booking layout valid when the docked inspector is open", () => {
    const rootRect = { x: 0, y: 0, width: 768, height: 1024 };
    expect(() => resolveLayoutRows(buildSchedulingLayout(rootRect, bookingScenario, true).rows, rootRect)).not.toThrow();
  });

  it("builds the explicit vertical public booking layout for phone widths", () => {
    const rootRect = { x: 0, y: 0, width: 390, height: 844 };
    const { rows } = buildPublicBookingVerticalLayout(rootRect, bookingScenario, false);

    expect(rows.map((row) => row.id)).toEqual(
      expect.arrayContaining([
        "booking-header-mobile",
        "booking-root-vertical",
        "booking-mobile-summary-card",
        "booking-mobile-step-status",
        "booking-mobile-calendar-card",
        "booking-mobile-slots-card",
        "booking-mobile-intake-card",
        "booking-mobile-confirm-footer",
      ]),
    );
    expect(buildSchedulingLayout(rootRect, bookingScenario, false).rows.map((row) => row.id)).toContain("booking-root-vertical");
    expect(() => resolveLayoutRows(rows, rootRect)).not.toThrow();
    expect(() => resolveLayoutRows(buildSchedulingLayout(rootRect, bookingScenario, false).rows, rootRect)).not.toThrow();
  });

  it("resolves the confirmation surface through a single rendered slot (M2: dead sub-rows removed)", () => {
    const rootRect = { x: 0, y: 0, width: 1440, height: 1024 };
    const { rows } = buildSchedulingLayout(rootRect, confirmationScenario, false);

    expect(rows.map((row) => row.id)).toEqual(expect.arrayContaining(["scheduling-main", "booking-status-root"]));
    // M2 finding: same pattern M0/M1 already found (setup, then bookings) -
    // booking-status-hero/-details/-next-steps/-actions/-lifecycle and
    // booking-reschedule-root/-current/-picker/-replacement/-actions/
    // -result were eleven rows of computed geometry, never assigned a
    // `view`. ConfirmationView + BookingReschedulePanel render as one
    // Tailwind-laid-out tree inside the single "schedulingMain" slot.
    expect(rows.map((row) => row.id)).not.toEqual(
      expect.arrayContaining([
        "booking-status-hero",
        "booking-status-details",
        "booking-status-next-steps",
        "booking-status-actions",
        "booking-reschedule-root",
        "booking-reschedule-current",
        "booking-reschedule-picker",
        "booking-reschedule-replacement",
        "booking-reschedule-actions",
        "booking-reschedule-result",
        "booking-status-lifecycle",
      ]),
    );
    const root = rows.find((row) => row.id === "booking-status-root");
    expect(root?.view).toBe("schedulingMain");
    expect(root?.frame).toMatchObject({ kind: "fixed" });
    expect(() => resolveLayoutRows(rows, rootRect)).not.toThrow();
  });

  it("resolves the bookings surface through a single rendered slot (M1: dead sub-rows removed)", () => {
    const rootRect = { x: 0, y: 0, width: 1440, height: 1024 };
    const { rows } = buildSchedulingLayout(rootRect, bookingsScenario, false);

    expect(rows.map((row) => row.id)).toEqual(expect.arrayContaining(["scheduling-main", "provider-bookings-root"]));
    // M1 finding: the pre-rewrite version of this branch emitted
    // provider-bookings-list/-detail and booking-reschedule-root/-current/
    // -actions/-result as further rows, computed from providerListHeight/
    // providerDetailHeight/providerRescheduleHeight and three more absolute
    // splits, but never assigned any of them a `view` - nothing ever
    // rendered through them. Same pattern M0 found and removed in the setup
    // branch. Asserting their absence here so they don't quietly come back.
    expect(rows.map((row) => row.id)).not.toEqual(
      expect.arrayContaining([
        "provider-bookings-list",
        "provider-booking-detail",
        "booking-reschedule-root",
        "booking-reschedule-current",
        "booking-reschedule-actions",
        "booking-reschedule-result",
      ]),
    );
    const root = rows.find((row) => row.id === "provider-bookings-root");
    expect(root?.view).toBe("schedulingMain");
    expect(root?.frame).toMatchObject({ kind: "fixed" });
    expect(() => resolveLayoutRows(rows, rootRect)).not.toThrow();
  });
});
