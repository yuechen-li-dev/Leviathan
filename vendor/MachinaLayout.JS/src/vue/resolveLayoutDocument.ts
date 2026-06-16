import { MachinaLayoutError } from "./errors";
import { resolveUiLength } from "./length";
import { normalizePadding } from "./padding";
import { applyOffset } from "./offset";
import { resolveFrame } from "./resolveFrame";
import type {
  EdgeRef,
  GridTrack,
  GuideFrame,
  GuideLength,
  LayoutDocument,
  NodeId,
  Rect,
  RectEdge,
  ResolvedLayoutDocument,
  ResolvedLayoutNode,
  StackAlign,
  StackArrange,
  StackJustify,
  UiLength,
} from "./types";
import { assertFiniteNumber, assertNonNegativeGap, assertNonNegativeSize } from "./validation";

function validateRootRect(rootRect: Rect): void {
  assertFiniteNumber(rootRect.x, "rootRect.x");
  assertFiniteNumber(rootRect.y, "rootRect.y");
  assertNonNegativeSize(rootRect.width, "rootRect.width");
  assertNonNegativeSize(rootRect.height, "rootRect.height");
}
const H_EDGES = new Set<RectEdge>(["left", "right", "centerX"]);
const V_EDGES = new Set<RectEdge>(["top", "bottom", "centerY"]);
const ALL_EDGES = new Set<RectEdge>(["left", "right", "top", "bottom", "centerX", "centerY"]);
const isEdgeRef = (value: GuideLength | undefined): value is EdgeRef =>
  Boolean(value && typeof value === "object" && "ref" in value && "edge" in value);

function getRectEdgeValue(rect: Rect, edge: RectEdge): number {
  switch (edge) {
    case "left":
      return rect.x;
    case "right":
      return rect.x + rect.width;
    case "centerX":
      return rect.x + rect.width / 2;
    case "top":
      return rect.y;
    case "bottom":
      return rect.y + rect.height;
    case "centerY":
      return rect.y + rect.height / 2;
    default:
      throw new MachinaLayoutError("InvalidGuideFrame", `unknown guide edge: ${String(edge)}`);
  }
}

function validateGuideFrame(nodeId: NodeId, frame: GuideFrame, document: LayoutDocument): void {
  const hCount =
    Number(frame.left !== undefined) +
    Number(frame.right !== undefined) +
    Number(frame.width !== undefined);
  const vCount =
    Number(frame.top !== undefined) +
    Number(frame.bottom !== undefined) +
    Number(frame.height !== undefined);
  if (hCount !== 2 || vCount !== 2)
    throw new MachinaLayoutError(
      "InvalidGuideFrame",
      `guide frame must provide exactly two constraints per axis: ${nodeId}`,
    );

  const hRefs = [frame.left, frame.right].filter(isEdgeRef);
  const vRefs = [frame.top, frame.bottom].filter(isEdgeRef);
  if (hRefs.length > 1 || vRefs.length > 1)
    throw new MachinaLayoutError(
      "GuideTooManyReferencesPerAxis",
      `guide has too many refs on one axis: ${nodeId}`,
    );

  for (const ref of [...hRefs, ...vRefs]) {
    if (ref.ref === nodeId)
      throw new MachinaLayoutError(
        "GuideSelfReference",
        `guide cannot reference itself: ${nodeId}`,
      );
    if (!document.nodes[ref.ref])
      throw new MachinaLayoutError("GuideTargetNotFound", `guide target not found: ${ref.ref}`);
    if (!ALL_EDGES.has(ref.edge))
      throw new MachinaLayoutError("InvalidGuideFrame", `unknown edge: ${String(ref.edge)}`);
  }
  for (const ref of hRefs)
    if (!H_EDGES.has(ref.edge))
      throw new MachinaLayoutError(
        "GuideInvalidEdgeForAxis",
        `horizontal guide ref must use horizontal edge: ${nodeId}`,
      );
  for (const ref of vRefs)
    if (!V_EDGES.has(ref.edge))
      throw new MachinaLayoutError(
        "GuideInvalidEdgeForAxis",
        `vertical guide ref must use vertical edge: ${nodeId}`,
      );
}

function resolveGuidePosition(
  parentRect: Rect,
  side: "left" | "right" | "top" | "bottom",
  value: GuideLength,
  resolvedNodes: Record<NodeId, ResolvedLayoutNode>,
): number {
  if (isEdgeRef(value)) {
    const target = resolvedNodes[value.ref];
    if (!target)
      throw new MachinaLayoutError(
        "GuideTargetUnresolved",
        `guide target unresolved: ${value.ref}`,
      );
    const axisSize = side === "left" || side === "right" ? parentRect.width : parentRect.height;
    const offset =
      value.offset === undefined
        ? 0
        : resolveUiLength(value.offset, axisSize, `frame.${side}.offset`);
    return getRectEdgeValue(target.rect, value.edge) + offset;
  }
  const axisSize = side === "left" || side === "right" ? parentRect.width : parentRect.height;
  const scalar = resolveUiLength(value as UiLength, axisSize, `frame.${side}`);
  if (side === "left") return parentRect.x + scalar;
  if (side === "right") return parentRect.x + parentRect.width - scalar;
  if (side === "top") return parentRect.y + scalar;
  return parentRect.y + parentRect.height - scalar;
}

function resolveGuideFrame(
  parentRect: Rect,
  frame: GuideFrame,
  resolvedNodes: Record<NodeId, ResolvedLayoutNode>,
): Rect {
  const hasLeft = frame.left !== undefined;
  const hasRight = frame.right !== undefined;
  const hasWidth = frame.width !== undefined;
  const hasTop = frame.top !== undefined;
  const hasBottom = frame.bottom !== undefined;
  const hasHeight = frame.height !== undefined;
  const left = hasLeft
    ? resolveGuidePosition(parentRect, "left", frame.left!, resolvedNodes)
    : undefined;
  const right = hasRight
    ? resolveGuidePosition(parentRect, "right", frame.right!, resolvedNodes)
    : undefined;
  const top = hasTop
    ? resolveGuidePosition(parentRect, "top", frame.top!, resolvedNodes)
    : undefined;
  const bottom = hasBottom
    ? resolveGuidePosition(parentRect, "bottom", frame.bottom!, resolvedNodes)
    : undefined;
  const explicitWidth = hasWidth
    ? resolveUiLength(frame.width!, parentRect.width, "frame.width")
    : undefined;
  const explicitHeight = hasHeight
    ? resolveUiLength(frame.height!, parentRect.height, "frame.height")
    : undefined;
  if (hasWidth) assertNonNegativeSize(explicitWidth as number, "frame.width");
  if (hasHeight) assertNonNegativeSize(explicitHeight as number, "frame.height");

  const x = hasLeft && hasWidth ? left! : hasRight && hasWidth ? right! - explicitWidth! : left!;
  const width = hasWidth ? explicitWidth! : right! - left!;
  const y = hasTop && hasHeight ? top! : hasBottom && hasHeight ? bottom! - explicitHeight! : top!;
  const height = hasHeight ? explicitHeight! : bottom! - top!;
  if (width < 0 || height < 0)
    throw new MachinaLayoutError(
      "NegativeResolvedSize",
      `Resolved guide frame size must be non-negative. Received width=${width}, height=${height}.`,
    );
  return { x, y, width, height };
}

function resolveStackChildRects(
  parentRect: Rect,
  arrange: StackArrange,
  childIds: NodeId[],
  document: LayoutDocument,
): Record<NodeId, Rect> {
  /* unchanged */
  const gap = arrange.gap ?? 0;
  const justify: StackJustify = arrange.justify ?? "start";
  const align: StackAlign = arrange.align ?? "start";
  assertNonNegativeGap(gap, "gap");
  const padding = normalizePadding(arrange.padding);
  const content: Rect = {
    x: parentRect.x + padding.left,
    y: parentRect.y + padding.top,
    width: parentRect.width - padding.left - padding.right,
    height: parentRect.height - padding.top - padding.bottom,
  };
  if (content.width < 0 || content.height < 0)
    throw new MachinaLayoutError(
      "StackContentNegative",
      "stack content size cannot be negative after applying padding",
    );
  const isHorizontal = arrange.axis === "horizontal";
  const contentMain = isHorizontal ? content.width : content.height;
  const contentCross = isHorizontal ? content.height : content.width;
  const childMainSizes: number[] = [];
  const childCrossSizes: number[] = [];
  const fillWeights: number[] = [];
  for (const childId of childIds) {
    const childNode = document.nodes[childId];
    if (!childNode)
      throw new MachinaLayoutError(
        "UnknownParent",
        `child id ${childId} referenced by arranged parent is missing`,
      );
    if (childNode.frame.kind === "fixed") {
      assertNonNegativeSize(childNode.frame.width, `${childId}.frame.width`);
      assertNonNegativeSize(childNode.frame.height, `${childId}.frame.height`);
      childMainSizes.push(isHorizontal ? childNode.frame.width : childNode.frame.height);
      childCrossSizes.push(isHorizontal ? childNode.frame.height : childNode.frame.width);
      fillWeights.push(0);
      continue;
    }
    if (childNode.frame.kind !== "fill")
      throw new MachinaLayoutError(
        "StackChildMustBeFixed",
        `stack child must use fixed or fill frame: ${childId}`,
      );
    const weight = childNode.frame.weight ?? 1;
    assertFiniteNumber(weight, `${childId}.frame.weight`);
    if (weight <= 0)
      throw new MachinaLayoutError(
        "InvalidFillWeight",
        `${childId}.frame.weight must be greater than 0`,
      );
    const cross = childNode.frame.cross ?? "fill";
    let childCross = contentCross;
    if (cross !== "fill") {
      assertNonNegativeSize(cross, `${childId}.frame.cross`);
      childCross = cross;
    }
    childMainSizes.push(0);
    childCrossSizes.push(childCross);
    fillWeights.push(weight);
  }
  const fixedMainTotal = childIds.reduce(
    (sum, _id, i) => sum + (fillWeights[i] === 0 ? childMainSizes[i] : 0),
    0,
  );
  const totalGap = gap * Math.max(0, childIds.length - 1);
  const remainingMain = contentMain - fixedMainTotal - totalGap;
  if (remainingMain < 0) throw new MachinaLayoutError("StackOverflow", "stack main axis overflow");
  const totalFillWeight = fillWeights.reduce((sum, w) => sum + w, 0);
  if (totalFillWeight > 0)
    for (let i = 0; i < childMainSizes.length; i += 1)
      if (fillWeights[i] > 0)
        childMainSizes[i] = (remainingMain * fillWeights[i]) / totalFillWeight;
  for (const childCross of childCrossSizes)
    if (childCross > contentCross)
      throw new MachinaLayoutError("StackOverflow", "stack cross axis overflow");
  const occupiedMain = childMainSizes.reduce((sum, size) => sum + size, 0) + totalGap;
  const remainingMainAfterFill = contentMain - occupiedMain;
  let startOffset = 0;
  let actualGap = gap;
  if (totalFillWeight === 0) {
    if (justify === "center") startOffset = remainingMainAfterFill / 2;
    else if (justify === "end") startOffset = remainingMainAfterFill;
    else if (justify === "space-between")
      actualGap = childIds.length <= 1 ? 0 : gap + remainingMainAfterFill / (childIds.length - 1);
  }
  const rects: Record<NodeId, Rect> = {};
  let currentMain = startOffset;
  childIds.forEach((childId, index) => {
    const childMain = childMainSizes[index];
    const childCross = childCrossSizes[index];
    let crossOffset = 0;
    if (align === "center") crossOffset = (contentCross - childCross) / 2;
    else if (align === "end") crossOffset = contentCross - childCross;
    rects[childId] = isHorizontal
      ? {
          x: content.x + currentMain,
          y: content.y + crossOffset,
          width: childMain,
          height: childCross,
        }
      : {
          x: content.x + crossOffset,
          y: content.y + currentMain,
          width: childCross,
          height: childMain,
        };
    currentMain += childMain + actualGap;
  });
  return rects;
}

type ResolvedGridTrack = { start: number; size: number };
function validateGridTrack(track: GridTrack, axis: "columns" | "rows", index: number): void {
  if (track.kind === "fixed") {
    if (!Number.isFinite(track.size) || track.size < 0)
      throw new MachinaLayoutError(
        "InvalidGridTrack",
        `${axis}[${index}].size must be finite and non-negative`,
      );
    return;
  }
  if (track.kind === "fill") {
    const weight = track.weight ?? 1;
    if (!Number.isFinite(weight) || weight <= 0)
      throw new MachinaLayoutError(
        "InvalidGridTrack",
        `${axis}[${index}].weight must be finite and greater than 0`,
      );
    return;
  }
  throw new MachinaLayoutError("InvalidGridTrack", `${axis}[${index}] has unknown track kind`);
}
function resolveGridTracks(
  contentAxisSize: number,
  tracks: GridTrack[],
  gap: number,
  axis: "columns" | "rows",
): ResolvedGridTrack[] {
  if (!Number.isFinite(gap) || gap < 0 || tracks.length === 0)
    throw new MachinaLayoutError("InvalidGridTrack", `invalid ${axis} configuration`);
  tracks.forEach((t, i) => {
    validateGridTrack(t, axis, i);
  });
  const fixedTotal = tracks.reduce((s, t) => s + (t.kind === "fixed" ? t.size : 0), 0);
  const gapTotal = gap * Math.max(0, tracks.length - 1);
  const remaining = contentAxisSize - fixedTotal - gapTotal;
  if (remaining < 0) throw new MachinaLayoutError("GridOverflow", `grid ${axis} overflow`);
  const totalWeight = tracks.reduce((s, t) => s + (t.kind === "fill" ? (t.weight ?? 1) : 0), 0);
  const sizes = tracks.map((t) =>
    t.kind === "fixed"
      ? t.size
      : totalWeight <= 0
        ? 0
        : (remaining * (t.weight ?? 1)) / totalWeight,
  );
  let current = 0;
  return sizes.map((size) => {
    const r = { start: current, size };
    current += size + gap;
    return r;
  });
}
function resolveGridChildRect(
  childNode: LayoutDocument["nodes"][NodeId],
  columns: ResolvedGridTrack[],
  rows: ResolvedGridTrack[],
  columnGap: number,
  rowGap: number,
  content: Rect,
): Rect {
  if (childNode.frame.kind !== "cell")
    throw new MachinaLayoutError(
      "GridChildMustBeCell",
      `grid child must use cell frame: ${childNode.id}`,
    );
  const { row, col } = childNode.frame;
  const rowSpan = childNode.frame.rowSpan ?? 1;
  const colSpan = childNode.frame.colSpan ?? 1;
  if (
    !Number.isInteger(row) ||
    row < 0 ||
    !Number.isInteger(col) ||
    col < 0 ||
    !Number.isInteger(rowSpan) ||
    rowSpan <= 0 ||
    !Number.isInteger(colSpan) ||
    colSpan <= 0
  )
    throw new MachinaLayoutError(
      "InvalidGridCell",
      `invalid cell coordinates/spans for node ${childNode.id}`,
    );
  if (row + rowSpan > rows.length || col + colSpan > columns.length)
    throw new MachinaLayoutError(
      "InvalidGridCell",
      `cell exceeds grid bounds for node ${childNode.id}`,
    );
  const x = content.x + columns[col].start;
  const y = content.y + rows[row].start;
  let width = columnGap * (colSpan - 1);
  for (let i = col; i < col + colSpan; i += 1) width += columns[i].size;
  let height = rowGap * (rowSpan - 1);
  for (let i = row; i < row + rowSpan; i += 1) height += rows[i].size;
  return { x, y, width, height };
}

type PendingGuide = { nodeId: NodeId; parentId: NodeId };

export function resolveLayoutDocument(
  document: LayoutDocument,
  rootRect: Rect,
): ResolvedLayoutDocument {
  validateRootRect(rootRect);
  const rootNode = document.nodes[document.rootId];
  if (!rootNode)
    throw new MachinaLayoutError("MissingRoot", `root node not found for id: ${document.rootId}`);

  const resolvedNodes: Record<NodeId, ResolvedLayoutNode> = {};
  const resolvedChildren: Record<NodeId, NodeId[]> = {};
  const visitState = new Map<NodeId, 0 | 1 | 2>();
  const pendingGuides = new Map<NodeId, PendingGuide>();

  const resolveNode = (nodeId: NodeId, rect: Rect): void => {
    const state = visitState.get(nodeId) ?? 0;
    if (state === 1) throw new MachinaLayoutError("Cycle", `cycle detected at node ${nodeId}`);
    if (state === 2) return;
    const node = document.nodes[nodeId];
    if (!node)
      throw new MachinaLayoutError(
        "UnknownParent",
        `node referenced in children but missing from nodes: ${nodeId}`,
      );
    visitState.set(nodeId, 1);
    resolvedNodes[nodeId] = {
      id: node.id,
      z: node.z,
      rect: { ...rect },
      frame: node.frame,
      arrange: node.arrange,
      view: node.view,
      slot: node.slot,
      debugLabel: node.debugLabel,
      layer: node.layer,
      offset: node.offset,
    };
    const childIds = document.children[nodeId] ?? [];
    resolvedChildren[nodeId] = [...childIds];

    let childRects: Record<NodeId, Rect> | undefined;
    if (node.arrange?.kind === "stack")
      childRects = resolveStackChildRects(rect, node.arrange, childIds, document);
    else if (node.arrange?.kind === "grid") {
      const columnGap = node.arrange.columnGap ?? 0;
      const rowGap = node.arrange.rowGap ?? 0;
      const padding = normalizePadding(node.arrange.padding);
      const content: Rect = {
        x: rect.x + padding.left,
        y: rect.y + padding.top,
        width: rect.width - padding.left - padding.right,
        height: rect.height - padding.top - padding.bottom,
      };
      if (content.width < 0 || content.height < 0)
        throw new MachinaLayoutError(
          "GridContentNegative",
          "grid content size cannot be negative after applying padding",
        );
      const columns = resolveGridTracks(content.width, node.arrange.columns, columnGap, "columns");
      const rows = resolveGridTracks(content.height, node.arrange.rows, rowGap, "rows");
      childRects = {};
      for (const childId of childIds) {
        const childNode = document.nodes[childId];
        if (!childNode)
          throw new MachinaLayoutError(
            "UnknownParent",
            `child id ${childId} referenced by ${nodeId} is missing`,
          );
        childRects[childId] = resolveGridChildRect(
          childNode,
          columns,
          rows,
          columnGap,
          rowGap,
          content,
        );
      }
    }

    for (const childId of childIds) {
      const childNode = document.nodes[childId];
      if (!childNode)
        throw new MachinaLayoutError(
          "UnknownParent",
          `child id ${childId} referenced by ${nodeId} is missing`,
        );
      if (childNode.frame.kind === "guide" && !childRects) {
        validateGuideFrame(childId, childNode.frame, document);
        pendingGuides.set(childId, { nodeId: childId, parentId: nodeId });
        continue;
      }
      const normalChildRect = childRects?.[childId] ?? resolveFrame(rect, childNode.frame);
      resolveNode(childId, applyOffset(normalChildRect, rect, childNode.offset));
    }

    visitState.set(nodeId, 2);
  };

  const processPending = (): void => {
    while (pendingGuides.size > 0) {
      let progressed = false;
      for (const [id, pending] of [...pendingGuides.entries()]) {
        const parentResolved = resolvedNodes[pending.parentId];
        const node = document.nodes[id];
        if (!parentResolved || !node || node.frame.kind !== "guide") continue;
        const refs = [node.frame.left, node.frame.right, node.frame.top, node.frame.bottom].filter(
          isEdgeRef,
        );
        if (refs.some((r) => !resolvedNodes[r.ref])) continue;
        const rect = resolveGuideFrame(parentResolved.rect, node.frame, resolvedNodes);
        resolveNode(id, applyOffset(rect, parentResolved.rect, node.offset));
        pendingGuides.delete(id);
        progressed = true;
      }
      if (pendingGuides.size === 0) return;
      if (progressed) continue;

      const remaining = new Set([...pendingGuides.keys()]);
      const visiting = new Set<NodeId>();
      const visited = new Set<NodeId>();
      const hasCycle = (id: NodeId): boolean => {
        if (visiting.has(id)) return true;
        if (visited.has(id)) return false;
        visiting.add(id);
        const node = document.nodes[id];
        if (node?.frame.kind === "guide") {
          for (const ref of [
            node.frame.left,
            node.frame.right,
            node.frame.top,
            node.frame.bottom,
          ].filter(isEdgeRef)) {
            if (remaining.has(ref.ref) && hasCycle(ref.ref)) return true;
          }
        }
        visiting.delete(id);
        visited.add(id);
        return false;
      };
      for (const id of remaining) {
        if (hasCycle(id))
          throw new MachinaLayoutError("GuideReferenceCycle", "guide reference cycle detected");
      }
      throw new MachinaLayoutError(
        "GuideTargetUnresolved",
        "one or more guide targets could not be resolved",
      );
    }
  };

  resolveNode(document.rootId, { ...rootRect });
  processPending();
  if (Object.keys(resolvedNodes).length !== Object.keys(document.nodes).length)
    throw new MachinaLayoutError(
      "UnreachableNode",
      "one or more nodes are unreachable from the root.",
    );
  return { rootId: document.rootId, nodes: resolvedNodes, children: resolvedChildren };
}
