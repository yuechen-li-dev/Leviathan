// Pure, presentation-agnostic formatting/derivation helpers for the scheduling app.
// Extracted verbatim from views.tsx (M0 foundation work) - zero behavior change,
// these were always self-contained, just trapped behind every other import in a
// 4,200-line file. No React, no DeusMachina, no live/fixture branching - just data in,
// data out. Kept as `function`, exported individually, so call sites can `import {
// slotKey, statusLabel } from "./shared/format"` without pulling in everything.

import type {
  BookableSlot,
  Booking,
  HoldResponse,
  NotificationSummary,
  SchedulingLifecycleSummary,
  SchedulingService,
} from "../types";

export function formatDateTimeRange(range?: Booking["range"]) {
  if (!range?.startsAtUtc || !range?.endsAtUtc) return "Time unavailable";

  const start = new Date(range.startsAtUtc);
  const end = new Date(range.endsAtUtc);
  const dayLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: range.timeZoneId || "UTC",
  }).format(start);
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: range.timeZoneId || "UTC",
  }).format(start);
  const endTimeLabel = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: range.timeZoneId || "UTC",
  }).format(end);

  return `${dayLabel} at ${timeLabel}–${endTimeLabel}`;
}

export function formatDurationMinutes(range?: Booking["range"]) {
  if (!range?.startsAtUtc || !range?.endsAtUtc) return "Duration unavailable";
  const durationMinutes = Math.max(0, Math.round((new Date(range.endsAtUtc).getTime() - new Date(range.startsAtUtc).getTime()) / 60000));
  return durationMinutes ? `${durationMinutes} minutes` : "Duration unavailable";
}

export function formatTimestamp(value?: string | null, timeZone = "UTC") {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

export function bookingPrimaryStatusHeading(booking: Booking) {
  return booking.status === "cancelled"
    ? "Booking cancelled"
    : booking.status === "rescheduled"
      ? "Booking rescheduled"
      : "Booking confirmed";
}

export function bookingPrimaryStatusBody(booking: Booking) {
  if (booking.status === "cancelled") {
    return "This booking is no longer active. Confirmed-only actions have been disabled.";
  }
  if (booking.status === "rescheduled") {
    return "This original booking was safely replaced after the new time was confirmed.";
  }
  return "Your time is reserved. The details below are the source of truth for what happens next.";
}

export function nextStepLinesForBooking(booking: Booking) {
  if (booking.status === "cancelled") {
    return [
      "The provider bookings screen reflects this cancellation.",
      "Any notification status shown here is policy-only unless a real provider is connected.",
      "Book another time if you still need the meeting.",
    ];
  }

  if (booking.status === "rescheduled") {
    return [
      booking.rescheduledToBookingId
        ? `This original booking now points to replacement booking ${booking.rescheduledToBookingId}.`
        : "This original booking has been safely replaced by a new confirmed booking.",
      "The old time no longer blocks its slot after the replacement is confirmed.",
      "Open the provider bookings surface if you need audit or lifecycle detail.",
    ];
  }

  const payment = paymentSummaryLabel(booking);
  return [
    payment === "Payment satisfied (local test)"
      ? "Payment is marked satisfied for local testing only. No real payment provider is connected."
      : payment === "No payment required"
        ? "No payment step is required for this booking."
        : "Review the payment status below before sharing this confirmation.",
    "Notifications are policy-only unless a real email or SMS provider is connected.",
    "Use the provider bookings screen to inspect lifecycle details or cancel if needed.",
  ];
}

export function bookingActionLabels(booking: Booking) {
  return {
    allowCancel: booking.status === "confirmed",
    allowIcs: booking.status === "confirmed",
    allowBookAnother: true,
  };
}

export function isBookingReschedulable(booking: Booking) {
  return booking.status === "confirmed";
}

export function hasRescheduleRelation(booking: Booking) {
  return Boolean(booking.rescheduledToBookingId || booking.rescheduledFromBookingId || booking.replacementHoldId);
}

export function bookingRescheduleStateCopy(booking: Booking) {
  if (booking.status === "rescheduled") {
    return booking.rescheduledToBookingId
      ? `This original booking was rescheduled to ${booking.rescheduledToBookingId}.`
      : "This original booking was already rescheduled.";
  }
  if (booking.status === "cancelled") {
    return "Cancelled bookings cannot start a replacement flow.";
  }
  return "Only confirmed bookings can start the safe replacement flow.";
}

export function slotMatchesBooking(slot: BookableSlot, booking: Booking) {
  return (
    slot.resourceId === booking.resourceId?.value &&
    slot.startsAtUtc === booking.range?.startsAtUtc &&
    slot.endsAtUtc === booking.range?.endsAtUtc
  );
}

export function formatSlotSummary(slot?: BookableSlot) {
  if (!slot) return "No target slot selected";
  return `${slot.displayStartsAtLocal} to ${slot.displayEndsAtLocal}`;
}

export function lifecycleStateLabel(summary?: SchedulingLifecycleSummary | null) {
  return summary?.currentWorkflowState ?? summary?.workflowState ?? "unknown";
}

export function hasLifecycleCheckpoint(summary?: SchedulingLifecycleSummary | null) {
  return summary?.hasCheckpoint ?? summary?.checkpointExists ?? false;
}

export function slotKey(slot: BookableSlot) {
  return `${slot.resourceId}:${slot.serviceId}:${slot.startsAtUtc}`;
}

export function dateKeyForSlot(slot: BookableSlot) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: slot.displayTimeZoneId || slot.timeZoneId || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(slot.startsAtUtc));
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function buildAvailableDates(slots: BookableSlot[]) {
  return Array.from(
    new Map(
      slots.map((slot) => {
        const dateKey = dateKeyForSlot(slot);
        return [
          dateKey,
          {
            dateKey,
            year: Number.parseInt(dateKey.slice(0, 4), 10),
            month: Number.parseInt(dateKey.slice(5, 7), 10),
            day: Number.parseInt(dateKey.slice(8, 10), 10),
          },
        ] as const;
      }),
    ).values(),
  ).sort((left, right) => left.dateKey.localeCompare(right.dateKey));
}

export function buildMonthOptions(dates: Array<{ dateKey: string; year: number; month: number; day: number }>) {
  return Array.from(
    new Map(
      dates.map((entry) => [
        entry.dateKey.slice(0, 7),
        {
          monthKey: entry.dateKey.slice(0, 7),
          year: entry.year,
          month: entry.month,
        },
      ]),
    ).values(),
  ).sort((left, right) => left.monthKey.localeCompare(right.monthKey));
}

export function dateFromDateKey(dateKey: string) {
  const year = Number.parseInt(dateKey.slice(0, 4), 10);
  const month = Number.parseInt(dateKey.slice(5, 7), 10);
  const day = Number.parseInt(dateKey.slice(8, 10), 10);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function dateKeyForDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function monthDateFromMonthKey(monthKey?: string) {
  if (!monthKey) return undefined;
  const year = Number.parseInt(monthKey.slice(0, 4), 10);
  const month = Number.parseInt(monthKey.slice(5, 7), 10);
  return new Date(Date.UTC(year, month - 1, 1, 12));
}

export function monthKeyForDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function timeLabelForSlot(slot: BookableSlot) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: slot.displayTimeZoneId || slot.timeZoneId || "UTC",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(slot.startsAtUtc));
}

export function longDateLabelForDateKey(dateKey: string) {
  const year = Number.parseInt(dateKey.slice(0, 4), 10);
  const month = Number.parseInt(dateKey.slice(5, 7), 10);
  const day = Number.parseInt(dateKey.slice(8, 10), 10);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function longDateLabelForSlot(slot: BookableSlot) {
  return `${longDateLabelForDateKey(dateKeyForSlot(slot))} at ${timeLabelForSlot(slot)}`;
}

export function servicePriceLabel(service?: SchedulingService, hold?: HoldResponse | null) {
  const paymentMode = hold?.paymentRequirementStatus ?? service?.paymentPolicy?.paymentProviderMode;
  if (hold?.paymentRequirementStatus === "payment_required") return "Controlled fake/local payment";
  if (service?.paymentPolicy?.requiresPrepay || service?.paymentPolicy?.requiresDeposit) return "Controlled fake/local prepay";
  if (paymentMode === "fake/local") return "Controlled fake/local payment";
  return "Free";
}

export function initialsOf(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function browserTimeZone() {
  return typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" : "UTC";
}

export function chipToneForValue(value: string): "confirmed" | "warning" | "danger" | "info" | "neutral" {
  if (value === "confirmed" || value === "payment_satisfied_fake" || value === "sent_fake") return "confirmed";
  if (value === "cancelled") return "danger";
  if (value === "payment_required" || value === "pending_confirmation" || value === "required") return "warning";
  if (value === "satisfied") return "confirmed";
  if (value === "rescheduled") return "info";
  return "neutral";
}

export function statusLabel(status: string) {
  return status === "confirmed"
    ? "Confirmed"
    : status === "cancelled"
      ? "Cancelled"
      : status === "rescheduled"
        ? "Rescheduled"
        : status === "pending_confirmation"
          ? "Pending confirmation"
          : status;
}

export function paymentStatusLabel(status: string) {
  return status === "payment_required"
    ? "Payment required"
    : status === "payment_satisfied_fake"
      ? "Payment satisfied (local test)"
      : status === "required"
        ? "Payment required"
        : status === "satisfied"
          ? "Payment satisfied (local test)"
        : status === "not_required"
          ? "No payment required"
          : status;
}

export function paymentRequirementLabel(status?: string) {
  return status ? paymentStatusLabel(status) : "No payment requirement recorded";
}

export function paymentToneValue(booking: Booking) {
  return booking.paymentStatus ?? booking.paymentRequirementStatus ?? "not_required";
}

export function paymentSummaryLabel(booking: Booking) {
  const value = booking.paymentStatus ?? booking.paymentRequirementStatus;
  return value ? paymentStatusLabel(value) : null;
}

export function notificationSummaryLabel(summary?: NotificationSummary) {
  if (!summary) return null;
  const parts = [
    summary.pending > 0 ? `pending ${summary.pending}` : null,
    summary.sentFake > 0 ? `sent fake ${summary.sentFake}` : null,
    summary.cancelled > 0 ? `cancelled ${summary.cancelled}` : null,
  ].filter(Boolean);
  return parts.length ? `Notifications ${parts.join(" · ")}` : "Notification summary";
}

export function isPaymentRequiredError(message?: string) {
  return !!message && message.includes("payment_required");
}

