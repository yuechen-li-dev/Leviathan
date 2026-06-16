import type { Rect } from "./types";

export function formatRect(rect: Rect): string {
  return `x=${rect.x} y=${rect.y} w=${rect.width} h=${rect.height}`;
}
