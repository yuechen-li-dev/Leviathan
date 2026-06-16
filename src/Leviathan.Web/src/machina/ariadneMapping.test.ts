import { describe, expect, it } from "vitest";
import { actionEventForKey, mapPrompt } from "./ariadneMapping";
import type { AriadneScreenDto } from "./types";

const base = (prompt: AriadneScreenDto["prompt"]): AriadneScreenDto => ({
  sessionId: "s1",
  title: "Rust Simulator",
  revision: 7,
  isComplete: false,
  error: null,
  transcript: [],
  prompt,
});

describe("Ariadne prompt mapping", () => {
  it("rejects stale or invalid prompt action mapping by not emitting unknown choice events", () => {
    const event = actionEventForKey(base({ id: "p1", kind: "choice", text: "Pick", choices: [{ key: "a", text: "A" }] }), "missing");
    expect(event).toBeNull();
  });

  it("maps advance prompts to dispatch events", () => {
    const prompt = mapPrompt(base({ id: "p1", kind: "line", text: "Continue?", choices: [] }));
    expect(prompt.actions[0]).toMatchObject({ kind: "advance", event: { type: "advance-prompt", promptId: "p1", revision: 7 } });
  });

  it("maps choice prompts to dispatch events", () => {
    const prompt = mapPrompt(base({ id: "p2", kind: "choice", text: "Pick", choices: [{ key: "left", text: "Left" }] }));
    expect(prompt.actions[0]).toMatchObject({ kind: "choice", key: "left", event: { type: "choose-option", promptId: "p2", revision: 7, choiceKey: "left" } });
  });

  it("maps input prompts to dispatch events", () => {
    const prompt = mapPrompt(base({ id: "p3", kind: "text-input", text: "Name?", choices: [] }));
    const action = prompt.actions[0];
    expect(action.kind).toBe("text-input");
    if (action.kind === "text-input") {
      expect(action.eventForText("Ferris")).toEqual({ type: "submit-text-input", promptId: "p3", revision: 7, text: "Ferris" });
    }
  });
});
