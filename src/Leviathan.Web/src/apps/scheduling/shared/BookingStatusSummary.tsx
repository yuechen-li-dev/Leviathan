// Compact booking status summary, used by the confirmation surface and the
// (still-in-views.tsx, pending M3) public booking flow. Extracted from
// views.tsx (M2). Zero behavior change.

import { BookingMetaPanels } from "./BookingMetaPanels";
import { StatusChip } from "./StatusChip";
import { chipToneForValue, notificationSummaryLabel, paymentSummaryLabel, paymentToneValue, statusLabel } from "./format";
import type { Booking, SchedulingLifecycleSummary } from "../types";

export function BookingStatusSummary({ booking, lifecycle }: { booking: Booking; lifecycle?: SchedulingLifecycleSummary }) {
  return (
    <div className="scheduling-stack scheduling-stack-tight">
      <div className="scheduling-chip-row">
        <StatusChip tone={chipToneForValue(booking.status)} label={statusLabel(booking.status)} />
        {paymentSummaryLabel(booking) ? <StatusChip tone={chipToneForValue(paymentToneValue(booking))} label={paymentSummaryLabel(booking)!} /> : null}
        {notificationSummaryLabel(lifecycle?.notificationSummary ?? booking.notificationSummary) ? (
          <StatusChip tone="info" label={notificationSummaryLabel(lifecycle?.notificationSummary ?? booking.notificationSummary)!} />
        ) : null}
      </div>
      <p>
        <strong>{booking.customer.name}</strong> · {booking.customer.email}
      </p>
      <p>
        {booking.range?.startsAtUtc ?? "time unavailable"} {booking.range?.timeZoneId ?? ""}
      </p>
      <BookingMetaPanels booking={booking} notificationSummary={lifecycle?.notificationSummary ?? booking.notificationSummary} compact />
    </div>
  );
}
