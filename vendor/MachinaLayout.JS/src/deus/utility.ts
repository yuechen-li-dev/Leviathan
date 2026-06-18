import {
  DeusMachinaError,
  type JudgeUtilityOptions,
  type UtilityCandidate,
  type UtilityJudgment,
} from "./types";

function finite(value: number, code: string, label: string): number {
  if (!Number.isFinite(value)) throw new DeusMachinaError(code, `${label} must be finite`);
  return value;
}

export function judgeUtility<TContext, TKey extends string = string>(
  context: TContext,
  candidates: readonly UtilityCandidate<TContext, TKey>[],
  options: JudgeUtilityOptions<TKey> = {},
): UtilityJudgment<TKey> {
  if (
    options.hysteresis !== undefined &&
    (!Number.isFinite(options.hysteresis) || options.hysteresis < 0)
  ) {
    throw new DeusMachinaError("InvalidHysteresis", "hysteresis must be finite and >= 0");
  }
  const results = candidates.map((candidate, index) => {
    const eligible = candidate.when?.(context) ?? true;
    const score = eligible
      ? finite(
          typeof candidate.score === "function" ? candidate.score(context) : candidate.score,
          "InvalidUtilityScore",
          `utility score for ${candidate.key}`,
        )
      : 0;
    const reason =
      typeof candidate.reason === "function" ? candidate.reason(context) : candidate.reason;
    return {
      key: candidate.key,
      eligible,
      score,
      index,
      ...(reason !== undefined ? { reason } : null),
    };
  });
  let selected = results
    .filter((r) => r.eligible)
    .reduce<(typeof results)[number] | null>(
      (best, r) => (best === null || r.score > best.score ? r : best),
      null,
    );
  if (selected && options.previousKey !== undefined && options.hysteresis !== undefined) {
    const previous = results.find((r) => r.key === options.previousKey && r.eligible);
    if (
      previous &&
      selected.key !== previous.key &&
      selected.score - previous.score < options.hysteresis
    )
      selected = previous;
  }
  return { selected, candidates: results };
}
