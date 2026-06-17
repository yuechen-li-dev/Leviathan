import { expect, type Page, type TestInfo } from "@playwright/test";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type MachinaDomNodeSummary = {
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

type HandoffSnapshotResult = {
  route: string;
  viewport: { width: number; height: number };
  screenshotPath: string;
  domSummaryPath: string;
  machinaSnapshotPath: string;
  handoffPath: string;
  artifactExists: {
    screenshot: boolean;
    domSummary: boolean;
    machinaSnapshot: boolean;
    handoff: boolean;
  };
  domSummary: {
    route: string;
    generatedAt: string;
    rootIds: string[];
    visibleTextExcerpt: string;
    nodes: MachinaDomNodeSummary[];
  };
  machinaSnapshot: unknown;
};

function safeSegment(value: string): string {
  return value.replace(/[^a-z0-9.-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "snapshot";
}

export async function captureLeviathanUiHandoffBundle(
  page: Page,
  testInfo: TestInfo,
  options: { name: string; route: string },
): Promise<HandoffSnapshotResult> {
  await expect(page.locator("[data-machina-root-id]")).toBeVisible();

  const projectRoot = path.resolve(testInfo.config.rootDir, "..");
  const outputDir = path.join(projectRoot, "test-results", "ui-snapshots", safeSegment(options.name));
  await mkdir(outputDir, { recursive: true });

  const domSummary = await page.evaluate(() => {
    const textExcerpt = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
    const rootIds = Array.from(document.querySelectorAll<HTMLElement>("[data-machina-root-id]"))
      .map((element) => element.dataset.machinaRootId ?? null)
      .filter((value): value is string => value !== null);
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-machina-node-id]")).map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        rootId: element.closest<HTMLElement>("[data-machina-root-id]")?.dataset.machinaRootId ?? null,
        nodeId: element.dataset.machinaNodeId ?? null,
        slot: element.dataset.machinaSlot ?? null,
        view: element.dataset.machinaView ?? null,
        debugLabel: element.dataset.machinaDebugLabel ?? null,
        layer: element.dataset.machinaLayer ?? null,
        tagName: element.tagName.toLowerCase(),
        className: element.className,
        role: element.getAttribute("role"),
        ariaLabel: element.getAttribute("aria-label"),
        textExcerpt: textExcerpt(element.innerText || element.textContent),
        boundingBox: {
          x: Number(rect.x.toFixed(2)),
          y: Number(rect.y.toFixed(2)),
          width: Number(rect.width.toFixed(2)),
          height: Number(rect.height.toFixed(2)),
        },
      };
    });

    return {
      route: window.location.pathname + window.location.search,
      generatedAt: new Date().toISOString(),
      rootIds,
      visibleTextExcerpt: textExcerpt(document.body.innerText || document.body.textContent),
      nodes,
    };
  });

  const machinaSnapshot = await page.evaluate(() => {
    const getSnapshot = window.__LEVIATHAN_GET_DEBUG_SNAPSHOT__;
    if (typeof getSnapshot === "function") return getSnapshot();
    if (window.__LEVIATHAN_DEBUG_SNAPSHOT__ !== undefined) return window.__LEVIATHAN_DEBUG_SNAPSHOT__;
    return {
      available: false,
      reason: "window.__LEVIATHAN_DEBUG_SNAPSHOT__ not exposed; load route with ?debug=1.",
    };
  });

  const screenshotPath = path.join(outputDir, "screenshot.png");
  const domSummaryPath = path.join(outputDir, "dom-summary.json");
  const machinaSnapshotPath = path.join(outputDir, "machina-snapshot.json");
  const handoffPath = path.join(outputDir, "handoff.json");

  await page.screenshot({ path: screenshotPath, fullPage: true });
  await writeFile(domSummaryPath, JSON.stringify(domSummary, null, 2));
  await writeFile(machinaSnapshotPath, JSON.stringify(machinaSnapshot, null, 2));

  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  const handoff = {
    testName: options.name,
    route: options.route,
    capturedRoute: domSummary.route,
    generatedAt: new Date().toISOString(),
    viewport,
    screenshotPath: path.relative(projectRoot, screenshotPath).replace(/\\/g, "/"),
    domSummaryPath: path.relative(projectRoot, domSummaryPath).replace(/\\/g, "/"),
    machinaSnapshotPath: path.relative(projectRoot, machinaSnapshotPath).replace(/\\/g, "/"),
    visibleTextExcerpt: domSummary.visibleTextExcerpt,
    machinaNodeCount: domSummary.nodes.length,
  };

  await writeFile(handoffPath, JSON.stringify(handoff, null, 2));

  const artifactExists = {
    screenshot: await fileExists(screenshotPath),
    domSummary: await fileExists(domSummaryPath),
    machinaSnapshot: await fileExists(machinaSnapshotPath),
    handoff: await fileExists(handoffPath),
  };

  return {
    route: options.route,
    viewport,
    screenshotPath,
    domSummaryPath,
    machinaSnapshotPath,
    handoffPath,
    artifactExists,
    domSummary,
    machinaSnapshot,
  };
}

async function fileExists(pathLike: string) {
  try {
    await access(pathLike);
    return true;
  } catch {
    return false;
  }
}
