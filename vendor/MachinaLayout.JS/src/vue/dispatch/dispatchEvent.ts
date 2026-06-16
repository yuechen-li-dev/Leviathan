import { MachinaDispatchError } from "./errors";
import {
  matchEventPrefix,
  validateIncrementTable,
  validatePrefixIncrementTable,
  validatePrefixSetTable,
  validateSetTable,
  validateToggleTable,
} from "./helpers";
import type { MachinaDispatchTables } from "./types";

const hasOwn = (state: Record<string, unknown>, field: PropertyKey) => Object.hasOwn(state, field);

export function dispatchEvent<TState extends Record<string, unknown>>(
  state: TState,
  event: string,
  tables: MachinaDispatchTables<TState>,
): TState {
  if (typeof event !== "string") {
    throw new MachinaDispatchError("InvalidDispatchEvent", "event must be a string");
  }

  const base = state as Record<string, unknown>;

  if (tables.set) {
    validateSetTable(tables.set);
    for (let i = 0; i < tables.set.events.length; i += 1) {
      if (tables.set.events[i] !== event) continue;
      const field = tables.set.fields[i];
      if (!hasOwn(base, field))
        throw new MachinaDispatchError("InvalidDispatchField", `missing field: ${String(field)}`);
      const nextValue = tables.set.values[i];
      if (Object.is(base[field as string], nextValue)) return state;
      return { ...state, [field]: nextValue };
    }
  }

  if (tables.toggle) {
    validateToggleTable(tables.toggle);
    for (let i = 0; i < tables.toggle.events.length; i += 1) {
      if (tables.toggle.events[i] !== event) continue;
      const field = tables.toggle.fields[i];
      if (!hasOwn(base, field))
        throw new MachinaDispatchError("InvalidDispatchField", `missing field: ${String(field)}`);
      const current = base[field as string];
      if (typeof current !== "boolean")
        throw new MachinaDispatchError(
          "InvalidDispatchValue",
          `field must be boolean: ${String(field)}`,
        );
      return { ...state, [field]: !current };
    }
  }

  if (tables.increment) {
    validateIncrementTable(tables.increment);
    for (let i = 0; i < tables.increment.events.length; i += 1) {
      if (tables.increment.events[i] !== event) continue;
      const field = tables.increment.fields[i];
      if (!hasOwn(base, field))
        throw new MachinaDispatchError("InvalidDispatchField", `missing field: ${String(field)}`);
      const current = base[field as string];
      if (typeof current !== "number")
        throw new MachinaDispatchError(
          "InvalidDispatchValue",
          `field must be number: ${String(field)}`,
        );
      const delta = tables.increment.by?.[i] ?? 1;
      if (!Number.isFinite(delta))
        throw new MachinaDispatchError("InvalidDispatchValue", "increment delta must be finite");
      return { ...state, [field]: current + delta };
    }
  }

  if (tables.setSuffix) {
    validatePrefixSetTable(tables.setSuffix);
    for (let i = 0; i < tables.setSuffix.prefixes.length; i += 1) {
      const suffix = matchEventPrefix(
        event,
        tables.setSuffix.prefixes[i],
        tables.setSuffix.allowedSuffixes?.[i],
      );
      if (suffix === undefined) continue;
      const field = tables.setSuffix.fields[i];
      if (!hasOwn(base, field))
        throw new MachinaDispatchError("InvalidDispatchField", `missing field: ${String(field)}`);
      if (Object.is(base[field as string], suffix)) return state;
      return { ...state, [field]: suffix };
    }
  }

  if (tables.incrementSuffix) {
    validatePrefixIncrementTable(tables.incrementSuffix);
    for (let i = 0; i < tables.incrementSuffix.prefixes.length; i += 1) {
      const suffix = matchEventPrefix(
        event,
        tables.incrementSuffix.prefixes[i],
        tables.incrementSuffix.allowedSuffixes?.[i],
      );
      if (suffix === undefined) continue;
      const field = tables.incrementSuffix.fields[i];
      if (!hasOwn(base, field))
        throw new MachinaDispatchError("InvalidDispatchField", `missing field: ${String(field)}`);
      const current = base[field as string];
      if (typeof current !== "number")
        throw new MachinaDispatchError(
          "InvalidDispatchValue",
          `field must be number: ${String(field)}`,
        );
      const delta = tables.incrementSuffix.by?.[i] ?? 1;
      if (!Number.isFinite(delta))
        throw new MachinaDispatchError("InvalidDispatchValue", "increment delta must be finite");
      return { ...state, [field]: current + delta };
    }
  }

  return state;
}
