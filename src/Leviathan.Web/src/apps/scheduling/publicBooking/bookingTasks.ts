// The public booking flow's async steps, as machinalayout/async tasks (M3).
// Same pattern as every other *Tasks.ts file in this app - api.ts throws on
// failure, the controller catches that automatically.

import { A } from "machinalayout/async";
import { confirmBooking, createHold, fakeSatisfyPayment, getPublicProvider, getPublicServices, listSlots, submitIntake } from "../api";
import type { BookableSlot } from "../types";

export const loadProviderAndServicesTask = A.task({
  id: "publicBooking.loadProviderAndServices",
  env: {},
  run: async (_env, input: { providerSlug: string }) => {
    const [provider, services] = await Promise.all([getPublicProvider(input.providerSlug), getPublicServices(input.providerSlug)]);
    return A.ok({ provider, services: services.map((service) => ({ ...service, isPublic: true })) });
  },
});

export const listPublicSlotsTask = A.task({
  id: "publicBooking.listSlots",
  env: {},
  run: async (_env, input: { providerSlug: string; serviceId: string; from: string; to: string; timeZone: string }) =>
    A.ok(await listSlots(input.providerSlug, input.serviceId, input.from, input.to, input.timeZone)),
});

export const createPublicHoldTask = A.task({
  id: "publicBooking.createHold",
  env: {},
  run: async (_env, input: { slot: BookableSlot }) => A.ok(await createHold(input.slot)),
});

export const submitPublicIntakeTask = A.task({
  id: "publicBooking.submitIntake",
  env: {},
  run: async (
    _env,
    input: { holdId: string; claimToken: string; customer: { name: string; email: string; phone?: string; notes?: string } },
  ) => A.ok(await submitIntake(input.holdId, input.claimToken, input.customer)),
});

export const satisfyPublicPaymentTask = A.task({
  id: "publicBooking.satisfyPayment",
  env: {},
  run: async (_env, input: { holdId: string; claimToken: string }) => A.ok(await fakeSatisfyPayment(input.holdId, input.claimToken)),
});

export const confirmPublicBookingTask = A.task({
  id: "publicBooking.confirmBooking",
  env: {},
  run: async (
    _env,
    input: { holdId: string; claimToken: string; customer: { name: string; email: string; phone?: string; notes?: string } },
  ) => A.ok(await confirmBooking(input.holdId, input.claimToken, input.customer)),
});
