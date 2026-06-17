import type { Page, Route } from "@playwright/test";

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body, null, 2),
  });
}

const appManifests = [
  {
    appId: "rust_simulator",
    displayName: "Rust Simulator",
    kind: "ariadne",
    description: "Ariadne-driven Rust survival scenario.",
    runtime: "browser",
    frontendRoute: "/apps/rust-simulator",
    persistenceScope: "rust-simulator",
    capabilities: ["prompt", "transcript"],
    metadata: {},
  },
  {
    appId: "scheduling",
    displayName: "Scheduling",
    kind: "workflow",
    description: "Provider setup, public booking, lifecycle, and audit tooling.",
    runtime: "browser",
    frontendRoute: "/apps/scheduling",
    persistenceScope: "scheduling",
    capabilities: ["booking", "audit", "lifecycle"],
    metadata: {},
  },
];

const schedulingSession = {
  sessionId: "sched-session-1",
  appId: "scheduling",
  title: "Scheduling",
  revision: 1,
  isComplete: false,
  error: null,
  transcript: [],
  prompt: null,
};

export async function installLeviathanUiMocks(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method().toUpperCase();

    if (method === "GET" && path.endsWith("/api/apps")) {
      await json(route, appManifests);
      return;
    }

    if (method === "POST" && path.endsWith("/api/apps/scheduling/sessions")) {
      await json(route, { sessionId: schedulingSession.sessionId, screen: schedulingSession });
      return;
    }

    if (method === "GET" && path.endsWith(`/api/apps/scheduling/sessions/${schedulingSession.sessionId}/screen`)) {
      await json(route, schedulingSession);
      return;
    }

    await json(route, { error: "playwright_unmocked_api", method, path }, 404);
  });
}
