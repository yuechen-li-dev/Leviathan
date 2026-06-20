import { expect, type Page, type TestInfo } from "@playwright/test";
import { writeMachinaHandoffBundle } from "machinalayout/handoff";
import type { MachinaScreenViewportTask } from "machinalayout";
import { access, copyFile, mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  toLeviathanDomSummaryCompat,
  toLeviathanHandoffCompat,
  type LeviathanDomSummaryCompat,
  type LeviathanHandoffCompat,
  type LeviathanPageDomCapture,
} from "../../src/machina/uiSnapshotCompat";

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
  handoff: LeviathanHandoffCompat;
  domSummary: {
    schemaVersion: LeviathanDomSummaryCompat["schemaVersion"];
    rootSelector?: LeviathanDomSummaryCompat["rootSelector"];
    route: LeviathanDomSummaryCompat["route"];
    generatedAt: LeviathanDomSummaryCompat["generatedAt"];
    rootIds: LeviathanDomSummaryCompat["rootIds"];
    visibleTextExcerpt: LeviathanDomSummaryCompat["visibleTextExcerpt"];
    nodes: LeviathanDomSummaryCompat["nodes"];
    machina: LeviathanDomSummaryCompat["machina"];
  };
  machinaSnapshot: unknown;
};

function safeSegment(value: string): string {
  return value.replace(/[^a-z0-9.-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "snapshot";
}

export async function captureLeviathanUiHandoffBundle(
  page: Page,
  testInfo: TestInfo,
  options: { name: string; route: string; artifactRoot?: string; task?: MachinaScreenViewportTask; tags?: readonly string[]; metadata?: Record<string, unknown> },
): Promise<HandoffSnapshotResult> {
  await expect(page.locator("[data-machina-root-id]")).toBeVisible();

  const projectRoot = path.resolve(testInfo.config.rootDir, "..");
  const outputDir = path.join(projectRoot, "test-results", options.artifactRoot ?? "ui-snapshots", safeSegment(options.name));
  await mkdir(outputDir, { recursive: true });

  const generatedAt = new Date().toISOString();
  const pageDomCapture = await page.evaluate(() => {
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
      rootIds,
      visibleTextExcerpt: textExcerpt(document.body.innerText || document.body.textContent),
      nodes,
    };
  });
  const domSummary = toLeviathanDomSummaryCompat(await page.content(), pageDomCapture as LeviathanPageDomCapture, generatedAt);

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

  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  const fixture = fixtureFromRoute(options.route);
  const tempDir = await mkdtemp(path.join(outputDir, ".machina-handoff-"));
  const sourceScreenshotPath = path.join(tempDir, "source-screenshot.png");
  let handoff: LeviathanHandoffCompat | undefined;

  try {
    await page.screenshot({ path: sourceScreenshotPath, fullPage: true });

    const handoffWriteResult = await writeMachinaHandoffBundle({
      outputDir: tempDir,
      artifactBaseName: options.task?.artifactBaseName ?? options.name,
      screenshotPath: sourceScreenshotPath,
      domSummary: domSummary.machina,
      layoutSnapshot: machinaSnapshot,
      task: options.task,
      route: options.route,
      fixture,
      tags: options.tags,
      metadata: options.metadata,
      createdAt: generatedAt,
    });

    await copyFile(handoffWriteResult.paths.screenshot ?? sourceScreenshotPath, screenshotPath);
    await writeFile(domSummaryPath, `${JSON.stringify(domSummary, null, 2)}\n`, "utf8");
    await writeFile(machinaSnapshotPath, `${JSON.stringify(machinaSnapshot, null, 2)}\n`, "utf8");

    handoff = toLeviathanHandoffCompat({
      name: options.name,
      route: options.route,
      capturedRoute: domSummary.route,
      fixture,
      viewport,
      generatedAt,
      visibleTextExcerpt: domSummary.visibleTextExcerpt,
      machinaNodeCount: domSummary.nodes.length,
      screenshotPath: relativeArtifactPath(projectRoot, screenshotPath),
      domSummaryPath: relativeArtifactPath(projectRoot, domSummaryPath),
      machinaSnapshotPath: relativeArtifactPath(projectRoot, machinaSnapshotPath),
      upstream: handoffWriteResult.manifest,
      metadata: options.metadata,
    });

    await writeFile(handoffPath, `${JSON.stringify(handoff, null, 2)}\n`, "utf8");
  } finally {
    await unlink(sourceScreenshotPath).catch(() => undefined);
    await rm(tempDir, { recursive: true, force: true });
  }

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
    handoff: handoff as LeviathanHandoffCompat,
    domSummary,
    machinaSnapshot,
  };
}

function relativeArtifactPath(projectRoot: string, pathLike: string) {
  return path.relative(projectRoot, pathLike).replace(/\\/g, "/");
}

function fixtureFromRoute(route: string) {
  try {
    const parsed = new URL(route, "http://leviathan.local");
    const fixture = parsed.searchParams.get("fixture");
    return fixture && fixture.trim() !== "" ? fixture : undefined;
  } catch {
    return undefined;
  }
}

async function fileExists(pathLike: string) {
  try {
    await access(pathLike);
    return true;
  } catch {
    return false;
  }
}
