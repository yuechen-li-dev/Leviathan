import {
  getArrangeContentRect,
  type LayoutRow,
  type Rect,
  type StackArrange,
} from "machinalayout";
import type { SchedulingFixtureScenario } from "./fixtures";

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
  const inspectorHeight = getSchedulingInspectorHeight(rootRect, inspectorEnabled);
  const contentHeight = getSchedulingRemainingHeight(rootRect, heroHeight, inspectorHeight);
  const sidebarWidth = Math.min(420, Math.max(320, Math.round(rootRect.width * 0.31)));
  const contentArrange: StackArrange = {
    kind: "stack",
    axis: wide ? "horizontal" : "vertical",
    gap: 14,
    padding: 16,
  };
  const contentRect = getArrangeContentRect(
    { x: 0, y: heroHeight, width: rootRect.width, height: contentHeight },
    contentArrange,
  );
  const narrowSidebarHeight = Math.max(160, Math.min(280, Math.round(contentHeight * 0.38)));

  return {
    rows: [
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
        view: "schedulingHero",
        debugLabel: `Scheduling hero ${scenario.key}`,
      },
      {
        id: "scheduling-content",
        parent: "root",
        frame: { kind: "fill", weight: 1, cross: "fill" },
        arrange: contentArrange,
        debugLabel: wide ? "Scheduling content wide split" : "Scheduling content narrow stack",
      },
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
          ? { kind: "fixed", width: sidebarWidth, height: Math.max(220, contentRect.height) }
          : { kind: "fixed", width: Math.max(320, contentRect.width), height: narrowSidebarHeight },
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
