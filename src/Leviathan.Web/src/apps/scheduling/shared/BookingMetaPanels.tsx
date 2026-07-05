// Payment/notification summary panels shared by the confirmation surface,
// the bookings list, and the booking debug panel. Extracted from views.tsx
// (M1). Zero behavior change.

import { formatTimestamp, paymentSummaryLabel, paymentToneValue, chipToneForValue } from "./format";
import { StatusChip } from "./StatusChip";
import type { Booking, NotificationSummary } from "../types";

export function BookingMetaPanels({
  booking,
  notificationSummary,
  compact = false,
}: {
  booking: Booking;
  notificationSummary?: NotificationSummary;
  compact?: boolean;
}) {
  const paymentLabel = paymentSummaryLabel(booking) ?? "No payment required";

  return (
    <div className={compact ? "scheduling-stack scheduling-stack-tight" : "scheduling-two-column"}>
      <article className={compact ? "" : "card"}>
        <h4>Payment</h4>
        <div className="scheduling-chip-row">
          <StatusChip tone={chipToneForValue(paymentToneValue(booking))} label={paymentLabel} />
        </div>
        {booking.paymentPolicyLabel ? <p>{booking.paymentPolicyLabel}</p> : null}
        {booking.paymentRequirementStatus === "payment_required" ? (
          <p>This booking requires controlled local/test payment satisfaction before confirmation.</p>
        ) : null}
        {!booking.paymentPolicyLabel && !booking.paymentReference && paymentLabel === "No payment required" ? (
          <p>No payment step is required for this booking.</p>
        ) : null}
        {booking.paymentReference ? <p>Reference: {booking.paymentReference}</p> : null}
        {booking.paymentSatisfiedAt ? <p>Satisfied at: {formatTimestamp(booking.paymentSatisfiedAt, booking.range?.timeZoneId ?? "UTC")}</p> : null}
      </article>

      <article className={compact ? "" : "card"}>
        <h4>Notifications</h4>
        {booking.notificationPolicyLabel ? <p>{booking.notificationPolicyLabel}</p> : null}
        <p>Notification policy only — no real email/SMS provider connected.</p>
        {notificationSummary ? <NotificationSummaryList summary={notificationSummary} /> : <p>No notification records were captured for this booking.</p>}
      </article>
    </div>
  );
}

export function NotificationSummaryList({ summary }: { summary: NotificationSummary }) {
  return (
    <ul className="scheduling-checklist scheduling-checklist-tight">
      <li>Pending: {summary.pending}</li>
      <li>Sent fake/local: {summary.sentFake}</li>
      <li>Cancelled: {summary.cancelled}</li>
      <li>Skipped: {summary.skipped}</li>
      <li>Failed: {summary.failed}</li>
      <li>Deferred provider unavailable: {summary.deferredProviderUnavailable}</li>
    </ul>
  );
}
