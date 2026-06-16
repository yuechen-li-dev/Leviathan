import { MachinaLayoutError } from "./errors";

export function assertFiniteNumber(value: number, fieldName: string): void {
  if (!Number.isFinite(value)) {
    throw new MachinaLayoutError(
      "NonFiniteNumber",
      `${fieldName} must be a finite number. Received: ${value}`,
    );
  }
}

export function assertNonNegativeSize(value: number, fieldName: string): void {
  assertFiniteNumber(value, fieldName);
  if (value < 0) {
    throw new MachinaLayoutError(
      "NegativeSize",
      `${fieldName} must be non-negative. Received: ${value}`,
    );
  }
}

export function assertNonNegativeGap(value: number, fieldName = "gap"): void {
  assertFiniteNumber(value, fieldName);
  if (value < 0) {
    throw new MachinaLayoutError(
      "NegativeGap",
      `${fieldName} must be non-negative. Received: ${value}`,
    );
  }
}

export function assertNonNegativePadding(value: number, fieldName = "padding"): void {
  assertFiniteNumber(value, fieldName);
  if (value < 0) {
    throw new MachinaLayoutError(
      "NegativePadding",
      `${fieldName} must be non-negative. Received: ${value}`,
    );
  }
}
