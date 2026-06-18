export { dispatchEvent } from "./dispatchEvent";
export { MachinaDispatchError, type MachinaDispatchErrorCode } from "./errors";
export { defineDispatchTables, matchEventPrefix, resolveEventValue } from "./helpers";
export type {
  IncrementDispatchTable,
  MachinaDispatchTables,
  PrefixIncrementDispatchTable,
  PrefixSetDispatchTable,
  SetDispatchTable,
  ToggleDispatchTable,
} from "./types";
