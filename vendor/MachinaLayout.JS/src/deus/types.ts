export class DeusMachinaError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DeusMachinaError";
  }
}

export type UtilityScore<TContext> = number | ((context: TContext) => number);
export type UtilityCandidate<TContext, TKey extends string = string> = {
  key: TKey;
  when?: (context: TContext) => boolean;
  score: UtilityScore<TContext>;
  reason?: string | ((context: TContext) => string);
};
export type UtilityCandidateResult<TKey extends string = string> = {
  key: TKey;
  eligible: boolean;
  score: number;
  index: number;
  reason?: string;
};
export type UtilityJudgment<TKey extends string = string> = {
  selected: UtilityCandidateResult<TKey> | null;
  candidates: UtilityCandidateResult<TKey>[];
};
export type JudgeUtilityOptions<TKey extends string = string> = {
  previousKey?: TKey;
  hysteresis?: number;
};

export type DeusStatePath = readonly string[];
export type DeusEvent = { type: string };
export type DeusAction<TBoard, TEvent extends DeusEvent> = (board: TBoard, event: TEvent) => void;
export type DeusStateRow<TBoard, TEvent extends DeusEvent> = {
  path: DeusStatePath;
  onEnter?: DeusAction<TBoard, TEvent>;
  onExit?: DeusAction<TBoard, TEvent>;
};
export type DeusUtilityTransitionCandidate<
  TBoard,
  TEvent extends DeusEvent,
  TKey extends string = string,
> = {
  key: TKey;
  when?: (board: TBoard, event: TEvent) => boolean;
  score: number | ((board: TBoard, event: TEvent) => number);
  do?: DeusAction<TBoard, TEvent>;
  reason?: string | ((board: TBoard, event: TEvent) => string);
};
export type DeusTransitionRow<TBoard, TEvent extends DeusEvent> = {
  key: string;
  from: DeusStatePath;
  event?: TEvent["type"];
  to?: DeusStatePath | ((board: TBoard, event: TEvent) => DeusStatePath);
  when?: (board: TBoard, event: TEvent) => boolean;
  score?: number | ((board: TBoard, event: TEvent) => number);
  do?: DeusAction<TBoard, TEvent>;
  reason?: string | ((board: TBoard, event: TEvent) => string);
  utility?: readonly DeusUtilityTransitionCandidate<TBoard, TEvent>[];
  hysteresis?: { previous: (board: TBoard) => string | undefined; margin: number };
};
export type DeusMachine<TBoard, TEvent extends DeusEvent> = {
  initial: DeusStatePath;
  states: readonly DeusStateRow<TBoard, TEvent>[];
  transitions: readonly DeusTransitionRow<TBoard, TEvent>[];
};
export type DeusSnapshot<TBoard> = { state: DeusStatePath; board: TBoard; stepIndex: number };
export type DeusTransitionTrace = {
  key: string;
  from: DeusStatePath;
  to?: DeusStatePath;
  event?: string;
  eligible: boolean;
  score: number;
  index: number;
  reason?: string;
  utility?: UtilityJudgment<string>;
};
export type DeusStepTrace = {
  stateBefore: DeusStatePath;
  stateAfter: DeusStatePath;
  event: string;
  selectedTransition?: DeusTransitionTrace;
  transitions: DeusTransitionTrace[];
};
export type DeusStepResult<TBoard> = { snapshot: DeusSnapshot<TBoard>; trace: DeusStepTrace };
