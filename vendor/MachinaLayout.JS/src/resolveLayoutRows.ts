import { compileLayoutRows } from "./compileLayoutRows";
import { resolveLayoutDocument } from "./resolveLayoutDocument";
import { selectLayoutRowsForRoot } from "./selectLayoutRowsForRoot";
import type { LayoutRow, Rect, ResolvedLayoutDocument } from "./types";

export function resolveLayoutRows(rows: LayoutRow[], rootRect: Rect): ResolvedLayoutDocument {
  const selectedRows = selectLayoutRowsForRoot(rows, rootRect);
  const document = compileLayoutRows(selectedRows);
  return resolveLayoutDocument(document, rootRect);
}
