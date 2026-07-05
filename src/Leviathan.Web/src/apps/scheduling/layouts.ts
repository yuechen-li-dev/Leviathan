import {
  getArrangeContentRect,
  getRemainingStackRect,
  getStackContentRect,
  resolveLayoutRows,
  type LayoutRow,
  type Rect,
} from "machinalayout";
import { M } from "machinalayout/machina";
import type { SchedulingFixtureScenario } from "./fixtures";

const schedulingContentGap = 14;
const schedulingContentPadding = 16;
export const publicBookingVerticalBreakpoint = 768;

export type PublicBookingLayoutMode = "horizontal" | "vertical";

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
  const mainWidth = wide ? Math.max(340, contentAreaRect.width - sidebarWidth - schedulingContentGap) : Math.max(320, contentAreaRect.width);
  const mainHeight = wide ? Math.max(260, contentStackRect.height) : Math.max(260, contentAreaRect.height - narrowSidebarHeight - schedulingContentGap);
  const confirmationHeroHeight = Math.max(64, Math.min(96, Math.round(mainHeight * 0.16)));
  const confirmationDetailsHeight = Math.max(80, Math.min(120, Math.round(mainHeight * 0.22)));
  const confirmationNextStepsHeight = Math.max(72, Math.min(96, Math.round(mainHeight * 0.18)));
  const confirmationActionsHeight = Math.max(64, Math.min(84, Math.round(mainHeight * 0.14)));
  const confirmationGap = 12;
  const confirmationDetailsY = confirmationHeroHeight + confirmationGap;
  const confirmationNextStepsY = confirmationDetailsY + confirmationDetailsHeight + confirmationGap;
  const confirmationActionsY = confirmationNextStepsY + confirmationNextStepsHeight + confirmationGap;
  const confirmationRescheduleHeight = Math.max(168, Math.min(260, Math.round(mainHeight * 0.28)));
  const confirmationRescheduleY = confirmationActionsY + confirmationActionsHeight + confirmationGap;
  const confirmationLifecycleY = confirmationRescheduleY + confirmationRescheduleHeight + confirmationGap;
  const confirmationLifecycleHeight = Math.max(60, mainHeight - confirmationLifecycleY);
  const rescheduleCurrentHeight = Math.max(40, Math.round(confirmationRescheduleHeight * 0.18));
  const reschedulePickerHeight = Math.max(40, Math.round(confirmationRescheduleHeight * 0.22));
  const rescheduleReplacementHeight = Math.max(40, Math.round(confirmationRescheduleHeight * 0.2));
  const rescheduleActionsHeight = Math.max(34, Math.round(confirmationRescheduleHeight * 0.14));
  const rescheduleResultHeight = Math.max(34, confirmationRescheduleHeight - rescheduleCurrentHeight - reschedulePickerHeight - rescheduleReplacementHeight - rescheduleActionsHeight - confirmationGap * 4);
  const providerStackAvailableHeight = Math.max(400, mainHeight - 32);
  const providerExtraHeight = Math.max(0, providerStackAvailableHeight - 400);
  const providerListHeight = 160 + Math.round(providerExtraHeight * 0.5);
  const providerDetailHeight = 120 + Math.round(providerExtraHeight * 0.2);
  const providerRescheduleHeight = providerStackAvailableHeight - providerListHeight - providerDetailHeight;

  const mainSurfaceRows =
    scenario.surface === "setup"
      ? // M0 note: the old version of this branch computed six additional
        // absolute-positioned child rows here (hero/warning/steps/form/
        // preview/result, ~40 lines of cascading pixel math). None of them
        // were ever assigned a `view`, so nothing ever rendered through
        // them - ProviderSetupFlow renders as one Tailwind-laid-out tree
        // inside the single "schedulingMain" slot below. Removed as dead
        // code rather than ported; see the M0 writeup for the same pattern
        // still present (and still untouched, pending M2) in the
        // confirmation branch's `booking-status-*` rows just below.
        M.vstack(
          "scheduling-main",
          { parent: "scheduling-content", gap: 12, padding: 0, frame: { kind: "fill", weight: wide ? 5 : 1, cross: "fill" } },
          [M.node("provider-setup-root", { frame: { kind: "fixed", width: mainWidth, height: mainHeight }, view: "schedulingMain", debugLabel: "Provider setup root" })],
        ).rows()
      : scenario.surface === "confirmation"
      ? [
          {
            id: "scheduling-main",
            parent: "scheduling-content",
            frame: { kind: "fill" as const, weight: wide ? 5 : 1, cross: "fill" as const },
            arrange: { kind: "stack" as const, axis: "vertical" as const, gap: 12, padding: 0 },
            debugLabel: `${scenario.surface} main surface`,
          },
          {
            id: "booking-status-root",
            parent: "scheduling-main",
            frame: { kind: "fixed" as const, width: mainWidth, height: mainHeight },
            view: "schedulingMain",
            debugLabel: "Booking status root",
          },
          {
            id: "booking-status-hero",
            parent: "booking-status-root",
            frame: { kind: "absolute" as const, x: 0, y: 0, width: mainWidth, height: confirmationHeroHeight },
            debugLabel: "Booking status hero",
          },
          {
            id: "booking-status-details",
            parent: "booking-status-root",
            frame: { kind: "absolute" as const, x: 0, y: confirmationDetailsY, width: mainWidth, height: confirmationDetailsHeight },
            debugLabel: "Booking status details",
          },
          {
            id: "booking-status-next-steps",
            parent: "booking-status-root",
            frame: { kind: "absolute" as const, x: 0, y: confirmationNextStepsY, width: mainWidth, height: confirmationNextStepsHeight },
            debugLabel: "Booking status next steps",
          },
          {
            id: "booking-status-actions",
            parent: "booking-status-root",
            frame: { kind: "absolute" as const, x: 0, y: confirmationActionsY, width: mainWidth, height: confirmationActionsHeight },
            debugLabel: "Booking status actions",
          },
          {
            id: "booking-reschedule-root",
            parent: "booking-status-root",
            frame: { kind: "absolute" as const, x: 0, y: confirmationRescheduleY, width: mainWidth, height: confirmationRescheduleHeight },
            debugLabel: "Booking reschedule root",
          },
          {
            id: "booking-reschedule-current",
            parent: "booking-reschedule-root",
            frame: { kind: "absolute" as const, x: 0, y: 0, width: mainWidth, height: rescheduleCurrentHeight },
            debugLabel: "Booking reschedule current summary",
          },
          {
            id: "booking-reschedule-picker",
            parent: "booking-reschedule-root",
            frame: { kind: "absolute" as const, x: 0, y: rescheduleCurrentHeight + confirmationGap, width: mainWidth, height: reschedulePickerHeight },
            debugLabel: "Booking reschedule picker",
          },
          {
            id: "booking-reschedule-replacement",
            parent: "booking-reschedule-root",
            frame: { kind: "absolute" as const, x: 0, y: rescheduleCurrentHeight + reschedulePickerHeight + confirmationGap * 2, width: mainWidth, height: rescheduleReplacementHeight },
            debugLabel: "Booking reschedule replacement",
          },
          {
            id: "booking-reschedule-actions",
            parent: "booking-reschedule-root",
            frame: { kind: "absolute" as const, x: 0, y: rescheduleCurrentHeight + reschedulePickerHeight + rescheduleReplacementHeight + confirmationGap * 3, width: mainWidth, height: rescheduleActionsHeight },
            debugLabel: "Booking reschedule actions",
          },
          {
            id: "booking-reschedule-result",
            parent: "booking-reschedule-root",
            frame: { kind: "absolute" as const, x: 0, y: rescheduleCurrentHeight + reschedulePickerHeight + rescheduleReplacementHeight + rescheduleActionsHeight + confirmationGap * 4, width: mainWidth, height: rescheduleResultHeight },
            debugLabel: "Booking reschedule result",
          },
          {
            id: "booking-status-lifecycle",
            parent: "booking-status-root",
            frame: { kind: "absolute" as const, x: 0, y: confirmationLifecycleY, width: mainWidth, height: confirmationLifecycleHeight },
            debugLabel: "Booking status lifecycle",
          },
        ]
      : scenario.surface === "bookings"
        ? [
            {
              id: "scheduling-main",
              parent: "scheduling-content",
              frame: { kind: "fill" as const, weight: wide ? 5 : 1, cross: "fill" as const },
              arrange: { kind: "stack" as const, axis: "vertical" as const, gap: 16, padding: 0 },
              debugLabel: `${scenario.surface} main surface`,
            },
            {
              id: "provider-bookings-root",
              parent: "scheduling-main",
              frame: { kind: "fixed" as const, width: mainWidth, height: mainHeight },
              view: "schedulingMain",
              arrange: { kind: "stack" as const, axis: "vertical" as const, gap: 16, padding: 0 },
              debugLabel: "Provider bookings root",
            },
            {
              id: "provider-bookings-list",
              parent: "provider-bookings-root",
              frame: { kind: "fixed" as const, width: mainWidth, height: providerListHeight },
              debugLabel: "Provider bookings list",
            },
            {
              id: "provider-booking-detail",
              parent: "provider-bookings-root",
              frame: { kind: "fixed" as const, width: mainWidth, height: providerDetailHeight },
              debugLabel: "Provider booking detail",
            },
            {
              id: "booking-reschedule-root",
              parent: "provider-bookings-root",
              frame: { kind: "fixed" as const, width: mainWidth, height: providerRescheduleHeight },
              debugLabel: "Provider booking reschedule root",
            },
            {
              id: "booking-reschedule-current",
              parent: "booking-reschedule-root",
              frame: { kind: "absolute" as const, x: 0, y: 0, width: mainWidth, height: Math.max(40, Math.round(providerRescheduleHeight * 0.22)) },
              debugLabel: "Provider booking reschedule current",
            },
            {
              id: "booking-reschedule-actions",
              parent: "booking-reschedule-root",
              frame: { kind: "absolute" as const, x: 0, y: Math.max(48, Math.round(providerRescheduleHeight * 0.26)), width: mainWidth, height: Math.max(36, Math.round(providerRescheduleHeight * 0.18)) },
              debugLabel: "Provider booking reschedule actions",
            },
            {
              id: "booking-reschedule-result",
              parent: "booking-reschedule-root",
              frame: { kind: "absolute" as const, x: 0, y: Math.max(92, Math.round(providerRescheduleHeight * 0.5)), width: mainWidth, height: Math.max(48, Math.round(providerRescheduleHeight * 0.42)) },
              debugLabel: "Provider booking reschedule result",
            },
          ]
        : [
            {
              id: "scheduling-main",
              parent: "scheduling-content",
              frame: { kind: "fill" as const, weight: wide ? 5 : 1, cross: "fill" as const },
              view: "schedulingMain",
              debugLabel: `${scenario.surface} main surface`,
            },
          ];

  return {
    rows: [
      shellRows[0],
      { ...shellRows[1], view: "schedulingHero", debugLabel: `Scheduling hero ${scenario.key}` },
      shellRows[2],
      ...mainSurfaceRows,
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
  return getPublicBookingLayoutMode(rootRect) === "vertical"
    ? buildPublicBookingVerticalLayout(rootRect, scenario, inspectorEnabled)
    : buildPublicBookingHorizontalLayout(rootRect, scenario, inspectorEnabled);
}

export function getPublicBookingLayoutMode(rootRect: Rect): PublicBookingLayoutMode {
  return rootRect.width < publicBookingVerticalBreakpoint ? "vertical" : "horizontal";
}

export function buildPublicBookingHorizontalLayout(
  rootRect: Rect,
  scenario: SchedulingFixtureScenario,
  inspectorEnabled: boolean,
): {
  rows: LayoutRow[];
  viewData: Record<string, { scenario: SchedulingFixtureScenario }>;
} {
  const desktop = rootRect.width >= 1180;
  const stackedBody = rootRect.width < 960;
  const headerHeight = rootRect.width >= 720 ? 82 : 74;
  const inspectorHeight = getSchedulingInspectorHeight(rootRect, inspectorEnabled);
  const bookingRootPadding = rootRect.width < 1080 ? 16 : 20;
  const bookingRootGap = 20;
  const shellRows = [
    {
      id: "root",
      frame: { kind: "root" as const },
      arrange: { kind: "stack" as const, axis: "vertical" as const },
      debugLabel: `Scheduling booking horizontal shell ${rootRect.width}x${rootRect.height}`,
    },
    {
      id: "booking-header",
      parent: "root",
      frame: { kind: "fixed" as const, width: rootRect.width, height: headerHeight },
      view: "bookingHeader",
      debugLabel: "Public booking header",
    },
    {
      id: "booking-root-horizontal",
      parent: "root",
      frame: { kind: "fill" as const, weight: 1, cross: "fill" as const },
      arrange: {
        kind: "stack" as const,
        axis: "horizontal" as const,
        gap: bookingRootGap,
        padding: bookingRootPadding,
      },
      debugLabel: "Public booking horizontal root",
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
    axis: "horizontal",
    gap: bookingRootGap,
    padding: bookingRootPadding,
  });
  const summaryWidth = Math.min(372, Math.max(280, Math.round(bookingRootContentRect.width * 0.28)));
  const mainWidth = Math.max(340, bookingRootContentRect.width - summaryWidth - bookingRootGap - 12);
  const summaryHeight = Math.max(320, bookingRootContentRect.height - 1);
  const mainHeight = Math.max(320, bookingRootContentRect.height - 1);
  const compactHeight = bookingRootContentRect.height < 420;
  const mainHeaderHeight = compactHeight ? 84 : rootRect.width < 900 ? 96 : 104;
  const footerHeight = compactHeight ? 92 : rootRect.width < 900 ? 116 : 108;
  const bodyHeight = Math.max(160, mainHeight - mainHeaderHeight - footerHeight);
  const mainInnerWidth = Math.max(320, mainWidth - 12);
  const calendarWidth = Math.max(320, Math.round(mainInnerWidth * (desktop ? 0.54 : 0.5)));
  const slotsWidth = Math.min(440, Math.max(320, mainInnerWidth - calendarWidth - 16));
  const calendarHeight = stackedBody ? Math.max(180, Math.round(bodyHeight * 0.54)) : bodyHeight;
  const slotsHeight = stackedBody ? Math.max(120, bodyHeight - calendarHeight - 16) : bodyHeight;

  return {
    rows: [
      ...shellRows,
      {
        id: "booking-summary-panel",
        parent: "booking-root-horizontal",
        frame: { kind: "fixed", width: summaryWidth, height: summaryHeight },
        view: "bookingSummaryPanel",
        debugLabel: "Public booking summary panel",
      },
      {
        id: "booking-main-panel",
        parent: "booking-root-horizontal",
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
        arrange: { kind: "stack", axis: stackedBody ? "vertical" : "horizontal", gap: 16 },
        debugLabel: "Public booking calendar and slots body",
      },
      {
        id: "booking-calendar-region",
        parent: "booking-main-body",
        frame: stackedBody
          ? { kind: "fixed", width: mainInnerWidth, height: calendarHeight }
          : { kind: "fill", weight: 1, cross: "fill" },
        view: "bookingCalendarRegion",
        debugLabel: "Public booking calendar region",
      },
      {
        id: "booking-slots-region",
        parent: "booking-main-body",
        frame: stackedBody
          ? { kind: "fixed", width: mainInnerWidth, height: slotsHeight }
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

export function buildPublicBookingVerticalLayout(
  rootRect: Rect,
  scenario: SchedulingFixtureScenario,
  inspectorEnabled: boolean,
): {
  rows: LayoutRow[];
  viewData: Record<string, { scenario: SchedulingFixtureScenario }>;
} {
  const headerHeight = 82;
  const inspectorHeight = getSchedulingInspectorHeight(rootRect, inspectorEnabled);
  const shellRows = [
    {
      id: "root",
      frame: { kind: "root" as const },
      arrange: { kind: "stack" as const, axis: "vertical" as const },
      debugLabel: `Scheduling booking vertical shell ${rootRect.width}x${rootRect.height}`,
    },
    {
      id: "booking-header-mobile",
      parent: "root",
      frame: { kind: "fixed" as const, width: rootRect.width, height: headerHeight },
      view: "bookingMobileHeader",
      debugLabel: "Public booking mobile header",
    },
    {
      id: "booking-root-vertical",
      parent: "root",
      frame: { kind: "fill" as const, weight: 1, cross: "fill" as const },
      debugLabel: "Public booking vertical root",
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

  const bodyRect = getRemainingStackRect(resolveLayoutRows(shellRows, rootRect), {
    parentId: "root",
    afterChildren: ["booking-header-mobile"],
    beforeChildren: inspectorHeight > 0 ? ["debug-inspector"] : undefined,
  });
  const cardX = 12;
  const cardY = 12;
  const cardWidth = Math.max(320, bodyRect.width - 24);
  const gap = 12;
  const summaryHeight = 186;
  const stepHeight = 92;
  const calendarHeight = 402;
  const slotsHeight = 304;
  const intakeHeight = 448;
  const confirmHeight = 188;
  const stepY = cardY + summaryHeight + gap;
  const calendarY = stepY + stepHeight + gap;
  const slotsY = calendarY + calendarHeight + gap;
  const intakeY = slotsY + slotsHeight + gap;
  const confirmY = intakeY + intakeHeight + gap;

  return {
    rows: [
      ...shellRows,
      {
        id: "booking-mobile-summary-card",
        parent: "booking-root-vertical",
        frame: { kind: "absolute", x: cardX, y: cardY, width: cardWidth, height: summaryHeight },
        view: "bookingMobileSummaryCard",
        debugLabel: "Public booking mobile summary",
      },
      {
        id: "booking-mobile-step-status",
        parent: "booking-root-vertical",
        frame: { kind: "absolute", x: cardX, y: stepY, width: cardWidth, height: stepHeight },
        view: "bookingMobileStepStatus",
        debugLabel: "Public booking mobile step status",
      },
      {
        id: "booking-mobile-calendar-card",
        parent: "booking-root-vertical",
        frame: { kind: "absolute", x: cardX, y: calendarY, width: cardWidth, height: calendarHeight },
        view: "bookingMobileCalendarCard",
        debugLabel: "Public booking mobile calendar",
      },
      {
        id: "booking-mobile-slots-card",
        parent: "booking-root-vertical",
        frame: { kind: "absolute", x: cardX, y: slotsY, width: cardWidth, height: slotsHeight },
        view: "bookingMobileSlotsCard",
        debugLabel: "Public booking mobile slots",
      },
      {
        id: "booking-mobile-intake-card",
        parent: "booking-root-vertical",
        frame: { kind: "absolute", x: cardX, y: intakeY, width: cardWidth, height: intakeHeight },
        view: "bookingMobileIntakeCard",
        debugLabel: "Public booking mobile intake",
      },
      {
        id: "booking-mobile-confirm-footer",
        parent: "booking-root-vertical",
        frame: { kind: "absolute", x: cardX, y: confirmY, width: cardWidth, height: confirmHeight },
        view: "bookingMobileConfirmFooter",
        debugLabel: "Public booking mobile confirm footer",
      },
    ],
    viewData: {
      bookingMobileHeader: { scenario },
      bookingMobileSummaryCard: { scenario },
      bookingMobileStepStatus: { scenario },
      bookingMobileCalendarCard: { scenario },
      bookingMobileSlotsCard: { scenario },
      bookingMobileIntakeCard: { scenario },
      bookingMobileConfirmFooter: { scenario },
    },
  };
}
