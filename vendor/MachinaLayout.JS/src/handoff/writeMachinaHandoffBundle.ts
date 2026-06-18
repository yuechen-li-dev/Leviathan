import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { slugMachinaArtifactName } from "../screenCatalog";
import type {
  MachinaHandoffArtifactPaths,
  MachinaHandoffBundleManifest,
  WriteMachinaHandoffBundleInput,
  WriteMachinaHandoffBundleResult,
} from "./types";

function artifactBaseName(input: WriteMachinaHandoffBundleInput): string {
  const candidate =
    input.artifactBaseName ??
    input.task?.artifactBaseName ??
    [
      input.route ?? input.task?.route,
      input.fixture ?? input.task?.fixture,
      input.task?.viewportKey,
    ]
      .filter((part): part is string => typeof part === "string" && part.trim() !== "")
      .join("-") ??
    "";
  return slugMachinaArtifactName(candidate === "" ? "machina-handoff" : candidate);
}

function orderedUnique(...groups: (readonly string[] | undefined)[]): string[] | undefined {
  const result: string[] = [];
  for (const group of groups) {
    for (const tag of group ?? []) {
      if (!result.includes(tag)) result.push(tag);
    }
  }
  return result.length === 0 ? undefined : result;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function screenshotExtension(screenshotPath: string): string {
  const extension = path.extname(screenshotPath);
  return extension === "" ? ".png" : extension;
}

export async function writeMachinaHandoffBundle(
  input: WriteMachinaHandoffBundleInput,
): Promise<WriteMachinaHandoffBundleResult> {
  if (typeof input.outputDir !== "string" || input.outputDir.trim() === "") {
    throw new Error("outputDir must be a non-empty string");
  }

  const outputDir = path.resolve(input.outputDir);
  await mkdir(outputDir, { recursive: true });

  const base = artifactBaseName(input);
  const artifactNames: MachinaHandoffArtifactPaths = { manifest: `${base}__handoff.json` };
  const paths: MachinaHandoffArtifactPaths = {
    manifest: path.join(outputDir, artifactNames.manifest),
  };

  if (input.screenshotPath !== undefined) {
    artifactNames.screenshot = `${base}__screenshot${screenshotExtension(input.screenshotPath)}`;
    paths.screenshot = path.join(outputDir, artifactNames.screenshot);
    await copyFile(input.screenshotPath, paths.screenshot);
  }

  if (input.domSummary !== undefined) {
    artifactNames.domSummary = `${base}__dom-summary.json`;
    paths.domSummary = path.join(outputDir, artifactNames.domSummary);
    await writeFile(paths.domSummary, json(input.domSummary), "utf8");
  }

  if (input.layoutSnapshot !== undefined) {
    artifactNames.layoutSnapshot = `${base}__machina-snapshot.json`;
    paths.layoutSnapshot = path.join(outputDir, artifactNames.layoutSnapshot);
    await writeFile(paths.layoutSnapshot, json(input.layoutSnapshot), "utf8");
  }

  const tags = orderedUnique(input.task?.tags, input.tags);
  const manifest: MachinaHandoffBundleManifest = {
    schemaVersion: 1,
    createdAt: input.createdAt ?? new Date().toISOString(),
    artifacts: artifactNames,
  };
  const route = input.route ?? input.task?.route;
  const fixture = input.fixture ?? input.task?.fixture;
  if (route !== undefined) manifest.route = route;
  if (fixture !== undefined) manifest.fixture = fixture;
  if (input.task !== undefined) {
    manifest.screenKey = input.task.screenKey;
    manifest.viewportKey = input.task.viewportKey;
    manifest.viewport = input.task.viewport;
  }
  if (tags !== undefined) manifest.tags = tags;
  manifest.artifactBaseName = base;
  if (input.metadata !== undefined) manifest.metadata = input.metadata;

  await writeFile(paths.manifest, json(manifest), "utf8");

  return { manifest, paths };
}
