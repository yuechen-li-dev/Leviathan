// The reschedule flow's five async steps, as machinalayout/async tasks
// (M2). Each gets its own AsyncTaskController via useAsyncTask, replacing
// the old BookingReschedulePanel's single `busy: string | null` covering
// all five. api.ts's functions already throw on failure (see `api()`'s
// wrapper) - the controller catches that automatically (confirmed by
// reading controller.ts directly - task.run() rejections settle as a
// `failed` board state), so these run functions don't need their own
// try/catch. `A.ok(...)` on the happy path is the only thing each one adds.

import { A } from "machinalayout/async";
import {
  confirmBooking,
  createReplacementHold,
  fakeSatisfyPayment,
  getBooking,
  listSlots,
  submitIntake,
} from "../api";
import type { Booking, ReplacementHoldResponse } from "../types";

export const listReplacementSlotsTask = A.task({
  id: "reschedule.listReplacementSlots",
  env: {},
  run: async (_env, input: { providerSlug: string; serviceId: string; from: string; to: string; timeZone: string }) =>
    A.ok(await listSlots(input.providerSlug, input.serviceId, input.from, input.to, input.timeZone)),
});

export const createReplacementHoldTask = A.task({
  id: "reschedule.createReplacementHold",
  env: {},
  run: async (
    _env,
    input: {
      bookingId: string;
      serviceId: string;
      resourceId: string;
      startUtc: string;
      endUtc: string;
      timeZoneId: string;
      displayTimeZoneId?: string;
      actor?: string;
    },
  ) =>
    A.ok(
      await createReplacementHold(input.bookingId, {
        serviceId: input.serviceId,
        resourceId: input.resourceId,
        startUtc: input.startUtc,
        endUtc: input.endUtc,
        timeZoneId: input.timeZoneId,
        displayTimeZoneId: input.displayTimeZoneId,
        reason: "customer_requested",
        actor: input.actor ?? "local-dev-admin",
      }),
    ),
});

export const submitReplacementIntakeTask = A.task({
  id: "reschedule.submitReplacementIntake",
  env: {},
  run: async (
    _env,
    input: { holdId: string; claimToken: string; customer: { name: string; email: string; phone?: string; notes?: string } },
  ) => A.ok(await submitIntake(input.holdId, input.claimToken, input.customer)),
});

export const satisfyReplacementPaymentTask = A.task({
  id: "reschedule.satisfyReplacementPayment",
  env: {},
  run: async (_env, input: { holdId: string; claimToken: string; actor?: string }) =>
    A.ok(await fakeSatisfyPayment(input.holdId, input.claimToken, input.actor ?? "local-dev-admin")),
});

export type ConfirmReplacementOutput = { replacementBooking: Booking; oldBooking: Booking };

export const confirmReplacementTask = A.task({
  id: "reschedule.confirmReplacement",
  env: {},
  run: async (
    _env,
    input: {
      holdId: string;
      claimToken: string;
      customer: { name: string; email: string; phone?: string; notes?: string };
      originalBookingId: string;
    },
  ) => {
    const replacementBooking = await confirmBooking(input.holdId, input.claimToken, input.customer);
    const oldBooking = await getBooking(input.originalBookingId);
    return A.ok<ConfirmReplacementOutput>({ replacementBooking, oldBooking });
  },
});

export type { ReplacementHoldResponse };
