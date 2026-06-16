import { MachinaLayoutError } from "./errors";
import { resolveUiLength } from "./length";
import type { AnchorFrame, FrameSpec, Rect, UiLength } from "./types";
import { assertFiniteNumber, assertNonNegativeSize } from "./validation";

function validateParentRect(parent: Rect): void {
  assertFiniteNumber(parent.x, "parent.x");
  assertFiniteNumber(parent.y, "parent.y");
  assertNonNegativeSize(parent.width, "parent.width");
  assertNonNegativeSize(parent.height, "parent.height");
}

function hasLength(value: UiLength | undefined): value is UiLength {
  return value !== undefined;
}

function resolveAnchor(parent: Rect, frame: AnchorFrame): Rect {
  const hasLeft = hasLength(frame.left);
  const hasRight = hasLength(frame.right);
  const hasTop = hasLength(frame.top);
  const hasBottom = hasLength(frame.bottom);
  const hasWidth = hasLength(frame.width);
  const hasHeight = hasLength(frame.height);

  // Positional anchor constraints (left/right/top/bottom) intentionally allow negative values.
  // This permits deliberate overflow/bleed outside the parent. Width/height are size
  // constraints and remain non-negative; derived negative sizes are rejected after resolution.
  const left = hasLeft ? resolveUiLength(frame.left!, parent.width, "frame.left") : undefined;
  const right = hasRight ? resolveUiLength(frame.right!, parent.width, "frame.right") : undefined;
  const top = hasTop ? resolveUiLength(frame.top!, parent.height, "frame.top") : undefined;
  const bottom = hasBottom
    ? resolveUiLength(frame.bottom!, parent.height, "frame.bottom")
    : undefined;
  const explicitWidth = hasWidth
    ? resolveUiLength(frame.width!, parent.width, "frame.width")
    : undefined;
  const explicitHeight = hasHeight
    ? resolveUiLength(frame.height!, parent.height, "frame.height")
    : undefined;

  if (hasWidth) assertNonNegativeSize(explicitWidth as number, "frame.width");
  if (hasHeight) assertNonNegativeSize(explicitHeight as number, "frame.height");

  const horizontalCount = Number(hasLeft) + Number(hasRight) + Number(hasWidth);
  if (horizontalCount !== 2) {
    throw new MachinaLayoutError(
      "InvalidAnchorHorizontal",
      "Anchor frame must specify exactly two horizontal constraints: left, right, width.",
    );
  }

  const verticalCount = Number(hasTop) + Number(hasBottom) + Number(hasHeight);
  if (verticalCount !== 2) {
    throw new MachinaLayoutError(
      "InvalidAnchorVertical",
      "Anchor frame must specify exactly two vertical constraints: top, bottom, height.",
    );
  }

  let x: number;
  let width: number;
  if (hasLeft && hasWidth) {
    x = parent.x + (left as number);
    width = explicitWidth as number;
  } else if (hasRight && hasWidth) {
    x = parent.x + parent.width - (right as number) - (explicitWidth as number);
    width = explicitWidth as number;
  } else {
    x = parent.x + (left as number);
    width = parent.width - (left as number) - (right as number);
  }

  let y: number;
  let height: number;
  if (hasTop && hasHeight) {
    y = parent.y + (top as number);
    height = explicitHeight as number;
  } else if (hasBottom && hasHeight) {
    y = parent.y + parent.height - (bottom as number) - (explicitHeight as number);
    height = explicitHeight as number;
  } else {
    y = parent.y + (top as number);
    height = parent.height - (top as number) - (bottom as number);
  }

  if (width < 0 || height < 0) {
    throw new MachinaLayoutError(
      "NegativeResolvedSize",
      `Resolved anchor frame size must be non-negative. Received width=${width}, height=${height}.`,
    );
  }

  return { x, y, width, height };
}

export function resolveFrame(parent: Rect, frame: FrameSpec): Rect {
  validateParentRect(parent);

  switch (frame.kind) {
    case "absolute": {
      assertFiniteNumber(frame.x, "frame.x");
      assertFiniteNumber(frame.y, "frame.y");
      assertNonNegativeSize(frame.width, "frame.width");
      assertNonNegativeSize(frame.height, "frame.height");

      return {
        x: parent.x + frame.x,
        y: parent.y + frame.y,
        width: frame.width,
        height: frame.height,
      };
    }
    case "anchor":
      return resolveAnchor(parent, frame);
    case "root":
      throw new MachinaLayoutError(
        "RootFrameWithoutRoot",
        "RootFrame can only be declared on the root row.",
      );
    case "fixed": {
      assertNonNegativeSize(frame.width, "frame.width");
      assertNonNegativeSize(frame.height, "frame.height");
      throw new MachinaLayoutError(
        "FixedFrameWithoutArranger",
        "Fixed frames require an arranger to determine placement.",
      );
    }
    case "fill":
      throw new MachinaLayoutError(
        "FillFrameWithoutArranger",
        "Fill frames require a stack arranger to determine placement.",
      );
    case "cell":
      throw new MachinaLayoutError(
        "CellFrameWithoutGrid",
        "Cell frames require a grid arranger to determine placement.",
      );
    case "guide":
      throw new MachinaLayoutError(
        "GuideTargetUnresolved",
        "Guide frames require document-level dependency resolution and cannot be resolved directly.",
      );
  }
}
