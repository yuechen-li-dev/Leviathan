import { describe, expect, it } from "vitest";
import { routeFromPath } from "../../machina/browserHistoryAdapter";
import { reduceShellState } from "../../machina/shellDispatch";
import { createInitialShellState } from "../../machina/shellState";

describe("scheduling shell route", () => {
  it("generic open app dispatch handles Scheduling route", () => {
    const state = reduceShellState(createInitialShellState(), { type: "open-app", appId: "scheduling" });
    expect(state.route).toBe("scheduling");
  });
  it("browser route maps to scheduling", () => { expect(routeFromPath("/apps/scheduling/setup")).toBe("scheduling"); expect(routeFromPath("/book/demo")).toBe("scheduling"); });
});
