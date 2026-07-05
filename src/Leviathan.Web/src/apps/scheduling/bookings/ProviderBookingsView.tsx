// Provider bookings list (fixture mode). Extracted from views.tsx (M1).
// Zero behavior change. `reschedulePanel` stays an externally-supplied
// ReactNode (already the pattern in the original code) rather than this
// component constructing BookingReschedulePanel itself - that's still
// confirmation-territory code, pending its own move in M2.

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AdminModeBanner } from "../shared/AdminGateBanner";
import { controlledSchedulingError, isUnsafeAdminError } from "../shared/liveContext";
import { StatusChip } from "../shared/StatusChip";
import {
  chipToneForValue,
  formatDateTimeRange,
  notificationSummaryLabel,
  paymentSummaryLabel,
  paymentToneValue,
  statusLabel,
} from "../shared/format";
import { schedulingEndpoints } from "../api";
import type { Booking, BookingAuditEvent, SchedulingLifecycleSummary } from "../types";
import { BookingDebugPanel } from "./BookingDebugPanel";

export function ProviderBookingsView({
  bookings = [],
  selectedBooking,
  auditEvents = [],
  lifecycle,
  errorMessage,
  reschedulePanel,
}: {
  bookings?: Booking[];
  selectedBooking?: Booking;
  auditEvents?: BookingAuditEvent[];
  lifecycle?: SchedulingLifecycleSummary;
  errorMessage?: string;
  reschedulePanel?: ReactNode;
}) {
  return (
    <div className="scheduling-stack" data-testid="provider-bookings-root">
      <section className="scheduling-subpanel" data-testid="provider-bookings-list">
        <div className="scheduling-section-head">
          <div>
            <h2>Provider bookings</h2>
            <p>Readable booking status, payment, notifications, and lifecycle access for provider-side follow-up.</p>
          </div>
          <div className="scheduling-chip-row">
            <StatusChip tone="warning" label="unsafe local-dev admin" />
          </div>
        </div>
        <AdminModeBanner errorMessage={errorMessage} />
        {errorMessage && !isUnsafeAdminError(errorMessage) ? (
          <p className="error" role="alert">
            {controlledSchedulingError(errorMessage)}
          </p>
        ) : null}

        <div className="scheduling-bookings-table-wrap">
          <div className="scheduling-stack scheduling-stack-tight">
            {bookings.map((booking) => (
              <Card key={booking.id.value}>
                <CardHeader>
                  <div className="scheduling-section-head">
                    <div>
                      <CardTitle>{booking.customer.name}</CardTitle>
                      <CardDescription>{formatDateTimeRange(booking.range)}</CardDescription>
                    </div>
                    <div className="scheduling-chip-row">
                      <StatusChip tone={chipToneForValue(booking.status)} label={statusLabel(booking.status)} />
                      {paymentSummaryLabel(booking) ? (
                        <StatusChip tone={chipToneForValue(paymentToneValue(booking))} label={paymentSummaryLabel(booking)!} />
                      ) : (
                        <StatusChip tone="neutral" label="No payment required" />
                      )}
                      {notificationSummaryLabel(booking.notificationSummary) ? (
                        <StatusChip tone="info" label={notificationSummaryLabel(booking.notificationSummary)!} />
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <dl className="scheduling-definition-list">
                    <dt>Email</dt>
                    <dd>{booking.customer.email}</dd>
                    <dt>Timezone</dt>
                    <dd>{booking.range?.timeZoneId ?? "Not recorded"}</dd>
                    <dt>Reference</dt>
                    <dd>{booking.id.value}</dd>
                    {booking.status === "cancelled" && booking.cancellationMessage ? (
                      <>
                        <dt>Cancellation message</dt>
                        <dd>{booking.cancellationMessage}</dd>
                      </>
                    ) : null}
                    {booking.rescheduledToBookingId ? (
                      <>
                        <dt>Rescheduled to</dt>
                        <dd>{booking.rescheduledToBookingId}</dd>
                      </>
                    ) : null}
                  </dl>
                </CardContent>
                <CardFooter className="gap-3">
                  {booking.status === "confirmed" ? <Button type="button" variant="destructive">Cancel booking</Button> : null}
                  {booking.status === "confirmed" ? (
                    <Button asChild variant="outline">
                      <a className="scheduling-inline-link" href={schedulingEndpoints.bookingIcs(booking.id.value)}>
                        Download ICS
                      </a>
                    </Button>
                  ) : null}
                  <Button type="button" variant="secondary">Inspect lifecycle</Button>
                  {booking.status !== "confirmed" ? <StatusChip tone="neutral" label="Confirmed-only actions disabled" /> : null}
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {reschedulePanel}

      {selectedBooking ? <BookingDebugPanel booking={selectedBooking} auditEvents={auditEvents} lifecycle={lifecycle} /> : null}
    </div>
  );
}
