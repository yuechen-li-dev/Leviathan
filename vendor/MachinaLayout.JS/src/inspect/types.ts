import type { Rect } from "../types";

export type MachinaDomSummaryNode = {
  nodeId?: string;
  view?: string;
  slot?: string;
  debugLabel?: string;
  layer?: string;
  tagName: string;
  role?: string;
  ariaLabel?: string;
  textExcerpt?: string;
  rect: Rect;
  children: MachinaDomSummaryNode[];
};

export type MachinaDomSummary = {
  schemaVersion: 1;
  rootSelector?: string;
  generatedAt?: string;
  nodes: MachinaDomSummaryNode[];
};

export type SummarizeMachinaDomOptions = {
  root?: ParentNode | Element | Document;
  selector?: string;
  includeTextExcerpt?: boolean;
  includeA11y?: boolean;
  maxTextLength?: number;
  includeEmptyNodes?: boolean;
  generatedAt?: string;
};
