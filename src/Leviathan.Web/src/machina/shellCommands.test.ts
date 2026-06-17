import { describe, expect, it } from "vitest";
import { commandForEvent } from "./shellCommands";

describe("shell command boundaries", () => {
  it("keeps scheduling open-app local to the frontend shell", () => {
    expect(commandForEvent({ type: "open-app", appId: "scheduling" })).toBe(false);
  });

  it("still treats RustSimulator as session-backed", () => {
    expect(commandForEvent({ type: "open-app", appId: "rust_simulator" })).toBe(true);
    expect(commandForEvent({ type: "open-rust-simulator-app", source: "boot" })).toBe(true);
  });
});
