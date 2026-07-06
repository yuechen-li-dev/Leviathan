// Confirmation surface, live backend mode. Extracted from views.tsx (M2).
// M2.5: booking-fetch-on-mount now runs through useAsyncTask, closing the
// TODO M2 left here - gets stale-completion protection for free if the
// route's bookingId ever changes while a fetch is in flight.

import { useEffect, useState } from "react";
import { matchKind } from "machinalayout/match";
import { Button } from "@/components/ui/button";
import { bookingIdFromPath, controlledSchedulingError, linkWithCurrentQuery, loadLiveContext, providerSlugFromPath, saveLiveContext } from "../shared/liveContext";
import type { Booking } from "../types";
import { BookingReschedulePanel } from "./BookingReschedulePanel";
import { ConfirmationView } from "./ConfirmationView";
import { getBookingForConfirmationTask } from "./confirmationTasks";
import { useAsyncTask } from "../../../machina/useAsyncTask";

function taskErrorMessage(error: unknown): string | undefined {
  if (error === undefined) return undefined;
  return error instanceof Error ? error.message : String(error);
}

function LiveConfirmationView() {
  const liveContext = loadLiveContext();
  const bookingTask = useAsyncTask(getBookingForConfirmationTask);
  const board = bookingTask.snapshot.board;
  // The fetch owns the booking until something updates it locally (e.g. a
  // reschedule confirming a replacement, via onOriginalBookingUpdated) -
  // once that happens, the override takes precedence over the fetch's own
  // result, same as the old component's single `setBooking` did double duty
  // for both cases.
  const [bookingOverride, setBookingOverride] = useState<Booking | null>(null);
  const booking = bookingOverride ?? (board.status === "succeeded" ? board.result : null);
  const missingBookingId = !bookingIdFromPath() && !liveContext.bookingId;
  const errorMessage = missingBookingId ? "Booking id is missing from the confirmation route." : taskErrorMessage(board.error);

  useEffect(() => {
    const bookingId = bookingIdFromPath() ?? liveContext.bookingId;
    if (!bookingId) return;
    void bookingTask.run({ bookingId }).then((result) =>
      matchKind(result, {
        ok: (r) => saveLiveContext({ bookingId: r.value.id.value, providerId: r.value.providerId?.value }),
        err: () => {},
        cancelled: () => {},
        timeout: () => {},
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveContext.bookingId]);

  if (!booking) {
    return (
      <div className="scheduling-stack">
        <section className="scheduling-subpanel">
          <h2>Booking confirmed</h2>
          {errorMessage ? <p className="error" role="alert">{controlledSchedulingError(errorMessage)}</p> : <p>Loading booking confirmation…</p>}
        </section>
      </div>
    );
  }

  return (
    <div className="scheduling-stack">
      <ConfirmationView
        actions={
          <Button asChild data-testid="confirmation-open-bookings" variant="secondary">
            <a href={linkWithCurrentQuery(`/apps/scheduling/bookings?providerId=${encodeURIComponent(booking.providerId?.value ?? liveContext.providerId ?? "")}&bookingId=${encodeURIComponent(booking.id.value)}`)}>
              Open provider bookings
            </a>
          </Button>
        }
        booking={booking}
        reschedulePanel={
          <BookingReschedulePanel
            actor="local-dev-admin"
            booking={booking}
            onOriginalBookingUpdated={setBookingOverride}
            onReplacementConfirmed={(nextBooking) => {
              saveLiveContext({
                providerId: nextBooking.providerId?.value ?? booking.providerId?.value ?? liveContext.providerId,
                bookingId: nextBooking.id.value,
              });
            }}
            providerSlug={loadLiveContext().providerSlug ?? providerSlugFromPath()}
            serviceName="30 minute consult"
          />
        }
        resourceName="M24 Smoke Resource"
        serviceName="30 minute consult"
      />
    </div>
  );
}
export { LiveConfirmationView };
