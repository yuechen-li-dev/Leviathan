export type SetDispatchTable<TState> = {
  events: readonly string[];
  fields: readonly (keyof TState)[];
  values: readonly unknown[];
};

export type ToggleDispatchTable<TState> = {
  events: readonly string[];
  fields: readonly (keyof TState)[];
};

export type IncrementDispatchTable<TState> = {
  events: readonly string[];
  fields: readonly (keyof TState)[];
  by?: readonly number[];
};

export type PrefixSetDispatchTable<TState> = {
  prefixes: readonly string[];
  fields: readonly (keyof TState)[];
  allowedSuffixes?: readonly (readonly string[] | undefined)[];
};

export type PrefixIncrementDispatchTable<TState> = {
  prefixes: readonly string[];
  fields: readonly (keyof TState)[];
  by?: readonly number[];
  allowedSuffixes?: readonly (readonly string[] | undefined)[];
};

export type MachinaDispatchTables<TState> = {
  set?: SetDispatchTable<TState>;
  toggle?: ToggleDispatchTable<TState>;
  increment?: IncrementDispatchTable<TState>;
  setSuffix?: PrefixSetDispatchTable<TState>;
  incrementSuffix?: PrefixIncrementDispatchTable<TState>;
};
