import {
  getArrangeContentRect,
  getRemainingStackRect,
  getStackContentRect,
  getStackMainAxisMetrics,
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
  viewData: {
    schedulingHero: { scenario: SchedulingFixtureScenario };
    schedulingMain: { scenario: SchedulingFixtureScenario };
    schedulingSidebar: { scenario: SchedulingFixtureScenario };
  };
} => {
  const wide = rootRect.width >= 1080;
  const heroHeight = rootRect.width >= 720 ? 168 : 208;
  const inspectorHeight = inspectorEnabled ? Math.min(320, Math.max(230, rootRect.height * 0.36)) : 0;
  const shellRows = buildSchedulingShellRows(rootRect, heroHeight, inspectorHeight, wide);
  const shellLayout = resolveLayoutRows(shellRows, rootRect);
  const rootMetrics = getStackMainAxisMetrics(shellLayout, "root");
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
  const contentHeight =
    rootMetrics.childMetrics.find((child) => child.id === "scheduling-content")?.mainSize ?? contentRect.height;
  const contentChromeHeight = contentRect.height - contentStackRect.height;
  const sidebarWidth = Math.min(420, Math.max(320, Math.round(rootRect.width * 0.31)));
  const narrowSidebarHeight = Math.max(160, Math.min(280, Math.round(contentHeight * 0.38)));

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
          ? { kind: "fixed", width: sidebarWidth, height: Math.max(220, contentHeight - contentChromeHeight) }
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
