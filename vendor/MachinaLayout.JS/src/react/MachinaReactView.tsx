import React from "react";

import { getMachinaDebugOverlayBehavior, type MachinaDebugOverlayMode } from "../deus";
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

export type MachinaReactDebugOverlayOptions = {
  mode?: MachinaDebugOverlayMode;
  labels?: boolean;
  borders?: boolean;
  selectedNodeId?: string;
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
  debugOverlay?: MachinaReactDebugOverlayOptions;
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

function collectOverlayNodes(node: ResolvedLayoutTree): ResolvedLayoutTree[] {
  return [node, ...node.children.flatMap((child) => collectOverlayNodes(child))];
}

function renderDebugOverlay(
  tree: ResolvedLayoutTree,
  options: MachinaReactDebugOverlayOptions,
): React.ReactElement | null {
  const board = {
    mode: options.mode ?? "collapsed",
    labels: options.labels ?? true,
    borders: options.borders ?? true,
    selectedNodeId: options.selectedNodeId,
  };
  const behavior = getMachinaDebugOverlayBehavior(board);
  if (!behavior.visible) return null;

  const nodes = collectOverlayNodes(tree);
  return (
    <div
      data-testid="machina-debug-overlay"
      data-machina-debug-overlay-mode={board.mode}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: behavior.pointerEvents,
        zIndex: 10000,
        boxSizing: "border-box",
      }}
    >
      {nodes.map((node) => (
        <div
          key={node.id}
          data-testid={`machina-debug-overlay-node-${node.id}`}
          data-machina-debug-overlay-node-id={node.id}
          style={{
            position: "absolute",
            left: node.rect.x - tree.rect.x,
            top: node.rect.y - tree.rect.y,
            width: node.rect.width,
            height: node.rect.height,
            boxSizing: "border-box",
            border: behavior.showBorders ? "1px solid rgba(14, 165, 233, 0.9)" : "0",
            pointerEvents: behavior.pointerEvents,
          }}
        >
          {behavior.showLabels ? (
            <span
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                fontSize: 10,
                lineHeight: "12px",
                background: "rgba(14, 165, 233, 0.9)",
                color: "white",
                padding: "0 3px",
              }}
            >
              {node.debugLabel ?? node.id}
            </span>
          ) : null}
        </div>
      ))}
      {behavior.showPanel ? (
        <div
          data-testid="machina-debug-overlay-panel"
          style={{
            position: "absolute",
            right: 8,
            top: 8,
            background: "rgba(15, 23, 42, 0.92)",
            color: "white",
            padding: 8,
          }}
        >
          Debug overlay{board.selectedNodeId ? `: ${board.selectedNodeId}` : ""}
        </div>
      ) : null}
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
    debugOverlay,
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
      {debugOverlay ? renderDebugOverlay(tree, debugOverlay) : null}
    </div>
  );
}
