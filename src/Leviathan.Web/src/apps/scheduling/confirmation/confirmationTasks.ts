// The confirmation surface's own fetch (M2.5, closing the TODO left by
// M2). Single-call task, same pattern as the other *Tasks.ts files.

import { A } from "machinalayout/async";
import { getBooking } from "../api";

export const getBookingForConfirmationTask = A.task({
  id: "confirmation.getBooking",
  env: {},
  run: async (_env, input: { bookingId: string }) => A.ok(await getBooking(input.bookingId)),
});
