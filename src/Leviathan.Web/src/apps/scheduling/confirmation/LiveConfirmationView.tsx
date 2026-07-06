// Confirmation surface, live backend mode. Extracted from views.tsx (M2).
// Zero behavior change - this view's own booking-fetch-on-mount stays
// plain useState for now; see the M2.5-adjacent TODO in this file for why
// it's a reasonable future useAsyncTask candidate but out of scope here.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getBooking } from "../api";
import { bookingIdFromPath, controlledSchedulingError, linkWithCurrentQuery, loadLiveContext, providerSlugFromPath, saveLiveContext } from "../shared/liveContext";
import type { Booking } from "../types";
import { BookingReschedulePanel } from "./BookingReschedulePanel";
import { ConfirmationView } from "./ConfirmationView";

function LiveConfirmationView() {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
  const liveContext = loadLiveContext();

  // TODO(async-adoption): plain useState/useEffect fetch-on-mount, same
  // shape as the pre-M2 pattern. Genuine useAsyncTask candidate (gets
  // stale-completion protection for free if the route's bookingId ever
  // changes while a fetch is in flight), deliberately out of scope for M2 -
  // this view's fetch isn't the reschedule flow M2 was scoped to port.
  useEffect(() => {
    const bookingId = bookingIdFromPath() ?? liveContext.bookingId;
    if (!bookingId) {
      setErrorMessage("Booking id is missing from the confirmation route.");
      return;
    }
    void getBooking(bookingId)
      .then((value) => {
        setBooking(value);
        saveLiveContext({ bookingId: value.id.value, providerId: value.providerId?.value });
      })
      .catch((error) => setErrorMessage(error instanceof Error ? error.message : String(error)));
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
            onOriginalBookingUpdated={setBooking}
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
