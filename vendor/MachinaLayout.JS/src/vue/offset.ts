import { resolveUiLength } from "./length";
import type { OffsetSpec, Rect } from "./types";

export function applyOffset(rect: Rect, parentRect: Rect, offset?: OffsetSpec): Rect {
  const dx = offset?.x === undefined ? 0 : resolveUiLength(offset.x, parentRect.width);
  const dy = offset?.y === undefined ? 0 : resolveUiLength(offset.y, parentRect.height);

  return {
    x: rect.x + dx,
    y: rect.y + dy,
    width: rect.width,
    height: rect.height,
  };
}
