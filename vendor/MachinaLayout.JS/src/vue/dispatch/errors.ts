export type MachinaDispatchErrorCode =
  | "InvalidDispatchTable"
  | "InvalidDispatchField"
  | "InvalidDispatchValue"
  | "InvalidDispatchEvent";

export class MachinaDispatchError extends Error {
  readonly code: MachinaDispatchErrorCode;

  constructor(code: MachinaDispatchErrorCode, message: string) {
    super(message);
    this.name = "MachinaDispatchError";
    this.code = code;
  }
}
