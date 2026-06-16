import { describe, expect, it } from "vitest";
import { resolveLayoutRows } from "machinalayout";
import { buildAppsLayout } from "./layouts";
import { createInitialShellState } from "./shellState";
import { createDebugSnapshot, debugFlagFromLocation, DispatchHistoryBuffer, inspectLayout, inspectPromptMapping } from "./debugInspector";
import type { AriadneScreenDto } from "./types";

const storage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
    clear: () => data.clear(),
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() { return data.size; },
  } as Storage;
};

const screen: AriadneScreenDto = {
  sessionId: "s1",
  title: "Rust",
  revision: 7,
  isComplete: false,
  error: null,
  transcript: [{ id: "l1", speaker: null, text: "Wake up" }],
  prompt: { id: "p1", kind: "choice", text: "Pick", choices: [{ key: "a", text: "A" }] },
};

describe("debug inspector support", () => {
  it("parses and persists the debug flag", () => {
    const s = storage();
    expect(debugFlagFromLocation({ search: "?debug=1" } as Location, s)).toBe(true);
    expect(debugFlagFromLocation({ search: "" } as Location, s)).toBe(true);
    expect(debugFlagFromLocation({ search: "?debug=0" } as Location, s)).toBe(false);
    expect(debugFlagFromLocation({ search: "" } as Location, s)).toBe(false);
  });

  it("flattens resolved Machina layout nodes", () => {
    const doc = buildAppsLayout({ x: 0, y: 0, width: 800, height: 600 }, true);
    const layout = resolveLayoutRows(doc.rows, { x: 0, y: 0, width: 800, height: 600 });
    const nodes = inspectLayout(layout);
    expect(nodes.map((node) => node.id)).toContain("debug-inspector");
    expect(nodes.find((node) => node.id === "apps-list")?.parentId).toBe("root");
    expect(nodes.find((node) => node.id === "debug-inspector")?.viewKey).toBe("debugInspector");
  });

  it("keeps a bounded dispatch history with compact summaries", () => {
    const history = new DispatchHistoryBuffer();
    for (let i = 0; i < 45; i++) history.record({ type: "set-text-input", text: `value-${i}` });
    const events = history.snapshot();
    expect(events).toHaveLength(40);
    expect(events[0].sequence).toBe(6);
    expect(events.at(-1)?.summary).toEqual({ textLength: 8, hasText: true });
  });

  it("creates a compact diagnostic snapshot", () => {
    const state = { ...createInitialShellState("rust-simulator"), screen };
    const snapshot = createDebugSnapshot(state, [{ id: "root", rect: { x: 0, y: 0, width: 1, height: 1 }, order: 0, depth: 0 }], []);
    expect(snapshot.route).toBe("rust-simulator");
    expect(snapshot.currentScreenSummary).toMatchObject({ sessionId: "s1", revision: 7, transcriptCount: 1 });
    expect(snapshot.promptMapping).toMatchObject({ promptId: "p1", promptKind: "choice", revision: 7 });
  });

  it("exposes Ariadne prompt action dispatch mapping", () => {
    const mapping = inspectPromptMapping({ ...createInitialShellState("rust-simulator"), screen });
    expect(mapping?.actions[0]).toMatchObject({ kind: "choice", key: "a", dispatchEvent: { type: "choose-option", promptId: "p1", revision: 7, choiceKey: "a" } });
  });
});
