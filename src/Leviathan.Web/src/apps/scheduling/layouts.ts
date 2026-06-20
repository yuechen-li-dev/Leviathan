import {
  getArrangeContentRect,
  getRemainingStackRect,
  getStackContentRect,
  resolveLayoutRows,
  type LayoutRow,
  type Rect,
} from "machinalayout";
import type { SchedulingFixtureScenario } from "./fixtures";

const schedulingContentGap = 14;
const schedulingContentPadding = 16;

function buildSchedulingShellRows(
  rootRect: Rect,
  heroHeight: number,
  inspectorHeight: number,
  wide: boolean,
): LayoutRow[] {
  return [
    {
      id: "root",
      frame: { kind: "root" },
      arrange: { kind: "stack", axis: "vertical" },
      debugLabel: `Scheduling shell ${rootRect.width}x${rootRect.height}`,
    },
    {
      id: "scheduling-hero",
      parent: "root",
      frame: { kind: "fixed", width: rootRect.width, height: heroHeight },
      debugLabel: "Scheduling shell hero region",
    },
    {
      id: "scheduling-content",
      parent: "root",
      frame: { kind: "fill", weight: 1, cross: "fill" },
      arrange: {
        kind: "stack",
        axis: wide ? "horizontal" : "vertical",
        gap: schedulingContentGap,
        padding: schedulingContentPadding,
      },
      debugLabel: wide ? "Scheduling content wide split" : "Scheduling content narrow stack",
    },
    ...(inspectorHeight > 0
      ? [
          {
            id: "debug-inspector",
            parent: "root",
            frame: { kind: "fixed" as const, width: rootRect.width, height: inspectorHeight },
            debugLabel: "Scheduling shell debug inspector region",
          },
        ]
      : []),
  ];
}

export const buildSchedulingLayout = (
  rootRect: Rect,
  scenario: SchedulingFixtureScenario,
  inspectorEnabled = false,
): {
  rows: LayoutRow[];
  viewData: Record<string, { scenario: SchedulingFixtureScenario }>;
} => {
  if (scenario.surface === "booking") {
    return buildPublicBookingLayout(rootRect, scenario, inspectorEnabled);
  }

  const wide = rootRect.width >= 1080;
  const heroHeight = rootRect.width >= 720 ? 168 : 208;
  const inspectorHeight = getSchedulingInspectorHeight(rootRect, inspectorEnabled);
  const shellRows = buildSchedulingShellRows(rootRect, heroHeight, inspectorHeight, wide);
  const shellLayout = resolveLayoutRows(shellRows, rootRect);
  const contentRect = getRemainingStackRect(shellLayout, {
    parentId: "root",
    afterChildren: ["scheduling-hero"],
    beforeChildren: inspectorHeight > 0 ? ["debug-inspector"] : undefined,
  });
  const contentStackRect = getStackContentRect(shellLayout, "scheduling-content");
  const contentAreaRect = getArrangeContentRect(contentRect, {
    kind: "stack",
    axis: wide ? "horizontal" : "vertical",
    gap: schedulingContentGap,
    padding: schedulingContentPadding,
  });
  const sidebarWidth = Math.min(420, Math.max(320, Math.round(rootRect.width * 0.31)));
  const narrowSidebarHeight = Math.max(160, Math.min(280, Math.round(contentRect.height * 0.38)));

  return {
    rows: [
      shellRows[0],
      { ...shellRows[1], view: "schedulingHero", debugLabel: `Scheduling hero ${scenario.key}` },
      shellRows[2],
      {
        id: "scheduling-main",
        parent: "scheduling-content",
        frame: { kind: "fill", weight: wide ? 5 : 1, cross: "fill" },
        view: "schedulingMain",
        debugLabel: `${scenario.surface} main surface`,
      },
      {
        id: "scheduling-sidebar",
        parent: "scheduling-content",
        frame: wide
          ? { kind: "fixed", width: sidebarWidth, height: Math.max(220, contentStackRect.height) }
          : { kind: "fixed", width: Math.max(320, contentAreaRect.width), height: narrowSidebarHeight },
        view: "schedulingSidebar",
        debugLabel: wide ? "Scheduling demo sidebar" : "Scheduling demo footer rail",
      },
      ...(inspectorEnabled
        ? [
            {
              id: "debug-inspector",
              parent: "root",
              frame: { kind: "fixed" as const, width: rootRect.width, height: inspectorHeight },
              view: "debugInspector",
              debugLabel: "M23 debug layout/state inspector",
            },
          ]
        : []),
    ],
    viewData: {
      schedulingHero: { scenario },
      schedulingMain: { scenario },
      schedulingSidebar: { scenario },
    },
  };
};

export const getSchedulingInspectorHeight = (rootRect: Rect, enabled: boolean): number =>
  enabled ? Math.min(320, Math.max(230, rootRect.height * 0.36)) : 0;

export const getSchedulingRemainingHeight = (
  rootRect: Rect,
  heroHeight: number,
  inspectorHeight: number,
): number =>
  Math.max(
    240,
    getArrangeContentRect(rootRect, { kind: "stack", axis: "vertical" }).height -
      heroHeight -
      inspectorHeight,
  );

function buildPublicBookingLayout(
  rootRect: Rect,
  scenario: SchedulingFixtureScenario,
  inspectorEnabled: boolean,
): {
  rows: LayoutRow[];
  viewData: Record<string, { scenario: SchedulingFixtureScenario }>;
} {
  const desktop = rootRect.width >= 1180;
  const stacked = rootRect.width < 900;
  const headerHeight = rootRect.width >= 720 ? 82 : 74;
  const inspectorHeight = getSchedulingInspectorHeight(rootRect, inspectorEnabled);
  const bookingRootPadding = rootRect.width < 640 ? 12 : 20;
  const bookingRootGap = 20;
  const shellRows = [
    {
      id: "root",
      frame: { kind: "root" as const },
      arrange: { kind: "stack" as const, axis: "vertical" as const },
      debugLabel: `Scheduling booking shell ${rootRect.width}x${rootRect.height}`,
    },
    {
      id: "booking-header",
      parent: "root",
      frame: { kind: "fixed" as const, width: rootRect.width, height: headerHeight },
      view: "bookingHeader",
      debugLabel: "Public booking header",
    },
    {
      id: "booking-root",
      parent: "root",
      frame: { kind: "fill" as const, weight: 1, cross: "fill" as const },
      arrange: {
        kind: "stack" as const,
        axis: stacked ? "vertical" : "horizontal",
        gap: bookingRootGap,
        padding: bookingRootPadding,
      },
      debugLabel: stacked ? "Public booking stacked body" : "Public booking two-column body",
    },
    ...(inspectorHeight > 0
      ? [
          {
            id: "debug-inspector",
            parent: "root",
            frame: { kind: "fixed" as const, width: rootRect.width, height: inspectorHeight },
            view: "debugInspector",
            debugLabel: "M23 debug layout/state inspector",
          },
        ]
      : []),
  ] satisfies LayoutRow[];

  const shellLayout = resolveLayoutRows(shellRows, rootRect);
  const bodyRect = getRemainingStackRect(shellLayout, {
    parentId: "root",
    afterChildren: ["booking-header"],
    beforeChildren: inspectorHeight > 0 ? ["debug-inspector"] : undefined,
  });
  const bookingRootContentRect = getArrangeContentRect(bodyRect, {
    kind: "stack",
    axis: stacked ? "vertical" : "horizontal",
    gap: bookingRootGap,
    padding: bookingRootPadding,
  });
  const summaryWidth = stacked
    ? Math.max(320, bookingRootContentRect.width)
    : Math.min(372, Math.max(300, Math.round(bookingRootContentRect.width * 0.28)));
  const mainWidth = stacked
    ? Math.max(320, bookingRootContentRect.width)
    : Math.max(320, bookingRootContentRect.width - summaryWidth - bookingRootGap - 12);
  const minimumMainHeight = 320;
  const desiredSummaryHeight = Math.max(120, Math.min(180, Math.round(bookingRootContentRect.height * 0.24)));
  const stackedSummaryHeight =
    bookingRootContentRect.height - desiredSummaryHeight - bookingRootGap < minimumMainHeight
      ? Math.max(160, bookingRootContentRect.height - minimumMainHeight - bookingRootGap)
      : desiredSummaryHeight;
  const summaryHeight = stacked ? stackedSummaryHeight : Math.max(420, bookingRootContentRect.height - 1);
  const mainHeight = stacked
    ? Math.max(260, bookingRootContentRect.height - summaryHeight - bookingRootGap)
    : Math.max(420, bookingRootContentRect.height - 1);
  const mainHeaderHeight = stacked ? 84 : 104;
  const footerHeight = stacked ? 76 : 108;
  const bodyHeight = stacked
    ? Math.max(220, mainHeight - mainHeaderHeight - footerHeight)
    : Math.max(320, mainHeight - mainHeaderHeight - footerHeight);
  const mainInnerWidth = Math.max(320, mainWidth - 12);
  const calendarWidth = stacked
    ? mainInnerWidth
    : Math.max(360, Math.round(mainInnerWidth * (desktop ? 0.54 : 0.5)));
  const slotsWidth = stacked ? mainInnerWidth : Math.min(440, Math.max(360, Math.round(mainInnerWidth * 0.38)));
  const calendarHeight = stacked ? 220 : bodyHeight;
  const slotsHeight = stacked ? Math.max(100, bodyHeight - calendarHeight) : bodyHeight;

  return {
    rows: [
      ...shellRows,
      {
        id: "booking-summary-panel",
        parent: "booking-root",
        frame: { kind: "fixed", width: summaryWidth, height: summaryHeight },
        view: "bookingSummaryPanel",
        debugLabel: "Public booking summary panel",
      },
      {
        id: "booking-main-panel",
        parent: "booking-root",
        frame: { kind: "fixed", width: mainWidth, height: mainHeight },
        arrange: { kind: "stack", axis: "vertical", gap: 0, padding: 0 },
        debugLabel: "Public booking main panel",
      },
      {
        id: "booking-main-header",
        parent: "booking-main-panel",
        frame: { kind: "fixed", width: mainInnerWidth, height: mainHeaderHeight },
        view: "bookingMainHeader",
        debugLabel: "Public booking main header",
      },
      {
        id: "booking-main-body",
        parent: "booking-main-panel",
        frame: { kind: "fixed", width: mainInnerWidth, height: bodyHeight },
        arrange: { kind: "stack", axis: stacked ? "vertical" : "horizontal", gap: stacked ? 0 : 16 },
        debugLabel: "Public booking calendar and slots body",
      },
      {
        id: "booking-calendar-region",
        parent: "booking-main-body",
        frame: stacked
          ? { kind: "fixed", width: calendarWidth, height: calendarHeight }
          : { kind: "fill", weight: 1, cross: "fill" },
        view: "bookingCalendarRegion",
        debugLabel: "Public booking calendar region",
      },
      {
        id: "booking-slots-region",
        parent: "booking-main-body",
        frame: stacked
          ? { kind: "fill", weight: 1, cross: "fill" }
          : { kind: "fixed", width: slotsWidth, height: slotsHeight },
        view: "bookingSlotsRegion",
        debugLabel: "Public booking slot and intake region",
      },
      {
        id: "booking-footer-summary",
        parent: "booking-main-panel",
        frame: { kind: "fixed", width: mainInnerWidth, height: footerHeight },
        view: "bookingFooterSummary",
        debugLabel: "Public booking footer summary",
      },
    ],
    viewData: {
      bookingHeader: { scenario },
      bookingSummaryPanel: { scenario },
      bookingMainHeader: { scenario },
      bookingCalendarRegion: { scenario },
      bookingSlotsRegion: { scenario },
      bookingFooterSummary: { scenario },
    },
  };
}
