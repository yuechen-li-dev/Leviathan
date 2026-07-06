// Provider bookings list (live backend mode). Extracted from views.tsx
// (M1). Structural move + relocate only - the refresh/select-detail/cancel
// orchestration stays plain useState for now. That orchestration currently
// shares one generic `busy` boolean across three distinct async operations,
// which is a real DeusMachina candidate, but it's deliberately deferred to
// milestone M2.5 rather than folded into this move.
//
// TODO(async-adoption): refresh/select-detail/cancel are exactly the shape
// machinalayout/async + useAsyncTask target (M2 adopted both) - would also
// close a real gap here: selecting booking A then quickly selecting
// booking B has no stale-completion protection today, so a slow response
// for A can land after B is already selected and show wrong detail data.
// Tracked as M2.5, not fixed here.
//
// BookingReschedulePanel now imports cleanly from ../confirmation (M2
// extracted it there). Until M2 landed, this had a deliberate temporary
// import from ../views instead, which created a real (if safe) circular
// import between this file and views.tsx - resolved now that both
// bookings/ and confirmation/ import BookingReschedulePanel from its own
// module rather than one importing it through the other.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  cancelBooking,
  getBookingAudit,
  getBookingLifecycle,
  getBookingNotifications,
  listProviderBookings,
} from "../api";
import { AdminModeBanner } from "../shared/AdminGateBanner";
import { controlledSchedulingError, isUnsafeAdminError, loadLiveContext, queryValue, saveLiveContext } from "../shared/liveContext";
import { StatusChip } from "../shared/StatusChip";
import { chipToneForValue, formatDateTimeRange, formatTimestamp, notificationSummaryLabel, paymentSummaryLabel, paymentToneValue, statusLabel } from "../shared/format";
import type { Booking, BookingAuditEvent, ScheduledNotification, SchedulingLifecycleSummary } from "../types";
import { BookingDebugPanel } from "./BookingDebugPanel";
import { BookingReschedulePanel } from "../confirmation/BookingReschedulePanel";

function LiveProviderBookingsView() {
  const liveContext = loadLiveContext();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [auditEvents, setAuditEvents] = useState<BookingAuditEvent[]>([]);
  const [lifecycle, setLifecycle] = useState<SchedulingLifecycleSummary>();
  const [notifications, setNotifications] = useState<ScheduledNotification[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const providerId = queryValue("providerId") ?? liveContext.providerId;
  const requestedBookingId = queryValue("bookingId") ?? liveContext.bookingId;

  useEffect(() => {
    if (!providerId) {
      setErrorMessage("No live provider is available yet. Create one from provider setup first.");
      return;
    }
    void refreshBookings(providerId, requestedBookingId);
  }, [providerId, requestedBookingId]);

  async function refreshBookings(currentProviderId: string, preferredBookingId?: string) {
    try {
      setBusy(true);
      setErrorMessage(undefined);
      const nextBookings = await listProviderBookings(currentProviderId);
      setBookings(nextBookings);
      const nextSelected = nextBookings.find((booking) => booking.id.value === preferredBookingId) ?? nextBookings.at(-1) ?? null;
      setSelectedBooking(nextSelected);
      if (nextSelected) {
        await loadBookingDetail(currentProviderId, nextSelected.id.value);
        saveLiveContext({ providerId: currentProviderId, bookingId: nextSelected.id.value });
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function loadBookingDetail(currentProviderId: string, currentBookingId: string) {
    const [audit, liveLifecycle, liveNotifications] = await Promise.all([
      getBookingAudit(currentBookingId, currentProviderId),
      getBookingLifecycle(currentBookingId),
      getBookingNotifications(currentBookingId),
    ]);
    setAuditEvents(audit);
    setLifecycle(liveLifecycle);
    setNotifications(liveNotifications);
  }

  async function cancelSelectedBooking() {
    if (!selectedBooking) return;
    try {
      setBusy(true);
      setErrorMessage(undefined);
      const result = await cancelBooking(selectedBooking.id.value);
      setSelectedBooking(result.booking);
      setLifecycle(result.lifecycle);
      await refreshBookings(providerId!, result.booking.id.value);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scheduling-stack" data-testid="provider-bookings-root">
      <section className="scheduling-subpanel" data-testid="provider-bookings-list">
        <div className="scheduling-section-head">
          <div>
            <h2>Provider bookings</h2>
            <p>Live admin surface for readable booking status, notification summary, and controlled cancellation.</p>
          </div>
          <div className="scheduling-chip-row">
            <button data-testid="bookings-refresh" disabled={busy || !providerId} onClick={() => void refreshBookings(providerId!, selectedBooking?.id.value)}>
              {busy ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
        <AdminModeBanner errorMessage={errorMessage} />
        {errorMessage && !isUnsafeAdminError(errorMessage) ? <p className="error" role="alert">{controlledSchedulingError(errorMessage)}</p> : null}

        <div className="scheduling-bookings-table-wrap">
          <div className="scheduling-stack scheduling-stack-tight">
            {bookings.map((booking) => {
              const isSelected = selectedBooking?.id.value === booking.id.value;
              return (
                <Card data-testid={`booking-row-${booking.id.value}`} key={booking.id.value}>
                  <CardHeader>
                    <div className="scheduling-section-head">
                      <div>
                        <CardTitle>{booking.customer.name}</CardTitle>
                        <CardDescription>{formatDateTimeRange(booking.range)}</CardDescription>
                      </div>
                      <div className="scheduling-chip-row">
                        <StatusChip tone={chipToneForValue(booking.status)} label={statusLabel(booking.status)} />
                        {paymentSummaryLabel(booking) ? <StatusChip tone={chipToneForValue(paymentToneValue(booking))} label={paymentSummaryLabel(booking)!} /> : <StatusChip tone="neutral" label="No payment required" />}
                        {notificationSummaryLabel(booking.notificationSummary) ? <StatusChip tone="info" label={notificationSummaryLabel(booking.notificationSummary)!} /> : null}
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
                    </dl>
                  </CardContent>
                  <CardFooter className="gap-3">
                    <Button
                      data-testid={`booking-select-${booking.id.value}`}
                      onClick={() => {
                        setSelectedBooking(booking);
                        if (providerId) void loadBookingDetail(providerId, booking.id.value);
                      }}
                      type="button"
                      variant={isSelected ? "default" : "secondary"}
                    >
                      Inspect
                    </Button>
                    {booking.status === "confirmed" ? (
                      <Button data-testid="booking-cancel" disabled={busy || !isSelected} onClick={() => void cancelSelectedBooking()} type="button" variant="destructive">
                        Cancel booking
                      </Button>
                    ) : null}
                    {booking.status !== "confirmed" ? <StatusChip tone="neutral" label="Confirmed-only actions disabled" /> : null}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {selectedBooking ? (
        <BookingReschedulePanel
          actor="local-dev-admin"
          booking={selectedBooking}
          onOriginalBookingUpdated={(updatedBooking) => {
            setSelectedBooking(updatedBooking);
            setBookings((current) => current.map((entry) => (entry.id.value === updatedBooking.id.value ? updatedBooking : entry)));
          }}
          onReplacementConfirmed={(nextBooking) => {
            if (providerId) void refreshBookings(providerId, nextBooking.id.value);
          }}
          providerSlug={liveContext.providerSlug}
        />
      ) : null}

      {selectedBooking ? <BookingDebugPanel booking={selectedBooking} auditEvents={auditEvents} lifecycle={lifecycle} /> : null}

      {selectedBooking ? (
        <section className="scheduling-subpanel" data-testid="booking-notifications">
          <h3>Notifications</h3>
          <p>Notification policy only — no real email/SMS provider connected.</p>
          {notifications.length ? (
            <ul className="scheduling-audit-list">
              {notifications.map((notification) => (
                <li key={notification.id.value}>
                  <strong>{notification.trigger}</strong> · {notification.status} · {notification.channel} · {formatTimestamp(notification.scheduledForUtc, selectedBooking.range?.timeZoneId ?? "UTC")}
                </li>
              ))}
            </ul>
          ) : (
            <p>No booking notifications were recorded for this booking.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
export { LiveProviderBookingsView };
