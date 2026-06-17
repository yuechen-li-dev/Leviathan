import type { LayoutRow, Rect } from "machinalayout";
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
  const inspectorHeight = inspectorEnabled ? Math.min(320, Math.max(230, rootRect.height * 0.36)) : 0;
  const contentHeight = Math.max(240, rootRect.height - heroHeight - inspectorHeight);
  const sidebarWidth = Math.min(420, Math.max(320, Math.round(rootRect.width * 0.31)));
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
        arrange: {
          kind: "stack",
          axis: wide ? "horizontal" : "vertical",
          gap: 14,
          padding: 16,
        },
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
          ? { kind: "fixed", width: sidebarWidth, height: Math.max(220, contentHeight - 32) }
          : { kind: "fixed", width: Math.max(320, rootRect.width - 32), height: narrowSidebarHeight },
        view: "schedulingSidebar",
        debugLabel: wide ? "Scheduling demo sidebar" : "Scheduling demo footer rail",
      },
      ...(inspectorEnabled
        ? [
            {
              id: "debug-inspector",
              parent: "root",
              frame: { kind: "fixed" as const, width: rootRect.width, height: Math.min(320, Math.max(230, rootRect.height * 0.36)) },
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
