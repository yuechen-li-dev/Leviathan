import { MachinaDispatchError } from "./errors";
import type {
  IncrementDispatchTable,
  MachinaDispatchTables,
  PrefixIncrementDispatchTable,
  PrefixSetDispatchTable,
  SetDispatchTable,
  ToggleDispatchTable,
} from "./types";

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

const validateLengths = (name: string, ...columns: readonly (readonly unknown[])[]) => {
  const expected = columns[0]?.length ?? 0;
  if (!columns.every((column) => Array.isArray(column) && column.length === expected)) {
    throw new MachinaDispatchError("InvalidDispatchTable", `${name} column lengths must match`);
  }
};

const validateAllowedSuffixes = (
  allowedSuffixes: readonly (readonly string[] | undefined)[] | undefined,
  expectedLength: number,
  tableName: string,
) => {
  if (allowedSuffixes === undefined) return;
  if (!Array.isArray(allowedSuffixes) || allowedSuffixes.length !== expectedLength) {
    throw new MachinaDispatchError(
      "InvalidDispatchTable",
      `${tableName}.allowedSuffixes length mismatch`,
    );
  }
  for (const row of allowedSuffixes) {
    if (row !== undefined && !isStringArray(row)) {
      throw new MachinaDispatchError(
        "InvalidDispatchTable",
        `${tableName}.allowedSuffixes must be string arrays`,
      );
    }
  }
};

const validateBy = (
  by: readonly number[] | undefined,
  expectedLength: number,
  tableName: string,
) => {
  if (by === undefined) return;
  if (!Array.isArray(by) || by.length !== expectedLength) {
    throw new MachinaDispatchError("InvalidDispatchTable", `${tableName}.by length mismatch`);
  }
  for (const value of by) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new MachinaDispatchError(
        "InvalidDispatchTable",
        `${tableName}.by must contain finite numbers`,
      );
    }
  }
};

export const validateSetTable = <TState>(table: SetDispatchTable<TState>): void => {
  validateLengths("set", table.events, table.fields as readonly unknown[], table.values);
  if (!isStringArray(table.events))
    throw new MachinaDispatchError("InvalidDispatchTable", "set.events must be strings");
};
export const validateToggleTable = <TState>(table: ToggleDispatchTable<TState>): void => {
  validateLengths("toggle", table.events, table.fields as readonly unknown[]);
  if (!isStringArray(table.events))
    throw new MachinaDispatchError("InvalidDispatchTable", "toggle.events must be strings");
};
export const validateIncrementTable = <TState>(table: IncrementDispatchTable<TState>): void => {
  validateLengths("increment", table.events, table.fields as readonly unknown[]);
  if (!isStringArray(table.events))
    throw new MachinaDispatchError("InvalidDispatchTable", "increment.events must be strings");
  validateBy(table.by, table.events.length, "increment");
};
export const validatePrefixSetTable = <TState>(table: PrefixSetDispatchTable<TState>): void => {
  validateLengths("setSuffix", table.prefixes, table.fields as readonly unknown[]);
  if (!isStringArray(table.prefixes))
    throw new MachinaDispatchError("InvalidDispatchTable", "setSuffix.prefixes must be strings");
  validateAllowedSuffixes(table.allowedSuffixes, table.prefixes.length, "setSuffix");
};
export const validatePrefixIncrementTable = <TState>(
  table: PrefixIncrementDispatchTable<TState>,
): void => {
  validateLengths("incrementSuffix", table.prefixes, table.fields as readonly unknown[]);
  if (!isStringArray(table.prefixes))
    throw new MachinaDispatchError(
      "InvalidDispatchTable",
      "incrementSuffix.prefixes must be strings",
    );
  validateBy(table.by, table.prefixes.length, "incrementSuffix");
  validateAllowedSuffixes(table.allowedSuffixes, table.prefixes.length, "incrementSuffix");
};

export function defineDispatchTables<TState>(
  tables: MachinaDispatchTables<TState>,
): MachinaDispatchTables<TState> {
  if (tables.set) validateSetTable(tables.set);
  if (tables.toggle) validateToggleTable(tables.toggle);
  if (tables.increment) validateIncrementTable(tables.increment);
  if (tables.setSuffix) validatePrefixSetTable(tables.setSuffix);
  if (tables.incrementSuffix) validatePrefixIncrementTable(tables.incrementSuffix);
  return tables;
}

export function resolveEventValue<TValue>(
  event: string,
  table: { events: readonly string[]; values: readonly TValue[] },
): TValue | undefined {
  validateLengths("resolveEventValue", table.events, table.values as readonly unknown[]);
  if (!isStringArray(table.events))
    throw new MachinaDispatchError("InvalidDispatchTable", "events must be strings");
  for (let i = 0; i < table.events.length; i += 1) {
    if (table.events[i] === event) return table.values[i];
  }
  return undefined;
}

export function matchEventPrefix(
  event: string,
  prefix: string,
  allowedSuffixes?: readonly string[],
): string | undefined {
  if (typeof event !== "string" || typeof prefix !== "string") {
    throw new MachinaDispatchError("InvalidDispatchEvent", "event and prefix must be strings");
  }
  if (allowedSuffixes !== undefined && !isStringArray(allowedSuffixes)) {
    throw new MachinaDispatchError(
      "InvalidDispatchTable",
      "allowedSuffixes must be a string array",
    );
  }
  if (!event.startsWith(prefix)) return undefined;
  const suffix = event.slice(prefix.length);
  if (allowedSuffixes && !allowedSuffixes.includes(suffix)) return undefined;
  return suffix;
}
