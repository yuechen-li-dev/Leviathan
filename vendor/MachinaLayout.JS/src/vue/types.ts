export type NodeId = string;

export type LayerName = string;

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AbsoluteFrame = {
  kind: "absolute";
  x: number;
  y: number;
  width: number;
  height: number;
};

export type UiLength = number | { unit: "px"; value: number } | { unit: "ui"; value: number };

export type OffsetSpec = {
  x?: UiLength;
  y?: UiLength;
};

export type RectEdge = "left" | "right" | "top" | "bottom" | "centerX" | "centerY";

export type EdgeRef = {
  ref: NodeId;
  edge: RectEdge;
  offset?: UiLength;
};

export type GuideLength = UiLength | EdgeRef;

export type AnchorFrame = {
  kind: "anchor";
  left?: UiLength;
  right?: UiLength;
  top?: UiLength;
  bottom?: UiLength;
  width?: UiLength;
  height?: UiLength;
};

export type GuideFrame = {
  kind: "guide";
  left?: GuideLength;
  right?: GuideLength;
  top?: GuideLength;
  bottom?: GuideLength;
  width?: UiLength;
  height?: UiLength;
};

export type RootFrame = {
  kind: "root";
};

export type FixedFrame = {
  kind: "fixed";
  width: number;
  height: number;
};

export type FillFrame = {
  kind: "fill";
  weight?: number;
  cross?: number | "fill";
};

export type CellFrame = {
  kind: "cell";
  col: number;
  row: number;
  colSpan?: number;
  rowSpan?: number;
};

export type FrameSpec =
  | RootFrame
  | AbsoluteFrame
  | AnchorFrame
  | FixedFrame
  | FillFrame
  | CellFrame
  | GuideFrame;

export type StackAxis = "horizontal" | "vertical";
export type StackJustify = "start" | "center" | "end" | "space-between";
export type StackAlign = "start" | "center" | "end";
export type EdgeInsets = { top: number; right: number; bottom: number; left: number };
export type StackArrange = {
  kind: "stack";
  axis: StackAxis;
  gap?: number;
  padding?: number | EdgeInsets;
  justify?: StackJustify;
  align?: StackAlign;
};
export type GridTrack = { kind: "fixed"; size: number } | { kind: "fill"; weight?: number };
export type GridArrange = {
  kind: "grid";
  columns: GridTrack[];
  rows: GridTrack[];
  columnGap?: number;
  rowGap?: number;
  padding?: number | EdgeInsets;
};
export type ArrangeSpec = StackArrange | GridArrange;
export type LayoutVariantCondition = {
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
};
export type LayoutRowVariant = {
  when: LayoutVariantCondition;
  frame?: FrameSpec;
  arrange?: ArrangeSpec;
  offset?: OffsetSpec;
  z?: number;
  view?: string;
  slot?: string;
  debugLabel?: string;
  layer?: LayerName;
};
export type LayoutRow = {
  id: NodeId;
  parent?: NodeId;
  order?: number;
  z?: number;
  frame: FrameSpec;
  arrange?: ArrangeSpec;
  view?: string;
  slot?: string;
  debugLabel?: string;
  layer?: LayerName;
  offset?: OffsetSpec;
  variants?: LayoutRowVariant[];
};
export type LayoutNode = {
  id: NodeId;
  z?: number;
  frame: FrameSpec;
  arrange?: ArrangeSpec;
  view?: string;
  slot?: string;
  debugLabel?: string;
  layer?: LayerName;
  offset?: OffsetSpec;
};
export type LayoutDocument = {
  rootId: NodeId;
  nodes: Record<NodeId, LayoutNode>;
  children: Record<NodeId, NodeId[]>;
};
export type ResolvedLayoutNode = {
  id: NodeId;
  z?: number;
  rect: Rect;
  frame: FrameSpec;
  arrange?: ArrangeSpec;
  view?: string;
  slot?: string;
  debugLabel?: string;
  layer?: LayerName;
  offset?: OffsetSpec;
};
export type ResolvedLayoutDocument = {
  rootId: NodeId;
  nodes: Record<NodeId, ResolvedLayoutNode>;
  children: Record<NodeId, NodeId[]>;
};

export type ResolvedLayoutTree = {
  id: NodeId;
  z?: number;
  rect: Rect;
  frame: FrameSpec;
  arrange?: ArrangeSpec;
  view?: string;
  slot?: string;
  debugLabel?: string;
  layer?: LayerName;
  offset?: OffsetSpec;
  children: ResolvedLayoutTree[];
};
