import { describe, expect, it } from "vitest";
import { reduceShellState } from "./shellDispatch";
import { createInitialShellState } from "./shellState";
import type { AriadneScreenDto } from "./types";

const screen: AriadneScreenDto = {
  sessionId: "s1",
  title: "Rust Simulator",
  revision: 2,
  isComplete: false,
  error: null,
  transcript: [],
  prompt: { id: "p1", kind: "line", text: "Go", choices: [] },
};

describe("shell dispatch transitions", () => {
  it("opening apps route sets route and loading status", () => {
    const next = reduceShellState(createInitialShellState("rust-simulator"), { type: "open-apps-list" });
    expect(next.route).toBe("apps");
    expect(next.status).toBe("loading-apps");
    expect(next.error).toBeNull();
  });

  it("opening RustSimulator route requests the app flow through command boundary", () => {
    const next = reduceShellState(createInitialShellState("apps"), { type: "open-rust-simulator-app" });
    expect(next.route).toBe("rust-simulator");
    expect(next.status).toBe("starting-session");
    expect(next.screen).toBeNull();
  });

  it("text input event updates shell state", () => {
    const next = reduceShellState(createInitialShellState(), { type: "set-text-input", text: "look" });
    expect(next.textInput).toBe("look");
  });

  it("successful Ariadne screen result updates session, screen, and status", () => {
    const next = reduceShellState(createInitialShellState("rust-simulator"), { type: "ariadne-session-started", screen });
    expect(next.screen?.sessionId).toBe("s1");
    expect(next.status).toBe("idle");
    expect(next.error).toBeNull();
  });

  it("API failure creates error state", () => {
    const next = reduceShellState(createInitialShellState(), { type: "api-failed", error: "boom" });
    expect(next.status).toBe("error");
    expect(next.error).toBe("boom");
  });
});
