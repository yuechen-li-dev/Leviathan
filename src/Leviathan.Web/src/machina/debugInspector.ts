import type { ResolvedLayoutDocument } from "machinalayout";
import { mapPrompt } from "./ariadneMapping";
import type { LeviathanDispatch, ShellState } from "./types";

const DEBUG_STORAGE_KEY = "leviathan.debugInspector";
const MAX_EVENT_HISTORY = 40;

export interface LayoutNodeInspection {
  id: string;
  debugLabel?: string;
  viewKey?: string;
  parentId?: string;
  rect: { x: number; y: number; width: number; height: number };
  z?: number;
  layer?: string;
  order: number;
  depth: number;
}

export interface DispatchEventInspection {
  sequence: number;
  at: string;
  type: LeviathanDispatch["type"];
  summary: Record<string, unknown>;
}

export interface LeviathanDebugSnapshot {
  generatedAt: string;
  apiBaseUrl?: string;
  route: ShellState["route"];
  status: ShellState["status"];
  currentScreenSummary?: unknown;
  layoutNodes: LayoutNodeInspection[];
  recentEvents: DispatchEventInspection[];
  promptMapping?: PromptMappingInspection;
}

export type PromptMappingInspection = {
  promptId: string;
  promptKind: string;
  revision: number;
  title: string;
  actions: Array<{ kind: string; key?: string; label: string; dispatchEvent: unknown }>;
  textInput: { available: boolean; valid: boolean; length: number };
};

export function debugFlagFromLocation(location: Pick<Location, "search">, storage: Storage): boolean {
  const params = new URLSearchParams(location.search);
  const debug = params.get("debug");
  if (debug === "1") {
    storage.setItem(DEBUG_STORAGE_KEY, "true");
    return true;
  }
  if (debug === "0") {
    storage.removeItem(DEBUG_STORAGE_KEY);
    return false;
  }
  return storage.getItem(DEBUG_STORAGE_KEY) === "true";
}

export function setDebugInspectorEnabled(storage: Storage, enabled: boolean): void {
  if (enabled) storage.setItem(DEBUG_STORAGE_KEY, "true");
  else storage.removeItem(DEBUG_STORAGE_KEY);
}

export class DispatchHistoryBuffer {
  private sequence = 0;
  private events: DispatchEventInspection[] = [];

  record(event: LeviathanDispatch): DispatchEventInspection {
    const entry: DispatchEventInspection = {
      sequence: ++this.sequence,
      at: new Date().toISOString(),
      type: event.type,
      summary: summarizeDispatchEvent(event),
    };
    this.events = [...this.events, entry].slice(-MAX_EVENT_HISTORY);
    return entry;
  }

  snapshot(): DispatchEventInspection[] {
    return this.events;
  }
}

export function summarizeDispatchEvent(event: LeviathanDispatch): Record<string, unknown> {
  switch (event.type) {
    case "ariadne-session-started":
    case "ariadne-screen-updated":
    case "open-ariadne-session":
      return { screen: summarizeScreen(event.screen), clearTextInput: "clearTextInput" in event ? event.clearTextInput === true : undefined };
    case "set-text-input":
      return { textLength: event.text.length, hasText: event.text.length > 0 };
    default: {
      const { type: _type, ...rest } = event;
      return rest;
    }
  }
}

export function inspectLayout(layout: ResolvedLayoutDocument): LayoutNodeInspection[] {
  const nodes: LayoutNodeInspection[] = [];
  const visit = (id: string, parentId: string | undefined, depth: number) => {
    const node = layout.nodes[id];
    if (!node) return;
    nodes.push({
      id,
      parentId,
      depth,
      order: nodes.length,
      debugLabel: node.debugLabel,
      viewKey: node.view,
      rect: node.rect,
      z: node.z,
      layer: node.layer,
    });
    for (const child of layout.children[id] ?? []) visit(child, id, depth + 1);
  };
  visit(layout.rootId, undefined, 0);
  return nodes;
}

export function inspectPromptMapping(state: ShellState): PromptMappingInspection | undefined {
  const screen = state.screen;
  const prompt = screen?.prompt;
  if (!screen || !prompt) return undefined;
  const mapped = mapPrompt(screen);
  return {
    promptId: prompt.id,
    promptKind: prompt.kind,
    revision: screen.revision,
    title: mapped.title,
    actions: mapped.actions.map((action) =>
      action.kind === "text-input"
        ? { kind: action.kind, label: action.label, dispatchEvent: action.eventForText("<text>") }
        : { kind: action.kind, key: action.kind === "choice" ? action.key : undefined, label: action.label, dispatchEvent: action.event },
    ),
    textInput: { available: prompt.kind === "text-input", valid: prompt.kind !== "text-input" || state.textInput.trim().length > 0, length: state.textInput.length },
  };
}

export function summarizeShellState(state: ShellState): Record<string, unknown> {
  return {
    route: state.route,
    status: state.status,
    error: state.error,
    appCount: state.apps.length,
    sessionId: state.screen?.sessionId ?? null,
    wasRestored: state.screen?.wasRestored ?? false,
    screenRevision: state.screen?.revision ?? null,
    promptKind: state.screen?.prompt?.kind ?? null,
    promptId: state.screen?.prompt?.id ?? null,
    textInputLength: state.textInput.length,
    hasTextInput: state.textInput.length > 0,
  };
}

export function summarizeScreen(screen: ShellState["screen"]): unknown {
  if (!screen) return undefined;
  return {
    sessionId: screen.sessionId,
    title: screen.title,
    revision: screen.revision,
    isComplete: screen.isComplete,
    wasRestored: screen.wasRestored ?? false,
    error: screen.error,
    transcriptCount: screen.transcript.length,
    prompt: screen.prompt ? { id: screen.prompt.id, kind: screen.prompt.kind, choiceCount: screen.prompt.choices.length } : null,
  };
}

export function createDebugSnapshot(
  state: ShellState,
  layoutNodes: LayoutNodeInspection[],
  recentEvents: DispatchEventInspection[],
  apiBaseUrl?: string,
): LeviathanDebugSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    apiBaseUrl,
    route: state.route,
    status: state.status,
    currentScreenSummary: summarizeScreen(state.screen),
    layoutNodes,
    recentEvents,
    promptMapping: inspectPromptMapping(state),
  };
}
