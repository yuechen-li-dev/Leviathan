import type { Rect } from "../types";
import type { MachinaDomSummary, MachinaDomSummaryNode, SummarizeMachinaDomOptions } from "./types";

const DEFAULT_SELECTOR = "[data-machina-node-id]";
const DEFAULT_MAX_TEXT_LENGTH = 120;

type DomRoot = ParentNode | Element | Document;

function getGlobalDocument(): Document | undefined {
  return typeof document === "undefined" ? undefined : document;
}

function isOptions(value: unknown): value is SummarizeMachinaDomOptions {
  if (value === undefined || value === null || typeof value !== "object") return false;
  return (
    "root" in value ||
    "selector" in value ||
    "includeTextExcerpt" in value ||
    "includeA11y" in value ||
    "generatedAt" in value ||
    "maxTextLength" in value ||
    "includeEmptyNodes" in value
  );
}

function readOptionalAttribute(element: Element, name: string): string | undefined {
  const value = element.getAttribute(name);
  return value === null || value === "" ? undefined : value;
}

function rectFromElement(element: Element): Rect {
  const rect = element.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function textExcerpt(element: Element, maxLength: number): string | undefined {
  const normalized = (element.textContent ?? "").replace(/\s+/g, " ").trim();
  if (normalized === "") return undefined;
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

function canMatchRoot(root: DomRoot): root is Element {
  return typeof (root as Element).matches === "function";
}

function queryMatchingElements(root: DomRoot, selector: string): Element[] {
  const matches = Array.from(root.querySelectorAll(selector));
  if (canMatchRoot(root) && root.matches(selector)) return [root, ...matches];
  return matches;
}

function nearestMatchingAncestor(
  element: Element,
  selected: Set<Element>,
  root: DomRoot,
): Element | undefined {
  let parent = element.parentElement;
  while (parent) {
    if (selected.has(parent)) return parent;
    if (parent === root) return undefined;
    parent = parent.parentElement;
  }
  return undefined;
}

function makeSummaryNode(
  element: Element,
  options: Required<
    Pick<SummarizeMachinaDomOptions, "includeTextExcerpt" | "includeA11y" | "maxTextLength">
  >,
): MachinaDomSummaryNode {
  const node: MachinaDomSummaryNode = {
    tagName: element.tagName.toLowerCase(),
    rect: rectFromElement(element),
    children: [],
  };

  const nodeId = readOptionalAttribute(element, "data-machina-node-id");
  const view = readOptionalAttribute(element, "data-machina-view");
  const slot = readOptionalAttribute(element, "data-machina-slot");
  const debugLabel = readOptionalAttribute(element, "data-machina-debug-label");
  const layer = readOptionalAttribute(element, "data-machina-layer");
  if (nodeId !== undefined) node.nodeId = nodeId;
  if (view !== undefined) node.view = view;
  if (slot !== undefined) node.slot = slot;
  if (debugLabel !== undefined) node.debugLabel = debugLabel;
  if (layer !== undefined) node.layer = layer;

  if (options.includeA11y) {
    const role = readOptionalAttribute(element, "role");
    const ariaLabel = readOptionalAttribute(element, "aria-label");
    if (role !== undefined) node.role = role;
    if (ariaLabel !== undefined) node.ariaLabel = ariaLabel;
  }

  if (options.includeTextExcerpt) {
    const excerpt = textExcerpt(element, options.maxTextLength);
    if (excerpt !== undefined) node.textExcerpt = excerpt;
  }

  return node;
}

export function summarizeMachinaDom(
  rootOrOptions?: DomRoot | SummarizeMachinaDomOptions,
): MachinaDomSummary {
  const options = isOptions(rootOrOptions) ? rootOrOptions : { root: rootOrOptions };
  const selector = options.selector ?? DEFAULT_SELECTOR;
  const root = options.root ?? getGlobalDocument();
  const summary: MachinaDomSummary = { schemaVersion: 1, rootSelector: selector, nodes: [] };
  if (options.generatedAt !== undefined) summary.generatedAt = options.generatedAt;
  if (root === undefined || typeof root.querySelectorAll !== "function") return summary;

  const elements = queryMatchingElements(root, selector);
  const selected = new Set(elements);
  const nodeByElement = new Map<Element, MachinaDomSummaryNode>();
  const nodeOptions = {
    includeTextExcerpt: options.includeTextExcerpt ?? false,
    includeA11y: options.includeA11y ?? false,
    maxTextLength: options.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH,
  };

  for (const element of elements) nodeByElement.set(element, makeSummaryNode(element, nodeOptions));

  for (const element of elements) {
    const node = nodeByElement.get(element);
    if (!node) continue;
    const parent = nearestMatchingAncestor(element, selected, root);
    const parentNode = parent === undefined ? undefined : nodeByElement.get(parent);
    if (parentNode) parentNode.children.push(node);
    else summary.nodes.push(node);
  }

  return summary;
}
