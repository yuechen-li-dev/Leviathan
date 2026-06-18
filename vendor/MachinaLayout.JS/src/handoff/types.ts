import type { MachinaDomSummary } from "../inspect";
import type { MachinaScreenViewportTask, MachinaViewport } from "../screenCatalog";

export type MachinaHandoffArtifactPaths = {
  screenshot?: string;
  domSummary?: string;
  layoutSnapshot?: string;
  manifest: string;
};

export type MachinaHandoffBundleManifest = {
  schemaVersion: 1;
  createdAt: string;
  route?: string;
  fixture?: string;
  screenKey?: string;
  viewportKey?: string;
  viewport?: MachinaViewport;
  tags?: readonly string[];
  artifactBaseName?: string;
  artifacts: MachinaHandoffArtifactPaths;
  metadata?: Record<string, unknown>;
};

export type WriteMachinaHandoffBundleInput = {
  outputDir: string;
  artifactBaseName?: string;
  screenshotPath?: string;
  domSummary?: MachinaDomSummary;
  layoutSnapshot?: unknown;
  task?: MachinaScreenViewportTask;
  route?: string;
  fixture?: string;
  tags?: readonly string[];
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

export type WriteMachinaHandoffBundleResult = {
  manifest: MachinaHandoffBundleManifest;
  paths: MachinaHandoffArtifactPaths;
};
