import React from "react";

import { toResolvedTree } from "../toResolvedTree";
import type {
  NodeId,
  Rect,
  ResolvedLayoutDocument,
  ResolvedLayoutNode,
  ResolvedLayoutTree,
} from "../types";

export type MachinaSlotProps<TViewData = unknown, TNodeData = unknown> = {
  id: NodeId;
  rect: Rect;
  debugLabel?: string;
  node: ResolvedLayoutNode;
  viewKey?: string;
  viewData?: TViewData;
  nodeData?: TNodeData;
};

export type MachinaRenderLayer = {
  z: number;
};

export type MachinaReactViewProps = {
  layout: ResolvedLayoutDocument;
  views?: Record<string, React.ComponentType<MachinaSlotProps>>;
  viewData?: Record<string, unknown>;
  nodeData?: Record<NodeId, unknown>;
  className?: string;
  style?: React.CSSProperties;
  nodeClassName?: string;
  debug?: boolean;
  nodeContainment?: "none" | "layout-paint" | "strict";
  nodeContentVisibility?: "none" | "auto";
  nodeContainIntrinsicSize?: string;
  layers?: Record<string, MachinaRenderLayer>;
  defaultLayer?: string;
};

function normalizeLayerZ(value: number | undefined): number {
  if (
    value === undefined ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < -5 ||
    value > 5
  ) {
    return 0;
  }
  return value;
}

function getEffectiveLayer(node: ResolvedLayoutTree, defaultLayer: string): string {
  return node.layer ?? defaultLayer;
}

function getEffectiveLayerZ(
  node: ResolvedLayoutTree,
  layers: Record<string, MachinaRenderLayer>,
  defaultLayer: string,
): number {
  const layerName = getEffectiveLayer(node, defaultLayer);
  return normalizeLayerZ(layers[layerName]?.z);
}

function renderNode(
  node: ResolvedLayoutTree,
  parentRect: Rect,
  views: Record<string, React.ComponentType<MachinaSlotProps>>,
  viewData: Record<string, unknown> | undefined,
  nodeData: Record<NodeId, unknown> | undefined,
  nodeClassName: string | undefined,
  debug: boolean | undefined,
  nodeContainment: "none" | "layout-paint" | "strict",
  nodeContentVisibility: "none" | "auto",
  nodeContainIntrinsicSize: string | undefined,
  nodesById: ResolvedLayoutDocument["nodes"],
  layers: Record<string, MachinaRenderLayer>,
  defaultLayer: string,
): React.ReactElement {
  const viewKey = node.view ?? node.slot;
  const View = viewKey ? views[viewKey] : undefined;
  const selectedViewData = viewKey ? viewData?.[viewKey] : undefined;
  const selectedNodeData = nodeData?.[node.id];
  const left = node.rect.x - parentRect.x;
  const top = node.rect.y - parentRect.y;

  const effectiveLayer = getEffectiveLayer(node, defaultLayer);
  const effectiveLayerZ = getEffectiveLayerZ(node, layers, defaultLayer);
  const style: React.CSSProperties = {
    position: "absolute",
    left,
    top,
    width: node.rect.width,
    height: node.rect.height,
    boxSizing: "border-box",
    zIndex: effectiveLayerZ * 100 + (node.z ?? 0),
    ...(nodeContainment === "layout-paint" ? { contain: "layout paint" } : null),
    ...(nodeContainment === "strict" ? { contain: "strict" } : null),
    ...(nodeContentVisibility === "auto" ? { contentVisibility: "auto" } : null),
    ...(nodeContainIntrinsicSize !== undefined
      ? { containIntrinsicSize: nodeContainIntrinsicSize }
      : null),
    ...(debug ? { outline: "1px dashed rgba(59, 130, 246, 0.9)" } : null),
  };

  const renderedSlot =
    View && nodesById[node.id]
      ? React.createElement(View, {
          id: node.id,
          rect: { ...node.rect },
          debugLabel: node.debugLabel,
          node: { ...nodesById[node.id], rect: { ...nodesById[node.id].rect } },
          viewKey,
          viewData: selectedViewData,
          nodeData: selectedNodeData,
        })
      : null;

  return (
    <div
      key={node.id}
      data-testid={`machina-node-${node.id}`}
      className={nodeClassName}
      style={style}
      data-machina-node-id={node.id}
      data-machina-slot={node.slot}
      data-machina-view={viewKey}
      data-machina-debug-label={node.debugLabel}
      data-machina-layer={effectiveLayer}
    >
      {debug ? <small>{node.debugLabel ?? node.id}</small> : null}
      {renderedSlot}
      {[...node.children]
        .map((child, index) => ({ child, index }))
        .sort(
          (a, b) =>
            getEffectiveLayerZ(a.child, layers, defaultLayer) -
              getEffectiveLayerZ(b.child, layers, defaultLayer) ||
            (a.child.z ?? 0) - (b.child.z ?? 0) ||
            a.index - b.index,
        )
        .map(({ child }) =>
          renderNode(
            child,
            node.rect,
            views,
            viewData,
            nodeData,
            nodeClassName,
            debug,
            nodeContainment,
            nodeContentVisibility,
            nodeContainIntrinsicSize,
            nodesById,
            layers,
            defaultLayer,
          ),
        )}
    </div>
  );
}

export function MachinaReactView(props: MachinaReactViewProps): React.JSX.Element {
  const {
    layout,
    views = {},
    viewData,
    nodeData,
    className,
    style,
    nodeClassName,
    debug,
    nodeContainment = "layout-paint",
    nodeContentVisibility = "none",
    nodeContainIntrinsicSize,
    layers = { base: { z: 0 } },
    defaultLayer = "base",
  } = props;
  const tree = toResolvedTree(layout);

  const wrapperStyle: React.CSSProperties = {
    position: "relative",
    width: tree.rect.width,
    height: tree.rect.height,
    ...style,
  };

  return (
    <div className={className} style={wrapperStyle} data-machina-root-id={tree.id}>
      {renderNode(
        tree,
        tree.rect,
        views,
        viewData,
        nodeData,
        nodeClassName,
        debug,
        nodeContainment,
        nodeContentVisibility,
        nodeContainIntrinsicSize,
        layout.nodes,
        layers,
        defaultLayer,
      )}
    </div>
  );
}
