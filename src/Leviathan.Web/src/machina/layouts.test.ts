import { describe, expect, test } from "vitest";
import {
  getRemainingStackRect,
  getStackContentRect,
  getStackMainAxisMetrics,
  resolveLayoutRows,
} from "machinalayout";
import { resolveSchedulingFixtureScenario } from "../apps/scheduling/fixtures";
import {
  buildSchedulingLayout,
  getSchedulingInspectorHeight,
  getSchedulingRemainingHeight,
} from "../apps/scheduling/layouts";
import { buildRustSimulatorLayout, getShellRemainingHeight } from "./layouts";
import type { ShellState } from "./types";

const rootRect = { x: 0, y: 0, width: 1440, height: 1024 };

describe("Machina 0.3 stack geometry adoption", () => {
  test("keeps Scheduling content sizing equivalent while exposing stack metrics", () => {
    const inspectorHeight = getSchedulingInspectorHeight(rootRect, true);
    expect(getSchedulingRemainingHeight(rootRect, 168, inspectorHeight)).toBe(536);
    const doc = buildSchedulingLayout(
      rootRect,
      resolveSchedulingFixtureScenario({
        pathname: "/apps/scheduling",
        search: "?fixture=landing",
      } as Location),
      true,
    );
    const layout = resolveLayoutRows(doc.rows, rootRect);
    const contentRect = getStackContentRect(layout, "scheduling-content");
    expect(contentRect).toMatchObject({ x: 16, y: 184, width: 1408, height: 504 });
    expect(getStackMainAxisMetrics(layout, "scheduling-content").gap).toBe(14);
    expect(
      getRemainingStackRect(layout, {
        parentId: "root",
        afterChildren: ["scheduling-hero"],
        beforeChildren: ["debug-inspector"],
      }),
    ).toMatchObject({ y: 168, height: 536 });
  });

  test("keeps RustSimulator side panel sizing equivalent while using content rect helper", () => {
    const state: ShellState = {
      route: "rust-simulator",
      apps: [],
      status: "idle",
      screen: null,
      textInput: "",
      error: null,
      requestedSessionId: null,
    };
    expect(getShellRemainingHeight(rootRect, 76)).toBe(948);
    const doc = buildRustSimulatorLayout(rootRect, state, false);
    const layout = resolveLayoutRows(doc.rows, rootRect);
    expect(getStackContentRect(layout, "rust-content")).toMatchObject({
      x: 16,
      y: 92,
      width: 1408,
      height: 916,
    });
    expect(layout.nodes["side-panel"]?.rect.height).toBe(916);
  });
});
