import React from "react";
import { Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

import { toResolvedTree } from "../toResolvedTree";
import type {
  NodeId,
  Rect,
  ResolvedLayoutDocument,
  ResolvedLayoutNode,
  ResolvedLayoutTree,
} from "../types";

export type MachinaNativeSlotProps<TViewData = unknown, TNodeData = unknown> = {
  id: NodeId;
  rect: Rect;
  debugLabel?: string;
  node: ResolvedLayoutNode;
  viewKey?: string;
  viewData?: TViewData;
  nodeData?: TNodeData;
};

export type MachinaReactNativeLayer = {
  z: number;
};

export type MachinaReactNativeViewProps = {
  layout: ResolvedLayoutDocument;
  views?: Record<string, React.ComponentType<MachinaNativeSlotProps>>;
  viewData?: Record<string, unknown>;
  nodeData?: Record<NodeId, unknown>;
  layers?: Record<string, MachinaReactNativeLayer>;
  defaultLayer?: string;
  debug?: boolean;
  style?: StyleProp<ViewStyle>;
  nodeStyle?: StyleProp<ViewStyle>;
};

function normalizeLayerZ(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return value;
}

function getLayerZ(
  node: ResolvedLayoutTree,
  layers: Record<string, MachinaReactNativeLayer>,
  defaultLayer: string,
): number {
  return normalizeLayerZ(layers[node.layer ?? defaultLayer]?.z);
}

function renderNode(
  node: ResolvedLayoutTree,
  parentRect: Rect,
  props: Required<Pick<MachinaReactNativeViewProps, "views" | "layers" | "defaultLayer">> &
    Pick<MachinaReactNativeViewProps, "viewData" | "nodeData" | "debug" | "nodeStyle"> & {
      nodes: ResolvedLayoutDocument["nodes"];
    },
): React.ReactElement {
  const left = node.rect.x - parentRect.x;
  const top = node.rect.y - parentRect.y;
  const viewKey = node.view ?? node.slot;
  const ViewComponent = viewKey ? props.views[viewKey] : undefined;
  const layerZ = getLayerZ(node, props.layers, props.defaultLayer);
  const nodeZ = node.z ?? 0;

  return (
    <View
      key={node.id}
      testID={`machina-node-${node.id}`}
      style={[
        {
          position: "absolute",
          left,
          top,
          width: node.rect.width,
          height: node.rect.height,
          zIndex: layerZ * 100 + nodeZ,
        },
        props.debug ? { borderWidth: 1, borderColor: "rgba(59, 130, 246, 0.9)" } : null,
        props.nodeStyle,
      ]}
    >
      {props.debug ? <Text>{node.debugLabel ?? node.id}</Text> : null}
      {ViewComponent && props.nodes[node.id] && viewKey
        ? React.createElement(ViewComponent, {
            id: node.id,
            rect: { ...node.rect },
            debugLabel: node.debugLabel,
            node: { ...props.nodes[node.id], rect: { ...props.nodes[node.id].rect } },
            viewKey,
            viewData: props.viewData?.[viewKey],
            nodeData: props.nodeData?.[node.id],
          })
        : null}
      {[...node.children]
        .map((child, index) => ({ child, index }))
        .sort(
          (a, b) =>
            getLayerZ(a.child, props.layers, props.defaultLayer) -
              getLayerZ(b.child, props.layers, props.defaultLayer) ||
            (a.child.z ?? 0) - (b.child.z ?? 0) ||
            a.index - b.index,
        )
        .map(({ child }) => renderNode(child, node.rect, props))}
    </View>
  );
}

export function MachinaReactNativeView(props: MachinaReactNativeViewProps): React.ReactElement {
  const tree = toResolvedTree(props.layout);
  return (
    <View
      testID="machina-root-wrapper"
      style={[
        { position: "relative", width: tree.rect.width, height: tree.rect.height },
        props.style,
      ]}
    >
      {renderNode(tree, tree.rect, {
        views: props.views ?? {},
        viewData: props.viewData,
        nodeData: props.nodeData,
        nodes: props.layout.nodes,
        layers: props.layers ?? { base: { z: 0 } },
        defaultLayer: props.defaultLayer ?? "base",
        debug: props.debug,
        nodeStyle: props.nodeStyle,
      })}
    </View>
  );
}
