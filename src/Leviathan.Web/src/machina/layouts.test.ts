import { describe, expect, it } from "vitest";
import { createInitialShellState } from "./shellState";
import { buildRustSimulatorLayout, getShellRemainingHeight } from "./layouts";

function fixedFrame(
  rows: ReturnType<typeof buildRustSimulatorLayout>["rows"],
  id: string,
) {
  const row = rows.find((entry) => entry.id === id);
  expect(row?.frame.kind).toBe("fixed");
  return row?.frame.kind === "fixed" ? row.frame : null;
}

describe("rust simulator layout geometry", () => {
  it("keeps the wide side panel aligned to the resolved content stack height", () => {
    const rootRect = { x: 0, y: 0, width: 1440, height: 1024 };
    const state = createInitialShellState("rust-simulator");
    const { rows } = buildRustSimulatorLayout(rootRect, state, false);
    const sidePanel = fixedFrame(rows, "side-panel");

    expect(getShellRemainingHeight(rootRect, 76)).toBe(948);
    expect(sidePanel).toMatchObject({
      kind: "fixed",
      width: 360,
      height: 916,
    });
  });

  it("keeps the narrow side panel width and height on the legacy phone capture path", () => {
    const rootRect = { x: 0, y: 0, width: 700, height: 844 };
    const state = createInitialShellState("rust-simulator");
    const { rows } = buildRustSimulatorLayout(rootRect, state, false);
    const sidePanel = fixedFrame(rows, "side-panel");

    expect(sidePanel).toMatchObject({
      kind: "fixed",
      width: 668,
      height: 354,
    });
  });
});
