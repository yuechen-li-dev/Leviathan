// The provider setup wizard's four create-step network calls, as
// machinalayout/async tasks (M2.5, closing the TODO left by M0). The Deus
// stage machine (setupMachine.ts) keeps its *Pending states unchanged -
// they're load-bearing for gating (createResource is only eligible from
// idle, specifically preventing it from firing while createProvider is
// still in flight), not just busy-tracking, so restructuring that wasn't
// in scope here. This only replaces the manual try/catch per step with a
// real AsyncTaskController, same pattern as every other *Tasks.ts file.

import { A } from "machinalayout/async";
import { assignResourceToService, createAvailabilityRule, createProvider, createResource, createService } from "../api";
import type { SchedulingNotificationPolicy, SchedulingPaymentPolicy } from "../types";

export const createProviderTask = A.task({
  id: "setup.createProvider",
  env: {},
  run: async (
    _env,
    input: { slug: string; displayName: string; timeZoneId: string; contactEmail: string; publicDescription: string },
  ) => A.ok(await createProvider(input)),
});

export const createResourceTask = A.task({
  id: "setup.createResource",
  env: {},
  run: async (_env, input: { providerId: string; displayName: string; resourceType: string; timeZoneId: string }) =>
    A.ok(await createResource(input)),
});

export const createServiceTask = A.task({
  id: "setup.createService",
  env: {},
  run: async (
    _env,
    input: {
      providerId: string;
      resourceId: string;
      name: string;
      description: string;
      durationMinutes: number;
      paymentPolicy: SchedulingPaymentPolicy;
      notificationPolicy: SchedulingNotificationPolicy;
    },
  ) => {
    const created = await createService({
      providerId: input.providerId,
      name: input.name,
      description: input.description,
      durationMinutes: input.durationMinutes,
      paymentPolicy: input.paymentPolicy,
      notificationPolicy: input.notificationPolicy,
    });
    const assigned = await assignResourceToService(created.id.value, input.providerId, input.resourceId);
    return A.ok(assigned);
  },
});

export const createAvailabilityTask = A.task({
  id: "setup.createAvailability",
  env: {},
  run: async (
    _env,
    input: { providerId: string; resourceId: string; timeZoneId: string; daysOfWeek: string[]; localStartTime: string; localEndTime: string },
  ) => A.ok(await createAvailabilityRule(input)),
});
