import { MachinaLayoutError } from "./errors";
import type { UiLength } from "./types";
import { assertFiniteNumber } from "./validation";

export function resolveUiLength(length: UiLength, axisSize: number, fieldName = "length"): number {
  assertFiniteNumber(axisSize, "axisSize");

  if (typeof length === "number") {
    assertFiniteNumber(length, fieldName);
    return length;
  }

  if (!length || typeof length !== "object" || !("unit" in length) || !("value" in length)) {
    throw new MachinaLayoutError("InvalidLengthUnit", `Invalid UiLength for ${fieldName}.`);
  }

  const { unit, value } = length;
  assertFiniteNumber(value, `${fieldName}.value`);

  if (unit === "px") {
    return value;
  }

  if (unit === "ui") {
    return value * axisSize;
  }

  throw new MachinaLayoutError(
    "InvalidLengthUnit",
    `Invalid UiLength unit for ${fieldName}: ${String(unit)}.`,
  );
}
