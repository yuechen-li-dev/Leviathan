// Confirmation surface, fixture mode. Extracted from views.tsx (M2).
// Zero behavior change.

import { Button } from "@/components/ui/button";
import { linkWithCurrentQuery } from "../shared/liveContext";
import type { SchedulingFixtureScenario } from "../fixtures";
import { BookingReschedulePanel } from "./BookingReschedulePanel";
import { ConfirmationView } from "./ConfirmationView";

function ConfirmationSurfaceView({ scenario }: { scenario: SchedulingFixtureScenario }) {
  const booking = scenario.booking;
  const serviceName =
    scenario.services?.find((service) => service.id.value === booking?.serviceId?.value)?.name ??
    scenario.services?.find((service) => service.durationMinutes === 30)?.name ??
    "30 min Intro Call";
  if (!booking) return null;

  return (
    <div className="scheduling-stack">
      <ConfirmationView
        actions={
          <Button asChild variant="secondary">
            <a
              className="scheduling-inline-link"
              data-testid="confirmation-open-bookings"
              href={linkWithCurrentQuery(`/apps/scheduling/bookings?fixture=notification-summary&bookingId=${encodeURIComponent(booking.id.value)}`)}
            >
              Open provider bookings
            </a>
          </Button>
        }
        auditEvents={scenario.auditEvents}
        booking={booking}
        lifecycle={scenario.lifecycle}
        reschedulePanel={
          <BookingReschedulePanel
            booking={scenario.rescheduleState?.oldBooking ?? booking}
            fixtureState={scenario.rescheduleState}
            providerSlug={scenario.providerSlug}
            serviceName={serviceName}
          />
        }
        resourceName="Ada Demo Practice"
        serviceName={serviceName}
      />
    </div>
  );
}
export { ConfirmationSurfaceView };
