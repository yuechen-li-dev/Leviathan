// Booking confirmation view (both fixture and live mode - already shared
// via props before this move, same as the reschedule panel). Extracted
// from views.tsx (M2). Zero behavior change.

import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookingMetaPanels } from "../shared/BookingMetaPanels";
import { StatusChip } from "../shared/StatusChip";
import { linkWithCurrentQuery } from "../shared/liveContext";
import {
  bookingActionLabels,
  bookingPrimaryStatusBody,
  bookingPrimaryStatusHeading,
  chipToneForValue,
  formatDateTimeRange,
  formatDurationMinutes,
  nextStepLinesForBooking,
  notificationSummaryLabel,
  paymentSummaryLabel,
  paymentToneValue,
  statusLabel,
} from "../shared/format";
import { schedulingEndpoints } from "../api";
import { BookingDebugPanel } from "../bookings/BookingDebugPanel";
import type { Booking, BookingAuditEvent, SchedulingLifecycleSummary } from "../types";

export function ConfirmationView({
  booking,
  serviceName = "Service",
  resourceName = "Resource",
  actions,
  reschedulePanel,
  lifecycle,
  auditEvents,
}: {
  booking: Booking;
  serviceName?: string;
  resourceName?: string;
  actions?: ReactNode;
  reschedulePanel?: ReactNode;
  lifecycle?: SchedulingLifecycleSummary;
  auditEvents?: BookingAuditEvent[];
}) {
  const bookingId = booking.id.value;
  const tz = booking.range?.timeZoneId ?? "Timezone unavailable";
  const actionState = bookingActionLabels(booking);

  return (
    <section className="scheduling-stack" data-testid="booking-status-root">
      <Card data-testid="booking-status-hero">
        <CardHeader>
          <CardTitle>
            <div className="scheduling-section-head">
              <div>
                <h2>{bookingPrimaryStatusHeading(booking)}</h2>
                <p>{bookingPrimaryStatusBody(booking)}</p>
              </div>
              <div className="scheduling-chip-row">
                <StatusChip tone={chipToneForValue(booking.status)} label={statusLabel(booking.status)} />
                {paymentSummaryLabel(booking) ? <StatusChip tone={chipToneForValue(paymentToneValue(booking))} label={paymentSummaryLabel(booking)!} /> : null}
                {notificationSummaryLabel(lifecycle?.notificationSummary ?? booking.notificationSummary) ? (
                  <StatusChip tone="info" label={notificationSummaryLabel(lifecycle?.notificationSummary ?? booking.notificationSummary)!} />
                ) : null}
              </div>
            </div>
          </CardTitle>
          <CardDescription>
            {booking.customer.name} booked {serviceName}.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card data-testid="booking-status-details">
        <CardHeader>
          <CardTitle>Booking details</CardTitle>
          <CardDescription>Everything needed to understand what was booked at a glance.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="scheduling-definition-list">
            <dt>Provider/resource</dt>
            <dd>{resourceName}</dd>
            <dt>Service</dt>
            <dd>{serviceName}</dd>
            <dt>Date and time</dt>
            <dd>{formatDateTimeRange(booking.range)}</dd>
            <dt>Timezone</dt>
            <dd>{tz}</dd>
            <dt>Duration</dt>
            <dd>{formatDurationMinutes(booking.range)}</dd>
            <dt>Location</dt>
            <dd>Google Meet</dd>
            <dt>Reference</dt>
            <dd>{bookingId}</dd>
            {booking.rescheduledToBookingId ? (
              <>
                <dt>Rescheduled to</dt>
                <dd>{booking.rescheduledToBookingId}</dd>
              </>
            ) : null}
            {booking.rescheduledFromBookingId ? (
              <>
                <dt>Rescheduled from</dt>
                <dd>{booking.rescheduledFromBookingId}</dd>
              </>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <Card data-testid="booking-status-next-steps">
        <CardHeader>
          <CardTitle>What happens next</CardTitle>
          <CardDescription>Short, honest guidance without implying provider integrations that do not exist.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="scheduling-checklist">
            {nextStepLinesForBooking(booking).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card data-testid="booking-status-actions">
        <CardHeader>
          <CardTitle>Actions</CardTitle>
          <CardDescription>Primary actions stay obvious. Debug and lifecycle details stay secondary.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="scheduling-chip-row">
            {actionState.allowIcs ? (
              <Button asChild variant="default">
                <a href={schedulingEndpoints.bookingIcs(bookingId)}>Download ICS</a>
              </Button>
            ) : null}
            {actions}
            {actionState.allowBookAnother ? (
              <Button asChild variant="outline">
                <a href={linkWithCurrentQuery("/apps/scheduling")}>Book another time</a>
              </Button>
            ) : null}
            {!actionState.allowCancel ? <StatusChip tone="neutral" label="Confirmed-only actions disabled" /> : null}
          </div>
          {actionState.allowCancel ? <p className="text-sm text-muted-foreground">Cancellation is available from the provider bookings surface in this local flow.</p> : null}
        </CardContent>
      </Card>

      {reschedulePanel}

      <BookingMetaPanels booking={booking} notificationSummary={lifecycle?.notificationSummary ?? booking.notificationSummary} />

      {lifecycle || auditEvents?.length ? (
        <BookingDebugPanel booking={booking} auditEvents={auditEvents ?? []} lifecycle={lifecycle} />
      ) : null}
    </section>
  );
}
