import type { EdgeInsets } from "./types";
import { assertNonNegativePadding } from "./validation";

export function normalizePadding(padding?: number | EdgeInsets): EdgeInsets {
  const resolved: EdgeInsets =
    typeof padding === "number"
      ? { top: padding, right: padding, bottom: padding, left: padding }
      : padding === undefined
        ? { top: 0, right: 0, bottom: 0, left: 0 }
        : {
            top: padding.top,
            right: padding.right,
            bottom: padding.bottom,
            left: padding.left,
          };

  assertNonNegativePadding(resolved.top, "padding.top");
  assertNonNegativePadding(resolved.right, "padding.right");
  assertNonNegativePadding(resolved.bottom, "padding.bottom");
  assertNonNegativePadding(resolved.left, "padding.left");

  return {
    top: resolved.top,
    right: resolved.right,
    bottom: resolved.bottom,
    left: resolved.left,
  };
}
