import { computed, defineComponent, h, type Component, type PropType, type StyleValue } from "vue";
import { toResolvedTree } from "../toResolvedTree";
import type {
  NodeId,
  Rect,
  ResolvedLayoutDocument,
  ResolvedLayoutNode,
  ResolvedLayoutTree,
} from "../types";

export type MachinaVueSlotProps<TViewData = unknown, TNodeData = unknown> = {
  id: NodeId;
  rect: Rect;
  debugLabel?: string;
  node: ResolvedLayoutNode;
  viewKey?: string;
  viewData?: TViewData;
  nodeData?: TNodeData;
};
export type MachinaVueLayer = { z: number };
export type MachinaVueViewProps = {
  layout: ResolvedLayoutDocument;
  views?: Record<string, Component>;
  viewData?: Record<string, unknown>;
  nodeData?: Record<NodeId, unknown>;
  layers?: Record<string, MachinaVueLayer>;
  defaultLayer?: string;
  debug?: boolean;
  rootClass?: unknown;
  rootStyle?: StyleValue;
  nodeClass?: unknown;
  nodeStyle?: StyleValue;
  nodeContainment?: "none" | "layout-paint" | "strict";
  nodeContentVisibility?: "none" | "auto";
  nodeContainIntrinsicSize?: string;
};
const normalizeLayerZ = (v: number | undefined) =>
  v === undefined || !Number.isFinite(v) || !Number.isInteger(v) || v < -5 || v > 5 ? 0 : v;
const getEffectiveLayer = (n: ResolvedLayoutTree, d: string) => n.layer ?? d;
const getEffectiveLayerZ = (n: ResolvedLayoutTree, l: Record<string, MachinaVueLayer>, d: string) =>
  normalizeLayerZ(l[getEffectiveLayer(n, d)]?.z);

export const MachinaVueView = defineComponent({
  name: "MachinaVueView",
  props: {
    layout: { type: Object as PropType<ResolvedLayoutDocument>, required: true },
    views: { type: Object as PropType<Record<string, Component>>, default: () => ({}) },
    viewData: { type: Object as PropType<Record<string, unknown>>, default: () => ({}) },
    nodeData: { type: Object as PropType<Record<NodeId, unknown>>, default: () => ({}) },
    layers: {
      type: Object as PropType<Record<string, MachinaVueLayer>>,
      default: () => ({ base: { z: 0 } }),
    },
    defaultLayer: { type: String, default: "base" },
    debug: { type: Boolean, default: false },
    rootClass: { type: null as unknown as PropType<unknown>, default: undefined },
    rootStyle: { type: null as unknown as PropType<StyleValue>, default: undefined },
    nodeClass: { type: null as unknown as PropType<unknown>, default: undefined },
    nodeStyle: { type: null as unknown as PropType<StyleValue>, default: undefined },
    nodeContainment: {
      type: String as PropType<"none" | "layout-paint" | "strict">,
      default: "layout-paint",
    },
    nodeContentVisibility: { type: String as PropType<"none" | "auto">, default: "none" },
    nodeContainIntrinsicSize: { type: String, default: undefined },
  },
  setup(props) {
    const tree = computed(() => toResolvedTree(props.layout));
    const renderNode = (node: ResolvedLayoutTree, parentRect: Rect): ReturnType<typeof h> => {
      const viewKey = node.view ?? node.slot;
      const View = viewKey ? props.views[viewKey] : undefined;
      const left = node.rect.x - parentRect.x;
      const top = node.rect.y - parentRect.y;
      const layer = getEffectiveLayer(node, props.defaultLayer);
      const layerZ = getEffectiveLayerZ(node, props.layers, props.defaultLayer);
      const baseStyle = {
        position: "absolute",
        left: `${left}px`,
        top: `${top}px`,
        width: `${node.rect.width}px`,
        height: `${node.rect.height}px`,
        boxSizing: "border-box",
        zIndex: `${layerZ * 100 + (node.z ?? 0)}`,
        ...(props.nodeContainment === "layout-paint" ? { contain: "layout paint" } : null),
        ...(props.nodeContainment === "strict" ? { contain: "strict" } : null),
        ...(props.nodeContentVisibility === "auto" ? { contentVisibility: "auto" } : null),
        ...(props.nodeContainIntrinsicSize !== undefined
          ? { containIntrinsicSize: props.nodeContainIntrinsicSize }
          : null),
        ...(props.debug ? { outline: "1px dashed rgba(59, 130, 246, 0.9)" } : null),
      };
      const rendered =
        View && props.layout.nodes[node.id]
          ? h(View, {
              id: node.id,
              rect: { ...node.rect },
              debugLabel: node.debugLabel,
              node: {
                ...props.layout.nodes[node.id],
                rect: { ...props.layout.nodes[node.id].rect },
              },
              viewKey,
              viewData: viewKey ? props.viewData[viewKey] : undefined,
              nodeData: props.nodeData[node.id],
            } satisfies MachinaVueSlotProps)
          : null;
      const kids = [...node.children]
        .map((child, index) => ({ child, index }))
        .sort(
          (a, b) =>
            getEffectiveLayerZ(a.child, props.layers, props.defaultLayer) -
              getEffectiveLayerZ(b.child, props.layers, props.defaultLayer) ||
            (a.child.z ?? 0) - (b.child.z ?? 0) ||
            a.index - b.index,
        )
        .map(({ child }) => renderNode(child, node.rect));
      return h(
        "div",
        {
          key: node.id,
          class: props.nodeClass,
          style: [baseStyle, props.nodeStyle],
          "data-machina-node-id": node.id,
          "data-machina-slot": node.slot,
          "data-machina-view": viewKey,
          "data-machina-debug-label": node.debugLabel,
          "data-machina-layer": layer,
        },
        [props.debug ? h("small", {}, node.debugLabel ?? node.id) : null, rendered, ...kids],
      );
    };
    return () => {
      const root = tree.value;
      return h(
        "div",
        {
          class: props.rootClass,
          style: [
            {
              position: "relative",
              width: `${root.rect.width}px`,
              height: `${root.rect.height}px`,
              boxSizing: "border-box",
            },
            props.rootStyle,
          ],
          "data-machina-root-id": root.id,
        },
        [renderNode(root, root.rect)],
      );
    };
  },
});
