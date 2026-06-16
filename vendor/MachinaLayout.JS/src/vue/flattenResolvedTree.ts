import type { ResolvedLayoutNode, ResolvedLayoutTree } from "./types";

export function flattenResolvedTree(tree: ResolvedLayoutTree): ResolvedLayoutNode[] {
  const out: ResolvedLayoutNode[] = [];

  const visit = (node: ResolvedLayoutTree): void => {
    out.push({
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
    });

    for (const child of node.children) {
      visit(child);
    }
  };

  visit(tree);
  return out;
}
