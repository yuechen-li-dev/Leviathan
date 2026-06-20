import { describe, expect, it } from "vitest";
import { toLeviathanDomSummaryCompat, toLeviathanHandoffCompat } from "./uiSnapshotCompat";

describe("UI snapshot compatibility helpers", () => {
  it("wraps summarizeMachinaDom output with legacy flat Leviathan fields", () => {
    const html = `
      <div data-machina-root-id="root">
        <section
          data-machina-node-id="root"
          data-machina-debug-label="Scheduling shell 1440x1024"
          data-machina-layer="base"
          class="shell"
        >
          <article
            data-machina-node-id="scheduling-main"
            data-machina-view="schedulingMain"
            data-machina-slot="main"
            data-machina-debug-label="setup main surface"
            data-machina-layer="base"
            role="main"
            aria-label="Scheduling main"
            class="panel"
          >
            Provider setup
          </article>
        </section>
      </div>
    `;

    const summary = toLeviathanDomSummaryCompat(
      html,
      {
        route: "/apps/scheduling/setup?debug=1&fixture=provider-setup",
        rootIds: ["root"],
        visibleTextExcerpt: "Provider setup Set up bookable availability",
        nodes: [
          {
            rootId: "root",
            nodeId: "root",
            slot: null,
            view: null,
            debugLabel: "Scheduling shell 1440x1024",
            layer: "base",
            tagName: "section",
            className: "shell",
            role: null,
            ariaLabel: null,
            textExcerpt: "Provider setup Set up bookable availability",
            boundingBox: { x: 0, y: 0, width: 1440, height: 1024 },
          },
          {
            rootId: "root",
            nodeId: "scheduling-main",
            slot: "main",
            view: "schedulingMain",
            debugLabel: "setup main surface",
            layer: "base",
            tagName: "article",
            className: "panel",
            role: "main",
            ariaLabel: "Scheduling main",
            textExcerpt: "Provider setup",
            boundingBox: { x: 16, y: 184, width: 974, height: 504 },
          },
        ],
      },
      "2026-06-19T00:00:00.000Z",
    );

    expect(summary).toMatchObject({
      schemaVersion: 1,
      rootSelector: "[data-machina-node-id]",
      route: "/apps/scheduling/setup?debug=1&fixture=provider-setup",
      generatedAt: "2026-06-19T00:00:00.000Z",
      rootIds: ["root"],
      visibleTextExcerpt: "Provider setup Set up bookable availability",
    });

    expect(summary.nodes).toEqual([
      expect.objectContaining({
        nodeId: "root",
        className: "shell",
        boundingBox: { x: 0, y: 0, width: 1440, height: 1024 },
      }),
      expect.objectContaining({
        nodeId: "scheduling-main",
        view: "schedulingMain",
        className: "panel",
        boundingBox: { x: 16, y: 184, width: 974, height: 504 },
      }),
    ]);

    expect(summary.machina.nodes).toEqual([
      expect.objectContaining({
        nodeId: "root",
        debugLabel: "Scheduling shell 1440x1024",
        rect: { x: 0, y: 0, width: 1440, height: 1024 },
        children: [
          expect.objectContaining({
            nodeId: "scheduling-main",
            view: "schedulingMain",
            slot: "main",
            role: "main",
            ariaLabel: "Scheduling main",
            rect: { x: 16, y: 184, width: 974, height: 504 },
          }),
        ],
      }),
    ]);
  });

  it("maps upstream handoff manifest fields back to stable Leviathan artifact names", () => {
    const handoff = toLeviathanHandoffCompat({
      name: "public-booking-phone",
      route: "/book/demo-provider?debug=1&fixture=public-booking",
      capturedRoute: "/book/demo-provider?debug=1&fixture=public-booking",
      fixture: "public-booking",
      viewport: { width: 390, height: 844 },
      generatedAt: "2026-06-19T00:00:00.000Z",
      visibleTextExcerpt: "Choose a date and time 30 min Intro Call",
      machinaNodeCount: 6,
      screenshotPath: "test-results/ui-snapshots/public-booking-phone/screenshot.png",
      domSummaryPath: "test-results/ui-snapshots/public-booking-phone/dom-summary.json",
      machinaSnapshotPath: "test-results/ui-snapshots/public-booking-phone/machina-snapshot.json",
      upstream: {
        schemaVersion: 1,
        createdAt: "2026-06-19T00:00:00.000Z",
        route: "/book/demo-provider?debug=1&fixture=public-booking",
        fixture: "public-booking",
        screenKey: "public-booking",
        viewportKey: "phone",
        viewport: { key: "phone", width: 390, height: 844 },
        tags: ["scheduling", "fixture"],
        artifactBaseName: "public-booking__phone",
        artifacts: {
          screenshot: "public-booking__phone__screenshot.png",
          domSummary: "public-booking__phone__dom-summary.json",
          layoutSnapshot: "public-booking__phone__machina-snapshot.json",
          manifest: "public-booking__phone__handoff.json",
        },
        metadata: {
          screenTitle: "Public booking",
          productArea: "scheduling",
          captureSource: "fixture-or-live",
          supportsLiveRoute: true,
          legacyArtifactBaseName: "public-booking",
          debugOverlayMode: "nonInteractiveOverlay",
          taskKey: "public-booking__phone",
        },
      },
    });

    expect(handoff).toMatchObject({
      schemaVersion: 1,
      createdAt: "2026-06-19T00:00:00.000Z",
      generatedAt: "2026-06-19T00:00:00.000Z",
      testName: "public-booking-phone",
      route: "/book/demo-provider?debug=1&fixture=public-booking",
      capturedRoute: "/book/demo-provider?debug=1&fixture=public-booking",
      fixture: "public-booking",
      screenKey: "public-booking",
      viewportKey: "phone",
      viewport: { width: 390, height: 844 },
      tags: ["scheduling", "fixture"],
      artifactBaseName: "public-booking__phone",
      screenshotPath: "test-results/ui-snapshots/public-booking-phone/screenshot.png",
      domSummaryPath: "test-results/ui-snapshots/public-booking-phone/dom-summary.json",
      machinaSnapshotPath: "test-results/ui-snapshots/public-booking-phone/machina-snapshot.json",
      visibleTextExcerpt: "Choose a date and time 30 min Intro Call",
      machinaNodeCount: 6,
      metadata: {
        screenTitle: "Public booking",
        productArea: "scheduling",
        captureSource: "fixture-or-live",
        supportsLiveRoute: true,
        legacyArtifactBaseName: "public-booking",
        debugOverlayMode: "nonInteractiveOverlay",
        taskKey: "public-booking__phone",
      },
    });

    expect(handoff.artifacts).toEqual({
      screenshot: "screenshot.png",
      domSummary: "dom-summary.json",
      layoutSnapshot: "machina-snapshot.json",
      manifest: "handoff.json",
    });

    expect(handoff.machina).toMatchObject({
      artifactBaseName: "public-booking__phone",
      artifacts: {
        screenshot: "screenshot.png",
        domSummary: "dom-summary.json",
        layoutSnapshot: "machina-snapshot.json",
        manifest: "handoff.json",
      },
      viewportKey: "phone",
      tags: ["scheduling", "fixture"],
    });
  });
});
