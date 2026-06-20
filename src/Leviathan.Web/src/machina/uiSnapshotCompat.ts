import { summarizeMachinaDom, type MachinaDomSummary } from "machinalayout/inspect";
import type { MachinaHandoffBundleManifest } from "machinalayout/handoff";
import { JSDOM } from "jsdom";

export type MachinaDomNodeSummary = {
  rootId: string | null;
  nodeId: string | null;
  slot: string | null;
  view: string | null;
  debugLabel: string | null;
  layer: string | null;
  tagName: string;
  className: string;
  role: string | null;
  ariaLabel: string | null;
  textExcerpt: string;
  boundingBox: { x: number; y: number; width: number; height: number };
};

export type LeviathanDomSummaryCompat = {
  schemaVersion: 1;
  rootSelector?: string;
  route: string;
  generatedAt: string;
  rootIds: string[];
  visibleTextExcerpt: string;
  nodes: MachinaDomNodeSummary[];
  machina: MachinaDomSummary;
};

export type LeviathanPageDomCapture = {
  route: string;
  rootIds: string[];
  visibleTextExcerpt: string;
  nodes: MachinaDomNodeSummary[];
};

export type LeviathanHandoffCompat = {
  schemaVersion: 1;
  createdAt: string;
  generatedAt: string;
  testName: string;
  route: string;
  capturedRoute: string;
  fixture?: string;
  screenKey?: string;
  viewportKey?: string;
  viewport: { width: number; height: number };
  tags?: readonly string[];
  artifactBaseName?: string;
  artifacts: {
    screenshot: string;
    domSummary: string;
    layoutSnapshot: string;
    manifest: string;
  };
  screenshotPath: string;
  domSummaryPath: string;
  machinaSnapshotPath: string;
  visibleTextExcerpt: string;
  machinaNodeCount: number;
  metadata?: Record<string, unknown>;
  machina: MachinaHandoffBundleManifest;
};

export function toLeviathanDomSummaryCompat(
  html: string,
  pageDomCapture: LeviathanPageDomCapture,
  generatedAt: string,
): LeviathanDomSummaryCompat {
  const jsdom = new JSDOM(html);
  const machina = summarizeMachinaDom({
    root: jsdom.window.document,
    includeA11y: true,
    includeTextExcerpt: true,
    generatedAt,
  });

  const compatNodesById = new Map(pageDomCapture.nodes.map((node) => [node.nodeId, node] as const));
  patchMachinaSummaryRects(machina.nodes, compatNodesById);

  return {
    schemaVersion: machina.schemaVersion,
    rootSelector: machina.rootSelector,
    route: pageDomCapture.route,
    generatedAt,
    rootIds: pageDomCapture.rootIds,
    visibleTextExcerpt: pageDomCapture.visibleTextExcerpt,
    nodes: pageDomCapture.nodes,
    machina,
  };
}

export function toLeviathanHandoffCompat(input: {
  name: string;
  route: string;
  capturedRoute: string;
  fixture?: string;
  viewport: { width: number; height: number };
  generatedAt: string;
  visibleTextExcerpt: string;
  machinaNodeCount: number;
  screenshotPath: string;
  domSummaryPath: string;
  machinaSnapshotPath: string;
  upstream: MachinaHandoffBundleManifest;
  metadata?: Record<string, unknown>;
}): LeviathanHandoffCompat {
  return {
    schemaVersion: input.upstream.schemaVersion,
    createdAt: input.upstream.createdAt,
    generatedAt: input.generatedAt,
    testName: input.name,
    route: input.route,
    capturedRoute: input.capturedRoute,
    fixture: input.upstream.fixture ?? input.fixture,
    screenKey: input.upstream.screenKey,
    viewportKey: input.upstream.viewportKey,
    viewport: input.viewport,
    tags: input.upstream.tags,
    artifactBaseName: input.upstream.artifactBaseName,
    artifacts: {
      screenshot: "screenshot.png",
      domSummary: "dom-summary.json",
      layoutSnapshot: "machina-snapshot.json",
      manifest: "handoff.json",
    },
    screenshotPath: input.screenshotPath,
    domSummaryPath: input.domSummaryPath,
    machinaSnapshotPath: input.machinaSnapshotPath,
    visibleTextExcerpt: input.visibleTextExcerpt,
    machinaNodeCount: input.machinaNodeCount,
    metadata: input.upstream.metadata ?? input.metadata,
    machina: {
      ...input.upstream,
      artifacts: {
        screenshot: "screenshot.png",
        domSummary: "dom-summary.json",
        layoutSnapshot: "machina-snapshot.json",
        manifest: "handoff.json",
      },
    },
  };
}

function patchMachinaSummaryRects(
  nodes: MachinaDomSummary["nodes"],
  compatNodesById: Map<string | null, MachinaDomNodeSummary>,
) {
  for (const node of nodes) {
    const compatNode = compatNodesById.get(node.nodeId ?? null);
    if (compatNode) {
      node.rect = {
        x: compatNode.boundingBox.x,
        y: compatNode.boundingBox.y,
        width: compatNode.boundingBox.width,
        height: compatNode.boundingBox.height,
      };
    }

    patchMachinaSummaryRects(node.children, compatNodesById);
  }
}
