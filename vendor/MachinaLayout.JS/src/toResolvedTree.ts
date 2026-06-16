import { MachinaLayoutError } from "./errors";
import type {
  ResolvedLayoutDocument,
  ResolvedLayoutTree,
  ResolvedLayoutNode,
  NodeId,
} from "./types";

export function toResolvedTree(document: ResolvedLayoutDocument): ResolvedLayoutTree {
  const root = document.nodes[document.rootId];
  if (!root) {
    throw new MachinaLayoutError("MissingRoot", `root node '${document.rootId}' is missing`);
  }

  const visiting = new Set<NodeId>();
  const visited = new Set<NodeId>();

  const build = (node: ResolvedLayoutNode): ResolvedLayoutTree => {
    if (visiting.has(node.id)) {
      throw new MachinaLayoutError("Cycle", `cycle detected at '${node.id}'`);
    }

    visiting.add(node.id);
    visited.add(node.id);

    const childIds = document.children[node.id] ?? [];
    const children = childIds.map((childId) => {
      const child = document.nodes[childId];
      if (!child) {
        throw new MachinaLayoutError(
          "UnknownParent",
          `missing child node '${childId}' referenced by '${node.id}'`,
        );
      }
      return build(child);
    });

    visiting.delete(node.id);

    return {
      id: node.id,
      z: node.z,
      rect: { ...node.rect },
      frame: node.frame,
      arrange: node.arrange,
      view: node.view,
      slot: node.slot,
      debugLabel: node.debugLabel,
      layer: node.layer,
      offset: node.offset,
      children,
    };
  };

  const tree = build(root);

  for (const nodeId of Object.keys(document.nodes)) {
    if (!visited.has(nodeId)) {
      throw new MachinaLayoutError(
        "UnreachableNode",
        `node '${nodeId}' is unreachable from root '${document.rootId}'`,
      );
    }
  }

  return tree;
}
