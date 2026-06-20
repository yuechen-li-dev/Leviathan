import { describe, expect, it } from "vitest";
import { resolveSchedulingFixtureScenario } from "./fixtures";
import { buildSchedulingLayout } from "./layouts";

const landingScenario = resolveSchedulingFixtureScenario({
  pathname: "/apps/scheduling",
  search: "?fixture=landing",
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
});
