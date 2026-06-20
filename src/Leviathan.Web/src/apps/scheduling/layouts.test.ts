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
});
