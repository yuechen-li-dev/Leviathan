import { MachinaLayoutError } from "./errors";
import type { Rect, ResolvedLayoutDocument, ResolvedLayoutNode } from "./types";

function assertFiniteNumber(value: number): void {
  if (!Number.isFinite(value)) {
    throw new MachinaLayoutError(
      "NonFiniteNumber",
      `Expected finite number, got ${String(value)}.`,
    );
  }
}

function sameStringArray(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
}

function assertCompatibleResolvedLayouts(
  a: ResolvedLayoutDocument,
  b: ResolvedLayoutDocument,
): void {
  if (a.rootId !== b.rootId) {
    throw new MachinaLayoutError(
      "IncompatibleLayouts",
      `Layout roots differ: ${a.rootId} !== ${b.rootId}.`,
    );
  }

  if (!(a.rootId in a.nodes) || !(b.rootId in b.nodes)) {
    throw new MachinaLayoutError(
      "IncompatibleLayouts",
      `Root id ${a.rootId} must exist in both node maps.`,
    );
  }

  const aNodeIds = Object.keys(a.nodes).sort();
  const bNodeIds = Object.keys(b.nodes).sort();
  if (!sameStringArray(aNodeIds, bNodeIds)) {
    throw new MachinaLayoutError(
      "IncompatibleLayouts",
      "Resolved layouts must have the same node ids.",
    );
  }

  const aParentIds = Object.keys(a.children).sort();
  const bParentIds = Object.keys(b.children).sort();
  if (!sameStringArray(aParentIds, bParentIds)) {
    throw new MachinaLayoutError(
      "IncompatibleLayouts",
      "Resolved layouts must have the same parent-child map.",
    );
  }

  for (const parentId of aParentIds) {
    const aChildren = a.children[parentId] ?? [];
    const bChildren = b.children[parentId] ?? [];
    if (!sameStringArray(aChildren, bChildren)) {
      throw new MachinaLayoutError(
        "IncompatibleLayouts",
        `Child order differs for parent ${parentId}.`,
      );
    }
  }
}

function copyChildren(
  children: Readonly<Record<string, readonly string[]>>,
): Record<string, string[]> {
  const copied: Record<string, string[]> = {};
  for (const [parentId, childIds] of Object.entries(children)) {
    copied[parentId] = [...childIds];
  }
  return copied;
}

export function lerpNumber(a: number, b: number, t: number): number {
  assertFiniteNumber(a);
  assertFiniteNumber(b);
  assertFiniteNumber(t);
  return a + (b - a) * t;
}

export function lerpRect(a: Rect, b: Rect, t: number): Rect {
  return {
    x: lerpNumber(a.x, b.x, t),
    y: lerpNumber(a.y, b.y, t),
    width: lerpNumber(a.width, b.width, t),
    height: lerpNumber(a.height, b.height, t),
  };
}

export function lerpResolvedLayouts(
  a: ResolvedLayoutDocument,
  b: ResolvedLayoutDocument,
  t: number,
): ResolvedLayoutDocument {
  assertFiniteNumber(t);
  assertCompatibleResolvedLayouts(a, b);

  const nodes: Record<string, ResolvedLayoutNode> = {};
  for (const id of Object.keys(b.nodes)) {
    const aNode = a.nodes[id];
    const bNode = b.nodes[id];
    nodes[id] = {
      ...bNode,
      rect: lerpRect(aNode.rect, bNode.rect, t),
    };
  }

  return {
    rootId: b.rootId,
    nodes,
    children: copyChildren(b.children),
  };
}
