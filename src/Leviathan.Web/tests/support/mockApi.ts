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

const localDevContext = {
  actorKind: "local-dev",
  userId: "user_local_dev",
  accountId: "acct_local_dev",
  unsafeLocalDev: true,
  requestId: "req_ui_fixture",
  schedulingInstallation: {
    appInstallationId: { value: "inst_local_dev_scheduling" },
    accountId: { value: "acct_local_dev" },
    appId: "scheduling",
    status: "active-local-dev",
    persistenceScope: "scheduling",
  },
};

const publicProvider = {
  id: { value: "prov_demo" },
  slug: "demo-provider",
  displayName: "Ada Demo Practice",
  timeZoneId: "America/Los_Angeles",
  contactEmail: "ada@example.test",
  publicDescription: "Fixture-backed demo provider for UI inspection.",
};

const publicServices = [
  {
    id: { value: "svc_consult_30" },
    providerId: { value: "prov_demo" },
    name: "30 minute consult",
    description: "Resource-first demo service.",
    durationMinutes: 30,
    assignedResourceIds: [{ value: "res_ada" }],
    isPublic: true,
  },
];

const publicSlots = [
  {
    providerId: "prov_demo",
    serviceId: "svc_consult_30",
    resourceId: "res_ada",
    startsAtUtc: "2030-01-07T17:00:00Z",
    endsAtUtc: "2030-01-07T17:30:00Z",
    timeZoneId: "America/Los_Angeles",
    displayLabel: "Mon Jan 7, 9:00 AM",
    providerTimeZoneId: "America/Los_Angeles",
    displayTimeZoneId: "America/Los_Angeles",
    displayStartsAtLocal: "Mon Jan 7, 9:00 AM PST",
    displayEndsAtLocal: "Mon Jan 7, 9:30 AM PST",
  },
];

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

    if (method === "GET" && path.endsWith("/api/platform/local-dev/context")) {
      await json(route, localDevContext);
      return;
    }

    if (method === "GET" && path.endsWith(`/api/apps/scheduling/sessions/${schedulingSession.sessionId}/screen`)) {
      await json(route, schedulingSession);
      return;
    }

    if (method === "GET" && path.endsWith("/api/apps/scheduling/public/demo-provider")) {
      await json(route, publicProvider);
      return;
    }

    if (method === "GET" && path.endsWith("/api/apps/scheduling/public/demo-provider/services")) {
      await json(route, publicServices);
      return;
    }

    if (method === "GET" && path.endsWith("/api/apps/scheduling/public/demo-provider/slots")) {
      await json(route, publicSlots);
      return;
    }

    await json(route, { error: "playwright_unmocked_api", method, path }, 404);
  });
}
