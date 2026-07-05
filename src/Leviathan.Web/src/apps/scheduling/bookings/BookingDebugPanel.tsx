// Audit/lifecycle detail panel for a single booking, shown from the
// bookings list (both fixture and live). Extracted from views.tsx (M1).
// Zero behavior change.

import { BookingMetaPanels } from "../shared/BookingMetaPanels";
import { StatusChip } from "../shared/StatusChip";
import {
  chipToneForValue,
  formatTimestamp,
  hasLifecycleCheckpoint,
  lifecycleStateLabel,
  paymentStatusLabel,
  statusLabel,
} from "../shared/format";
import type { Booking, BookingAuditEvent, SchedulingLifecycleSummary } from "../types";

export function BookingDebugPanel({
  booking,
  auditEvents,
  lifecycle,
}: {
  booking: Booking;
  auditEvents: BookingAuditEvent[];
  lifecycle?: SchedulingLifecycleSummary;
}) {
  return (
    <aside className="scheduling-subpanel scheduling-debug" data-testid="provider-booking-detail">
      <div className="scheduling-section-head">
        <div>
          <h3>Audit and lifecycle</h3>
          <p>Lifecycle and audit stay available, but secondary to the primary status and actions.</p>
        </div>
        <div className="scheduling-chip-row">
          <StatusChip tone={chipToneForValue(booking.status)} label={statusLabel(booking.status)} />
          {lifecycle?.paymentStatus || lifecycle?.paymentRequirementStatus ? (
            <StatusChip tone={chipToneForValue(lifecycle.paymentStatus ?? lifecycle.paymentRequirementStatus ?? "not_required")} label={paymentStatusLabel(lifecycle.paymentStatus ?? lifecycle.paymentRequirementStatus ?? "not_required")} />
          ) : null}
        </div>
      </div>

      <div className="scheduling-two-column">
        <article className="card">
          <h4>Lifecycle summary</h4>
          <dl className="scheduling-definition-list">
            <dt>Current state</dt>
            <dd>{lifecycleStateLabel(lifecycle)}</dd>
            <dt>Decision/policy result</dt>
            <dd>{lifecycle?.lastDecisionCode ?? booking.cancellationPolicyResult ?? "unknown"}</dd>
            <dt>Created</dt>
            <dd>{formatTimestamp(booking.createdAt ?? lifecycle?.createdAt, booking.range?.timeZoneId ?? "UTC")}</dd>
            <dt>Confirmed</dt>
            <dd>{formatTimestamp(booking.confirmedAt ?? lifecycle?.confirmedAt, booking.range?.timeZoneId ?? "UTC")}</dd>
            <dt>Cancelled</dt>
            <dd>{formatTimestamp(booking.cancelledAt ?? lifecycle?.cancelledAt, booking.range?.timeZoneId ?? "UTC")}</dd>
            <dt>Last audit event id</dt>
            <dd>{lifecycle?.lastAuditEventId ?? "none"}</dd>
            <dt>Checkpoint exists</dt>
            <dd>{String(hasLifecycleCheckpoint(lifecycle) || !!lifecycle?.checkpointPath)}</dd>
            {booking.cancellationReasonCode ? (
              <>
                <dt>Cancellation reason</dt>
                <dd>{booking.cancellationReasonCode}</dd>
              </>
            ) : null}
            {booking.cancellationMessage ? (
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
            {booking.rescheduledFromBookingId ? (
              <>
                <dt>Rescheduled from</dt>
                <dd>{booking.rescheduledFromBookingId}</dd>
              </>
            ) : null}
            {booking.replacementHoldId ?? lifecycle?.replacementHoldId ? (
              <>
                <dt>Replacement hold</dt>
                <dd>{booking.replacementHoldId ?? lifecycle?.replacementHoldId}</dd>
              </>
            ) : null}
          </dl>
        </article>

        <article className="card">
          <h4>Policy labels</h4>
          <BookingMetaPanels booking={booking} notificationSummary={lifecycle?.notificationSummary ?? booking.notificationSummary} compact />
        </article>
      </div>

      <section className="card">
        <h4>Audit trail</h4>
        <ul className="scheduling-audit-list">
          {auditEvents.map((event) => (
            <li key={event.eventId}>
              <strong>{event.eventType}</strong> · {formatTimestamp(event.occurredAt, booking.range?.timeZoneId ?? "UTC")} · {event.data?.decision ?? event.data?.policyResult ?? event.message}
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
