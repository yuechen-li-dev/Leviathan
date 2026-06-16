import { MachinaLayoutError } from "./errors";
import type { LayoutDocument, LayoutNode, LayoutRow, NodeId } from "./types";
import { assertFiniteNumber } from "./validation";

type ChildEntry = {
  childId: NodeId;
  orderValue: number;
  rowIndex: number;
};

export function compileLayoutRows(rows: LayoutRow[]): LayoutDocument {
  if (rows.length === 0) {
    throw new MachinaLayoutError("EmptyRows", "rows must contain at least one row.");
  }

  const nodes: Record<NodeId, LayoutNode> = {};
  const rowById = new Map<NodeId, LayoutRow>();
  const rootCandidates: NodeId[] = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];

    if (row.id.trim().length === 0) {
      throw new MachinaLayoutError("InvalidId", `row at index ${rowIndex} has an invalid id.`);
    }

    if (rowById.has(row.id)) {
      throw new MachinaLayoutError("DuplicateId", `duplicate id found: ${row.id}`);
    }

    if (row.order !== undefined) {
      assertFiniteNumber(row.order, `rows[${rowIndex}].order`);
    }

    if (row.frame.kind === "root" && row.parent !== undefined) {
      throw new MachinaLayoutError(
        "RootFrameNotRoot",
        `row ${row.id} uses RootFrame but is not a root row.`,
      );
    }

    if (row.z !== undefined) {
      assertFiniteNumber(row.z, `rows[${rowIndex}].z`);
      if (!Number.isInteger(row.z) || row.z < -5 || row.z > 5) {
        throw new MachinaLayoutError(
          "InvalidZ",
          `rows[${rowIndex}].z must be an integer in range -5..5`,
        );
      }
    }

    rowById.set(row.id, row);
    nodes[row.id] = {
      id: row.id,
      z: row.z,
      frame: row.frame,
      arrange: row.arrange,
      view: row.view,
      slot: row.slot,
      debugLabel: row.debugLabel,
      layer: row.layer,
      offset: row.offset,
    };

    if (row.parent === undefined) {
      rootCandidates.push(row.id);
    }
  }

  if (rootCandidates.length === 0) {
    throw new MachinaLayoutError("MissingRoot", "exactly one root is required, found none.");
  }

  if (rootCandidates.length > 1) {
    throw new MachinaLayoutError("MultipleRoots", "exactly one root is required, found multiple.");
  }

  const rootId = rootCandidates[0];

  if (nodes[rootId].frame.kind === "fill") {
    throw new MachinaLayoutError(
      "FillFrameWithoutArranger",
      "FillFrame cannot be used as the root frame.",
    );
  }
  if (nodes[rootId].frame.kind === "fixed") {
    throw new MachinaLayoutError(
      "FixedFrameWithoutArranger",
      "FixedFrame cannot be used as the root frame.",
    );
  }
  const childrenEntries = new Map<NodeId, ChildEntry[]>();

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (row.parent === undefined) {
      continue;
    }

    if (row.parent === row.id) {
      throw new MachinaLayoutError("SelfParent", `node ${row.id} cannot parent itself.`);
    }

    if (!rowById.has(row.parent) || row.parent.trim().length === 0) {
      throw new MachinaLayoutError(
        "UnknownParent",
        `node ${row.id} references unknown parent: ${row.parent}`,
      );
    }

    const entry: ChildEntry = {
      childId: row.id,
      orderValue: row.order ?? 0,
      rowIndex,
    };

    const list = childrenEntries.get(row.parent);
    if (list) {
      list.push(entry);
    } else {
      childrenEntries.set(row.parent, [entry]);
    }
  }

  const children: Record<NodeId, NodeId[]> = {};
  for (const [parentId, list] of childrenEntries.entries()) {
    list.sort((a, b) => a.orderValue - b.orderValue || a.rowIndex - b.rowIndex);
    children[parentId] = list.map((item) => item.childId);
  }

  const parentById = new Map<NodeId, NodeId | undefined>();
  for (const row of rows) {
    parentById.set(row.id, row.parent);
  }

  const chainState = new Map<NodeId, 0 | 1 | 2>();

  const detectParentChainCycle = (nodeId: NodeId): void => {
    const state = chainState.get(nodeId) ?? 0;
    if (state === 2) {
      return;
    }
    if (state === 1) {
      throw new MachinaLayoutError("Cycle", `cycle detected at node ${nodeId}`);
    }

    chainState.set(nodeId, 1);
    const parentId = parentById.get(nodeId);
    if (parentId !== undefined) {
      detectParentChainCycle(parentId);
    }
    chainState.set(nodeId, 2);
  };

  for (const row of rows) {
    detectParentChainCycle(row.id);
  }

  const visitState = new Map<NodeId, 0 | 1 | 2>();
  let visitedCount = 0;

  const dfs = (nodeId: NodeId): void => {
    const state = visitState.get(nodeId) ?? 0;
    if (state === 1) {
      throw new MachinaLayoutError("Cycle", `cycle detected at node ${nodeId}`);
    }
    if (state === 2) {
      return;
    }

    visitState.set(nodeId, 1);
    visitedCount += 1;

    for (const childId of children[nodeId] ?? []) {
      dfs(childId);
    }

    visitState.set(nodeId, 2);
  };

  dfs(rootId);

  if (visitedCount !== rows.length) {
    throw new MachinaLayoutError(
      "UnreachableNode",
      "one or more nodes are unreachable from the root.",
    );
  }

  return { rootId, nodes, children };
}
