// The bookings list's three async operations, as machinalayout/async tasks
// (M2.5, closing the TODO left in LiveProviderBookingsView.tsx by M1/M2).
// Same pattern as confirmation/rescheduleTasks.ts - api.ts's functions
// already throw on failure, the controller catches that automatically, so
// these don't need their own try/catch.

import { A } from "machinalayout/async";
import { cancelBooking, getBookingAudit, getBookingLifecycle, getBookingNotifications, listProviderBookings } from "../api";

export const listBookingsTask = A.task({
  id: "bookings.listBookings",
  env: {},
  run: async (_env, input: { providerId: string }) => A.ok(await listProviderBookings(input.providerId)),
});

export type BookingDetail = Awaited<ReturnType<typeof loadDetail>>;

async function loadDetail(providerId: string, bookingId: string) {
  const [auditEvents, lifecycle, notifications] = await Promise.all([
    getBookingAudit(bookingId, providerId),
    getBookingLifecycle(bookingId),
    getBookingNotifications(bookingId),
  ]);
  return { auditEvents, lifecycle, notifications };
}

export const loadBookingDetailTask = A.task({
  id: "bookings.loadBookingDetail",
  env: {},
  run: async (_env, input: { providerId: string; bookingId: string }) => A.ok(await loadDetail(input.providerId, input.bookingId)),
});

export const cancelBookingTask = A.task({
  id: "bookings.cancelBooking",
  env: {},
  run: async (_env, input: { bookingId: string }) => A.ok(await cancelBooking(input.bookingId)),
});
