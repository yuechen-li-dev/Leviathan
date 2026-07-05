import { describe, expect, it } from "vitest";
import { SchedulingAtlas } from "./SchedulingAtlas";

describe("SchedulingAtlas", () => {
  it("validates via defineMachinaAtlas without throwing and preserves section order", () => {
    expect(SchedulingAtlas.app).toBe("Scheduling");
    expect(SchedulingAtlas.sections.map((s) => s.key)).toEqual([
      "setup",
      "shared-format",
      "shared-live-context",
      "shared-admin-gate-banner",
      "front-page",
      "public-booking",
      "confirmation",
      "bookings",
      "shared-shell",
    ]);
  });

  it("the setup section (M0's actual deliverable) is fully described, not a placeholder", () => {
    const setup = SchedulingAtlas.sections.find((s) => s.key === "setup");
    expect(setup?.owns).toContain("LiveProviderSetupView");
    expect(setup?.tags).toContain("deusmachina");
  });
});
