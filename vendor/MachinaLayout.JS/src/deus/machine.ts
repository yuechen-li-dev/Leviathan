import {
  DeusMachinaError,
  type DeusEvent,
  type DeusMachine,
  type DeusSnapshot,
  type DeusStatePath,
  type DeusStepResult,
  type DeusStepTrace,
  type DeusTransitionTrace,
  type UtilityJudgment,
} from "./types";
import { judgeUtility } from "./utility";

function assertValidDeusPath(path: unknown, label: string): asserts path is DeusStatePath {
  if (!Array.isArray(path) || path.length === 0) {
    throw new DeusMachinaError("InvalidDeusPath", `${label} must be a non-empty path`);
  }
  path.forEach((segment, index) => {
    if (typeof segment !== "string" || segment.length === 0 || segment.trim().length === 0) {
      throw new DeusMachinaError(
        "InvalidDeusPath",
        `${label} segment ${index} must be a non-empty string`,
      );
    }
  });
}

export function formatDeusPath(path: DeusStatePath): string {
  assertValidDeusPath(path, "path");
  return path.join("/");
}
export function sameDeusPath(a: DeusStatePath, b: DeusStatePath): boolean {
  assertValidDeusPath(a, "left path");
  assertValidDeusPath(b, "right path");
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
export function isDeusAncestorPath(ancestor: DeusStatePath, path: DeusStatePath): boolean {
  assertValidDeusPath(ancestor, "ancestor path");
  assertValidDeusPath(path, "path");
  return ancestor.length <= path.length && ancestor.every((v, i) => v === path[i]);
}
function finite(value: number, code: string, label: string): number {
  if (!Number.isFinite(value)) throw new DeusMachinaError(code, `${label} must be finite`);
  return value;
}
function pathKey(path: DeusStatePath): string {
  return formatDeusPath(path);
}

function validateReason(reason: unknown, code: string, label: string): void {
  if (reason !== undefined && typeof reason !== "string" && typeof reason !== "function") {
    throw new DeusMachinaError(code, `${label} reason must be a string or function`);
  }
}

export function defineDeusMachine<TBoard, TEvent extends DeusEvent>(
  machine: DeusMachine<TBoard, TEvent>,
): DeusMachine<TBoard, TEvent> {
  if (!machine || typeof machine !== "object") {
    throw new DeusMachinaError("InvalidDeusMachine", "machine must be an object");
  }
  assertValidDeusPath(machine.initial, "initial");
  if (!Array.isArray(machine.states)) {
    throw new DeusMachinaError("InvalidDeusMachine", "states must be an array");
  }
  if (!Array.isArray(machine.transitions)) {
    throw new DeusMachinaError("InvalidDeusMachine", "transitions must be an array");
  }

  const stateKeys = new Set<string>();
  const states = machine.states.map((s) => {
    assertValidDeusPath(s.path, "state path");
    const key = pathKey(s.path);
    if (stateKeys.has(key))
      throw new DeusMachinaError("DuplicateDeusStatePath", `duplicate state path ${key}`);
    stateKeys.add(key);
    return { ...s, path: [...s.path] };
  });
  if (!stateKeys.has(pathKey(machine.initial)))
    throw new DeusMachinaError("UnknownDeusStatePath", "initial path must exist");
  const transitionKeys = new Set<string>();
  const transitions = machine.transitions.map((t) => {
    if (typeof t.key !== "string" || t.key.length === 0 || t.key.trim().length === 0)
      throw new DeusMachinaError("InvalidDeusTransition", "transition keys must be non-empty");
    if (transitionKeys.has(t.key))
      throw new DeusMachinaError("DuplicateDeusTransitionKey", `duplicate transition key ${t.key}`);
    transitionKeys.add(t.key);
    assertValidDeusPath(t.from, `transition ${t.key} from`);
    if (!stateKeys.has(pathKey(t.from)))
      throw new DeusMachinaError(
        "UnknownDeusStatePath",
        `transition ${t.key} from path must exist`,
      );
    if (Array.isArray(t.to)) {
      assertValidDeusPath(t.to, `transition ${t.key} to`);
      if (!stateKeys.has(pathKey(t.to)))
        throw new DeusMachinaError(
          "UnknownDeusStatePath",
          `transition ${t.key} to path must exist`,
        );
    } else if (t.to !== undefined && typeof t.to !== "function") {
      throw new DeusMachinaError(
        "InvalidDeusTransition",
        `transition ${t.key} to must be a path or function`,
      );
    }
    if (typeof t.score === "number")
      finite(t.score, "InvalidDeusTransition", `transition ${t.key} score`);
    validateReason(t.reason, "InvalidDeusTransition", `transition ${t.key}`);
    if (t.hysteresis !== undefined) {
      if (typeof t.hysteresis.previous !== "function")
        throw new DeusMachinaError(
          "InvalidHysteresis",
          `transition ${t.key} hysteresis.previous must be a function`,
        );
      finite(t.hysteresis.margin, "InvalidHysteresis", `transition ${t.key} hysteresis margin`);
      if (t.hysteresis.margin < 0)
        throw new DeusMachinaError(
          "InvalidHysteresis",
          `transition ${t.key} hysteresis margin must be >= 0`,
        );
    }
    const utilityKeys = new Set<string>();
    for (const u of t.utility ?? []) {
      if (typeof u.key !== "string" || u.key.length === 0 || u.key.trim().length === 0)
        throw new DeusMachinaError(
          "InvalidDeusTransition",
          `transition ${t.key} utility key must be non-empty`,
        );
      if (utilityKeys.has(u.key))
        throw new DeusMachinaError("DuplicateUtilityKey", `duplicate utility key ${u.key}`);
      utilityKeys.add(u.key);
      if (typeof u.score !== "number" && typeof u.score !== "function")
        throw new DeusMachinaError(
          "InvalidUtilityScore",
          `utility score for ${u.key} must be a number or function`,
        );
      if (typeof u.score === "number")
        finite(u.score, "InvalidUtilityScore", `utility score for ${u.key}`);
      validateReason(u.reason, "InvalidDeusTransition", `utility ${u.key}`);
    }
    return { ...t, from: [...t.from], to: Array.isArray(t.to) ? [...t.to] : t.to };
  });
  return { initial: [...machine.initial], states, transitions };
}

export function createDeusSnapshot<TBoard, TEvent extends DeusEvent>(
  machine: DeusMachine<TBoard, TEvent>,
  board: TBoard,
): DeusSnapshot<TBoard> {
  return { state: [...machine.initial], board, stepIndex: 0 };
}

export function stepDeusMachine<TBoard, TEvent extends DeusEvent>(
  machine: DeusMachine<TBoard, TEvent>,
  snapshot: DeusSnapshot<TBoard>,
  event: NoInfer<TEvent>,
): DeusStepResult<TBoard> {
  const stateBefore = [...snapshot.state];
  assertValidDeusPath(stateBefore, "snapshot state");
  const stateMap = new Map(machine.states.map((s) => [pathKey(s.path), s]));
  const orderedFrom = stateBefore.map((_, i) => stateBefore.slice(0, stateBefore.length - i));
  const candidates = orderedFrom.flatMap((from) =>
    machine.transitions.map((t) => ({ t })).filter(({ t }) => sameDeusPath(t.from, from)),
  );
  const traces: DeusTransitionTrace[] = [];
  let selected:
    | { trace: DeusTransitionTrace; t: (typeof machine.transitions)[number]; utilityKey?: string }
    | undefined;
  candidates.forEach(({ t }, index) => {
    const eventMatches = t.event === undefined || t.event === event.type;
    let eligible = eventMatches && (t.when?.(snapshot.board, event) ?? true);
    let utility: UtilityJudgment<string> | undefined;
    let utilityKey: string | undefined;
    let score = eligible
      ? t.score === undefined
        ? 1
        : finite(
            typeof t.score === "function" ? t.score(snapshot.board, event) : t.score,
            "InvalidDeusTransition",
            `transition ${t.key} score`,
          )
      : 0;
    if (eligible && t.utility) {
      utility = judgeUtility(
        { board: snapshot.board, event },
        t.utility.map((u) => ({
          key: u.key,
          when: (ctx) => u.when?.(ctx.board, ctx.event) ?? true,
          score: (ctx) => (typeof u.score === "function" ? u.score(ctx.board, ctx.event) : u.score),
          reason:
            typeof u.reason === "function"
              ? (ctx) => {
                  const reason = u.reason;
                  return typeof reason === "function" ? reason(ctx.board, ctx.event) : "";
                }
              : u.reason,
        })),
        t.hysteresis
          ? { previousKey: t.hysteresis.previous(snapshot.board), hysteresis: t.hysteresis.margin }
          : undefined,
      );
      if (!utility.selected) eligible = false;
      else {
        utilityKey = utility.selected.key;
        if (t.score === undefined) score = utility.selected.score;
      }
    }
    const to =
      eligible && t.to
        ? typeof t.to === "function"
          ? [...t.to(snapshot.board, event)]
          : [...t.to]
        : undefined;
    if (to) {
      assertValidDeusPath(to, `transition ${t.key} to`);
      if (!stateMap.has(pathKey(to)))
        throw new DeusMachinaError(
          "UnknownDeusStatePath",
          `transition ${t.key} to path must exist`,
        );
    }
    const reason = typeof t.reason === "function" ? t.reason(snapshot.board, event) : t.reason;
    const trace = {
      key: t.key,
      from: [...t.from],
      ...(to ? { to } : null),
      event: t.event,
      eligible,
      score: eligible ? score : 0,
      index,
      ...(reason !== undefined ? { reason } : null),
      ...(utility ? { utility } : null),
    };
    traces.push(trace);
    if (eligible && (!selected || trace.score > selected.trace.score))
      selected = { trace, t, utilityKey };
  });
  if (!selected)
    return {
      snapshot: { state: stateBefore, board: snapshot.board, stepIndex: snapshot.stepIndex + 1 },
      trace: { stateBefore, stateAfter: stateBefore, event: event.type, transitions: traces },
    };
  const target = selected.trace.to ?? stateBefore;
  const common = stateBefore.findIndex((v, i) => target[i] !== v);
  const prefix = common === -1 ? Math.min(stateBefore.length, target.length) : common;
  for (let i = stateBefore.length; i > prefix; i--)
    stateMap.get(pathKey(stateBefore.slice(0, i)))?.onExit?.(snapshot.board, event);
  if (selected.utilityKey)
    selected.t.utility?.find((u) => u.key === selected?.utilityKey)?.do?.(snapshot.board, event);
  selected.t.do?.(snapshot.board, event);
  for (let i = prefix + 1; i <= target.length; i++)
    stateMap.get(pathKey(target.slice(0, i)))?.onEnter?.(snapshot.board, event);
  return {
    snapshot: { state: [...target], board: snapshot.board, stepIndex: snapshot.stepIndex + 1 },
    trace: {
      stateBefore,
      stateAfter: [...target],
      event: event.type,
      selectedTransition: selected.trace,
      transitions: traces,
    },
  };
}

export function formatDeusStepTrace(trace: DeusStepTrace): string {
  const selected = trace.selectedTransition ? trace.selectedTransition.key : "none";
  return `${formatDeusPath(trace.stateBefore)} --${trace.event}/${selected}--> ${formatDeusPath(trace.stateAfter)}`;
}
