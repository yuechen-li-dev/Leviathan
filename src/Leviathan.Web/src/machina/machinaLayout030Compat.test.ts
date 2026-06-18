import { describe, expect, test } from "vitest";
import {
  createViewportMatrix,
  defineMachinaScreens,
  expandScreenViewportTasks,
} from "machinalayout";

describe("MachinaLayout 0.3.0 compatibility", () => {
  test("exposes standard viewport and screen catalog helpers", () => {
    const screens = defineMachinaScreens([
      {
        key: "provider-setup",
        route: "/apps/scheduling/setup",
        fixture: "provider-setup",
        viewports: ["desktop", "phone"],
        tags: ["scheduling", "setup"],
      },
    ]);

    const tasks = expandScreenViewportTasks(
      screens,
      createViewportMatrix("standard-responsive"),
    );

    expect(tasks).toHaveLength(2);
    expect(tasks.map((task) => task.viewportKey)).toEqual(["desktop", "phone"]);
    expect(tasks.map((task) => task.artifactBaseName)).toEqual([
      "provider-setup__desktop",
      "provider-setup__phone",
    ]);
  });
});
