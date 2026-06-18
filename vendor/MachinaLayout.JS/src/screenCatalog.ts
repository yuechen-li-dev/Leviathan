import { MachinaLayoutError } from "./errors";

export type MachinaViewport = {
  key: string;
  width: number;
  height: number;
  deviceScaleFactor?: number;
  label?: string;
  tags?: readonly string[];
};

export type MachinaViewportMatrix = readonly MachinaViewport[];

export type MachinaScreen = {
  key: string;
  route: string;
  fixture?: string;
  viewports?: readonly string[];
  tags?: readonly string[];
  title?: string;
  metadata?: Record<string, unknown>;
};

export type MachinaScreenCatalog = {
  screens: Record<string, MachinaScreen>;
  order: string[];
};

export type MachinaScreenViewportTask = {
  key: string;
  screenKey: string;
  viewportKey: string;
  route: string;
  fixture?: string;
  viewport: MachinaViewport;
  screen: MachinaScreen;
  tags: readonly string[];
  artifactBaseName: string;
};

type ExpandOptions = {
  screenKeys?: readonly string[];
  viewportKeys?: readonly string[];
  tags?: readonly string[];
};

const STANDARD_VIEWPORTS: readonly MachinaViewport[] = [
  { key: "desktop", width: 1440, height: 900, label: "Desktop", tags: ["desktop"] },
  { key: "tablet", width: 1024, height: 768, label: "Tablet", tags: ["tablet"] },
  { key: "phone", width: 390, height: 844, label: "Phone", tags: ["phone", "mobile"] },
];

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validateStringArray(
  value: readonly string[] | undefined,
  code: "InvalidViewport" | "InvalidScreen",
  field: string,
) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new MachinaLayoutError(code, `${field} must be an array of strings`);
  }
}

function copyViewport(viewport: MachinaViewport): MachinaViewport {
  return {
    ...viewport,
    tags: viewport.tags === undefined ? undefined : [...viewport.tags],
  };
}

function copyScreen(screen: MachinaScreen): MachinaScreen {
  return {
    ...screen,
    viewports: screen.viewports === undefined ? undefined : [...screen.viewports],
    tags: screen.tags === undefined ? undefined : [...screen.tags],
  };
}

export function defineMachinaViewports(
  viewports: readonly MachinaViewport[],
): MachinaViewportMatrix {
  const seen = new Set<string>();
  return viewports.map((viewport) => {
    if (typeof viewport.key !== "string" || viewport.key.trim() === "") {
      throw new MachinaLayoutError("InvalidViewport", "viewport key must be a non-empty string");
    }
    if (seen.has(viewport.key)) {
      throw new MachinaLayoutError(
        "DuplicateViewportKey",
        `duplicate viewport key: ${viewport.key}`,
      );
    }
    seen.add(viewport.key);
    if (!isPositiveFiniteNumber(viewport.width) || !isPositiveFiniteNumber(viewport.height)) {
      throw new MachinaLayoutError(
        "InvalidViewport",
        `viewport ${viewport.key} width and height must be finite positive numbers`,
      );
    }
    if (
      viewport.deviceScaleFactor !== undefined &&
      !isPositiveFiniteNumber(viewport.deviceScaleFactor)
    ) {
      throw new MachinaLayoutError(
        "InvalidViewport",
        `viewport ${viewport.key} deviceScaleFactor must be a finite positive number`,
      );
    }
    if (viewport.label !== undefined && typeof viewport.label !== "string") {
      throw new MachinaLayoutError(
        "InvalidViewport",
        `viewport ${viewport.key} label must be a string`,
      );
    }
    validateStringArray(viewport.tags, "InvalidViewport", `viewport ${viewport.key} tags`);
    return copyViewport(viewport);
  });
}

export function createViewportMatrix(
  preset: "standard-responsive" | "desktop-only" | "mobile-first" = "standard-responsive",
): MachinaViewportMatrix {
  if (preset === "desktop-only") return defineMachinaViewports([STANDARD_VIEWPORTS[0]]);
  if (preset === "mobile-first")
    return defineMachinaViewports([
      STANDARD_VIEWPORTS[2],
      STANDARD_VIEWPORTS[1],
      STANDARD_VIEWPORTS[0],
    ]);
  return defineMachinaViewports(STANDARD_VIEWPORTS);
}

export function defineMachinaScreens(screens: readonly MachinaScreen[]): MachinaScreenCatalog {
  const catalog: MachinaScreenCatalog = { screens: {}, order: [] };
  for (const screen of screens) {
    if (typeof screen.key !== "string" || screen.key.trim() === "") {
      throw new MachinaLayoutError("InvalidScreen", "screen key must be a non-empty string");
    }
    if (catalog.screens[screen.key] !== undefined) {
      throw new MachinaLayoutError("DuplicateScreenKey", `duplicate screen key: ${screen.key}`);
    }
    if (typeof screen.route !== "string" || screen.route.trim() === "") {
      throw new MachinaLayoutError(
        "InvalidScreen",
        `screen ${screen.key} route must be a non-empty string`,
      );
    }
    if (screen.fixture !== undefined && typeof screen.fixture !== "string") {
      throw new MachinaLayoutError(
        "InvalidScreen",
        `screen ${screen.key} fixture must be a string`,
      );
    }
    validateStringArray(screen.viewports, "InvalidScreen", `screen ${screen.key} viewports`);
    validateStringArray(screen.tags, "InvalidScreen", `screen ${screen.key} tags`);
    if (
      screen.metadata !== undefined &&
      (typeof screen.metadata !== "object" ||
        screen.metadata === null ||
        Array.isArray(screen.metadata))
    ) {
      throw new MachinaLayoutError(
        "InvalidScreen",
        `screen ${screen.key} metadata must be an object`,
      );
    }
    catalog.screens[screen.key] = copyScreen(screen);
    catalog.order.push(screen.key);
  }
  return catalog;
}

export function slugMachinaArtifactName(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "artifact" : slug;
}

export function getMachinaViewport(viewports: MachinaViewportMatrix, key: string): MachinaViewport {
  const viewport = viewports.find((candidate) => candidate.key === key);
  if (!viewport) throw new MachinaLayoutError("UnknownViewportKey", `unknown viewport key: ${key}`);
  return viewport;
}

function orderedUnique(values: readonly string[] | undefined): string[] {
  const result: string[] = [];
  for (const value of values ?? []) {
    if (!result.includes(value)) result.push(value);
  }
  return result;
}

export function expandScreenViewportTasks(
  catalog: MachinaScreenCatalog,
  viewports: MachinaViewportMatrix,
  options: ExpandOptions = {},
): MachinaScreenViewportTask[] {
  const viewportKeys = viewports.map((viewport) => viewport.key);
  const viewportKeySet = new Set(viewportKeys);
  for (const key of options.screenKeys ?? []) {
    if (catalog.screens[key] === undefined)
      throw new MachinaLayoutError("UnknownScreenKey", `unknown screen key: ${key}`);
  }
  for (const key of options.viewportKeys ?? []) {
    if (!viewportKeySet.has(key))
      throw new MachinaLayoutError("UnknownViewportKey", `unknown viewport key: ${key}`);
  }
  const requestedScreens =
    options.screenKeys === undefined ? undefined : new Set(options.screenKeys);
  const requestedViewports =
    options.viewportKeys === undefined ? undefined : new Set(options.viewportKeys);
  const tasks: MachinaScreenViewportTask[] = [];
  for (const screenKey of catalog.order) {
    if (requestedScreens && !requestedScreens.has(screenKey)) continue;
    const screen = catalog.screens[screenKey];
    if (!screen)
      throw new MachinaLayoutError(
        "UnknownScreenKey",
        `unknown screen key in catalog order: ${screenKey}`,
      );
    const screenViewportSet =
      screen.viewports === undefined ? undefined : new Set(screen.viewports);
    for (const key of screen.viewports ?? []) {
      if (!viewportKeySet.has(key))
        throw new MachinaLayoutError(
          "UnknownViewportKey",
          `screen ${screen.key} references unknown viewport key: ${key}`,
        );
    }
    for (const viewport of viewports) {
      if (screenViewportSet && !screenViewportSet.has(viewport.key)) continue;
      if (requestedViewports && !requestedViewports.has(viewport.key)) continue;
      const tags = orderedUnique([...(screen.tags ?? []), ...(viewport.tags ?? [])]);
      if ((options.tags ?? []).some((tag) => !tags.includes(tag))) continue;
      tasks.push({
        key: `${screen.key}__${viewport.key}`,
        screenKey: screen.key,
        viewportKey: viewport.key,
        route: screen.route,
        fixture: screen.fixture,
        viewport,
        screen,
        tags,
        artifactBaseName: `${slugMachinaArtifactName(screen.key)}__${slugMachinaArtifactName(viewport.key)}`,
      });
    }
  }
  return tasks;
}
