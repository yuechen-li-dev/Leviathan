// Provider bookings list (live backend mode). Extracted from views.tsx
// (M1). M2.5: refresh/select-detail/cancel now each run through their own
// AsyncTaskController instead of one shared `busy` boolean. This closes
// the real gap flagged in M1/M2: selecting booking A then quickly
// selecting booking B now actually cancels A's in-flight detail fetch
// (AsyncTaskController's own "starting a new run cancels the previous"
// behavior), so a slow response for A can no longer land after B is
// already selected and show wrong detail data.
//
// BookingReschedulePanel imports cleanly from ../confirmation (M2
// extracted it there).

import { useEffect, useState } from "react";
import { matchKind } from "machinalayout/match";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminModeBanner } from "../shared/AdminGateBanner";
import { controlledSchedulingError, isUnsafeAdminError, loadLiveContext, queryValue, saveLiveContext } from "../shared/liveContext";
import { StatusChip } from "../shared/StatusChip";
import { chipToneForValue, formatDateTimeRange, formatTimestamp, notificationSummaryLabel, paymentSummaryLabel, paymentToneValue, statusLabel } from "../shared/format";
import type { Booking, BookingAuditEvent, ScheduledNotification, SchedulingLifecycleSummary } from "../types";
import { BookingDebugPanel } from "./BookingDebugPanel";
import { BookingReschedulePanel } from "../confirmation/BookingReschedulePanel";
import { useAsyncTask } from "../../../machina/useAsyncTask";
import { cancelBookingTask, listBookingsTask, loadBookingDetailTask } from "./bookingsListTasks";

function taskErrorMessage(error: unknown): string | undefined {
  if (error === undefined) return undefined;
  return error instanceof Error ? error.message : String(error);
}

function LiveProviderBookingsView() {
  const liveContext = loadLiveContext();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [auditEvents, setAuditEvents] = useState<BookingAuditEvent[]>([]);
  const [lifecycle, setLifecycle] = useState<SchedulingLifecycleSummary>();
  const [notifications, setNotifications] = useState<ScheduledNotification[]>([]);
  const [staticErrorMessage, setStaticErrorMessage] = useState<string>();
  const providerId = queryValue("providerId") ?? liveContext.providerId;
  const requestedBookingId = queryValue("bookingId") ?? liveContext.bookingId;

  const listTask = useAsyncTask(listBookingsTask);
  const detailTask = useAsyncTask(loadBookingDetailTask);
  const cancelTask = useAsyncTask(cancelBookingTask);

  const busy =
    listTask.snapshot.board.status === "running" ||
    detailTask.snapshot.board.status === "running" ||
    cancelTask.snapshot.board.status === "running";
  const errorMessage =
    staticErrorMessage ??
    taskErrorMessage(listTask.snapshot.board.error) ??
    taskErrorMessage(detailTask.snapshot.board.error) ??
    taskErrorMessage(cancelTask.snapshot.board.error);

  async function loadBookingDetail(currentProviderId: string, currentBookingId: string) {
    const result = await detailTask.run({ providerId: currentProviderId, bookingId: currentBookingId });
    matchKind(result, {
      ok: (r) => {
        setAuditEvents(r.value.auditEvents);
        setLifecycle(r.value.lifecycle);
        setNotifications(r.value.notifications);
      },
      err: () => {},
      cancelled: () => {},
      timeout: () => {},
    });
  }

  async function refreshBookings(currentProviderId: string, preferredBookingId?: string) {
    setStaticErrorMessage(undefined);
    const result = await listTask.run({ providerId: currentProviderId });
    await matchKind(result, {
      ok: async (r) => {
        setBookings(r.value);
        const nextSelected = r.value.find((booking) => booking.id.value === preferredBookingId) ?? r.value.at(-1) ?? null;
        setSelectedBooking(nextSelected);
        if (nextSelected) {
          await loadBookingDetail(currentProviderId, nextSelected.id.value);
          saveLiveContext({ providerId: currentProviderId, bookingId: nextSelected.id.value });
        }
      },
      err: async () => {},
      cancelled: async () => {},
      timeout: async () => {},
    });
  }

  useEffect(() => {
    if (!providerId) {
      setStaticErrorMessage("No live provider is available yet. Create one from provider setup first.");
      return;
    }
    void refreshBookings(providerId, requestedBookingId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, requestedBookingId]);

  async function cancelSelectedBooking() {
    if (!selectedBooking) return;
    const result = await cancelTask.run({ bookingId: selectedBooking.id.value });
    await matchKind(result, {
      ok: async (r) => {
        setSelectedBooking(r.value.booking);
        setLifecycle(r.value.lifecycle);
        await refreshBookings(providerId!, r.value.booking.id.value);
      },
      err: async () => {},
      cancelled: async () => {},
      timeout: async () => {},
    });
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
              {listTask.snapshot.board.status === "running" ? "Refreshing…" : "Refresh"}
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
