import { MachinaLayoutError } from "./errors";
import { normalizePadding } from "./padding";
import type {
  ArrangeSpec,
  EdgeInsets,
  FrameSpec,
  LayerName,
  NodeId,
  Rect,
  ResolvedLayoutDocument,
  StackAxis,
  StackArrange,
} from "./types";

export type StackChildMetric = {
  id: NodeId;
  rect: Rect;
  mainStart: number;
  mainEnd: number;
  mainSize: number;
  crossStart: number;
  crossEnd: number;
  crossSize: number;
  frameKind: FrameSpec["kind"];
  z?: number;
  layer?: LayerName;
};

export type StackMainAxisMetrics = {
  parentId: NodeId;
  axis: StackAxis;
  parentRect: Rect;
  contentRect: Rect;
  padding: EdgeInsets;
  gap: number;
  childIds: NodeId[];
  childMetrics: StackChildMetric[];
  contentMainSize: number;
  contentCrossSize: number;
  totalChildMainSize: number;
  totalGapSize: number;
  usedMainSize: number;
  unusedMainSize: number;
};

function copyRect(rect: Rect): Rect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function applyPadding(parentRect: Rect, padding: EdgeInsets): Rect {
  return {
    x: parentRect.x + padding.left,
    y: parentRect.y + padding.top,
    width: parentRect.width - padding.left - padding.right,
    height: parentRect.height - padding.top - padding.bottom,
  };
}

function assertContentNonNegative(
  contentRect: Rect,
  code: "StackContentNegative" | "GridContentNegative",
): void {
  if (contentRect.width < 0 || contentRect.height < 0) {
    throw new MachinaLayoutError(
      code,
      `${code === "StackContentNegative" ? "stack" : "grid"} content size cannot be negative after applying padding`,
    );
  }
}

function requireNode(layout: ResolvedLayoutDocument, nodeId: NodeId) {
  const node = layout.nodes[nodeId];
  if (!node) throw new MachinaLayoutError("InvalidId", `node id not found: ${nodeId}`);
  return node;
}

function requireStackArrange(layout: ResolvedLayoutDocument, parentId: NodeId): StackArrange {
  const parent = requireNode(layout, parentId);
  if (parent.arrange?.kind !== "stack") {
    throw new MachinaLayoutError(
      "ExpectedStackArrange",
      `expected stack arrange for node: ${parentId}`,
    );
  }
  return parent.arrange;
}

export function getArrangeContentRect(parentRect: Rect, arrange?: ArrangeSpec): Rect {
  if (!arrange) return copyRect(parentRect);

  if (arrange.kind === "stack") {
    const contentRect = applyPadding(parentRect, normalizePadding(arrange.padding));
    assertContentNonNegative(contentRect, "StackContentNegative");
    return contentRect;
  }

  if (arrange.kind === "grid") {
    const contentRect = applyPadding(parentRect, normalizePadding(arrange.padding));
    assertContentNonNegative(contentRect, "GridContentNegative");
    return contentRect;
  }

  return copyRect(parentRect);
}

export function getStackContentRect(layout: ResolvedLayoutDocument, parentId: NodeId): Rect {
  const parent = requireNode(layout, parentId);
  const arrange = requireStackArrange(layout, parentId);
  return getArrangeContentRect(parent.rect, arrange);
}

export function getStackMainAxisMetrics(
  layout: ResolvedLayoutDocument,
  parentId: NodeId,
): StackMainAxisMetrics {
  const parent = requireNode(layout, parentId);
  const arrange = requireStackArrange(layout, parentId);
  const contentRect = getArrangeContentRect(parent.rect, arrange);
  const isHorizontal = arrange.axis === "horizontal";
  const childIds = [...(layout.children[parentId] ?? [])];
  const childMetrics = childIds.map((id): StackChildMetric => {
    const child = requireNode(layout, id);
    const rect = copyRect(child.rect);
    const mainStart = isHorizontal ? rect.x - contentRect.x : rect.y - contentRect.y;
    const mainSize = isHorizontal ? rect.width : rect.height;
    const crossStart = isHorizontal ? rect.y - contentRect.y : rect.x - contentRect.x;
    const crossSize = isHorizontal ? rect.height : rect.width;
    return {
      id,
      rect,
      mainStart,
      mainEnd: mainStart + mainSize,
      mainSize,
      crossStart,
      crossEnd: crossStart + crossSize,
      crossSize,
      frameKind: child.frame.kind,
      z: child.z,
      layer: child.layer,
    };
  });
  const contentMainSize = isHorizontal ? contentRect.width : contentRect.height;
  const contentCrossSize = isHorizontal ? contentRect.height : contentRect.width;
  const totalChildMainSize = childMetrics.reduce((sum, metric) => sum + metric.mainSize, 0);
  const totalGapSize = (arrange.gap ?? 0) * Math.max(0, childMetrics.length - 1);
  const usedMainSize = totalChildMainSize + totalGapSize;

  return {
    parentId,
    axis: arrange.axis,
    parentRect: copyRect(parent.rect),
    contentRect,
    padding: normalizePadding(arrange.padding),
    gap: arrange.gap ?? 0,
    childIds,
    childMetrics,
    contentMainSize,
    contentCrossSize,
    totalChildMainSize,
    totalGapSize,
    usedMainSize,
    unusedMainSize: contentMainSize - usedMainSize,
  };
}

export function getStackChildRects(
  layout: ResolvedLayoutDocument,
  parentId: NodeId,
): Record<NodeId, Rect> {
  requireStackArrange(layout, parentId);
  const rects: Record<NodeId, Rect> = {};
  for (const childId of layout.children[parentId] ?? []) {
    rects[childId] = copyRect(requireNode(layout, childId).rect);
  }
  return rects;
}

export function getRemainingStackRect(
  layout: ResolvedLayoutDocument,
  options: { parentId: NodeId; afterChildren?: NodeId[]; beforeChildren?: NodeId[] },
): Rect {
  const metrics = getStackMainAxisMetrics(layout, options.parentId);
  const byId = new Map(metrics.childMetrics.map((metric) => [metric.id, metric]));
  const after = options.afterChildren ?? [];
  const before = options.beforeChildren ?? [];
  const start =
    after.length === 0 ? 0 : Math.max(...after.map((id) => requireStackMetric(byId, id).mainEnd));
  const end =
    before.length === 0
      ? metrics.contentMainSize
      : Math.min(...before.map((id) => requireStackMetric(byId, id).mainStart));
  const size = end - start;
  if (size < 0) {
    throw new MachinaLayoutError(
      "StackQueryInvalidRange",
      `remaining stack interval is negative for parent: ${options.parentId}`,
    );
  }
  return metrics.axis === "horizontal"
    ? {
        x: metrics.contentRect.x + start,
        y: metrics.contentRect.y,
        width: size,
        height: metrics.contentRect.height,
      }
    : {
        x: metrics.contentRect.x,
        y: metrics.contentRect.y + start,
        width: metrics.contentRect.width,
        height: size,
      };
}

function requireStackMetric(
  metrics: Map<NodeId, StackChildMetric>,
  childId: NodeId,
): StackChildMetric {
  const metric = metrics.get(childId);
  if (!metric) throw new MachinaLayoutError("InvalidId", `stack child id not found: ${childId}`);
  return metric;
}
