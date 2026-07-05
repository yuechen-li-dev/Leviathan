import { describe, expect, it } from "vitest";
import {
  bookingRescheduleStateCopy,
  buildAvailableDates,
  buildMonthOptions,
  chipToneForValue,
  dateFromDateKey,
  dateKeyForDate,
  dateKeyForSlot,
  formatDateTimeRange,
  formatDurationMinutes,
  hasRescheduleRelation,
  initialsOf,
  isPaymentRequiredError,
  monthDateFromMonthKey,
  monthKeyForDate,
  paymentStatusLabel,
  slotKey,
  statusLabel,
} from "./format";
import type { Booking, BookableSlot } from "../types";

const slot: BookableSlot = {
  providerId: "p",
  serviceId: "s",
  resourceId: "r",
  startsAtUtc: "2030-03-14T15:00:00Z",
  endsAtUtc: "2030-03-14T15:30:00Z",
  timeZoneId: "UTC",
  displayLabel: "Mar 14",
  providerTimeZoneId: "UTC",
  displayTimeZoneId: "America/New_York",
  displayStartsAtLocal: "2030-03-14 11:00 -04:00",
  displayEndsAtLocal: "2030-03-14 11:30 -04:00",
};

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: { value: "b1" },
    status: "confirmed",
    customer: { name: "Ada", email: "a@example.test" },
    range: { startsAtUtc: "2030-01-01T00:00:00Z", endsAtUtc: "2030-01-01T00:30:00Z", timeZoneId: "UTC" },
    ...overrides,
  } as Booking;
}

describe("shared/format - date/slot keys", () => {
  it("slotKey is stable and distinguishes resource/service/time", () => {
    expect(slotKey(slot)).toBe("r:s:2030-03-14T15:00:00Z");
    expect(slotKey({ ...slot, resourceId: "other" })).not.toBe(slotKey(slot));
  });

  it("dateKeyForSlot uses the slot's display time zone, not UTC", () => {
    // 15:00 UTC is 11:00 in America/New_York on the same calendar day here,
    // so this doesn't cross midnight - a real DST-boundary case would.
    expect(dateKeyForSlot(slot)).toBe("2030-03-14");
  });

  it("dateFromDateKey / dateKeyForDate round-trip", () => {
    const date = dateFromDateKey("2030-03-14");
    expect(dateKeyForDate(date)).toBe("2030-03-14");
  });

  it("monthDateFromMonthKey / monthKeyForDate round-trip", () => {
    const date = monthDateFromMonthKey("2030-03");
    expect(date).toBeDefined();
    expect(monthKeyForDate(date!)).toBe("2030-03");
  });

  it("monthDateFromMonthKey is undefined for an undefined key", () => {
    expect(monthDateFromMonthKey(undefined)).toBeUndefined();
  });

  it("buildAvailableDates dedupes same-day slots and sorts ascending", () => {
    const dates = buildAvailableDates([
      { ...slot, startsAtUtc: "2030-03-15T15:00:00Z", endsAtUtc: "2030-03-15T15:30:00Z" },
      { ...slot, startsAtUtc: "2030-03-14T15:00:00Z", endsAtUtc: "2030-03-14T15:30:00Z" },
      { ...slot, startsAtUtc: "2030-03-14T20:00:00Z", endsAtUtc: "2030-03-14T20:30:00Z" },
    ]);
    expect(dates.map((d) => d.dateKey)).toEqual(["2030-03-14", "2030-03-15"]);
  });

  it("buildMonthOptions collapses dates into distinct months, sorted", () => {
    const months = buildMonthOptions(buildAvailableDates([
      { ...slot, startsAtUtc: "2030-04-01T15:00:00Z", endsAtUtc: "2030-04-01T15:30:00Z" },
      { ...slot, startsAtUtc: "2030-03-14T15:00:00Z", endsAtUtc: "2030-03-14T15:30:00Z" },
    ]));
    expect(months.map((m) => m.monthKey)).toEqual(["2030-03", "2030-04"]);
  });
});

describe("shared/format - booking status copy", () => {
  it("formatDateTimeRange handles a missing range without throwing", () => {
    expect(formatDateTimeRange(undefined)).toBe("Time unavailable");
  });

  it("formatDateTimeRange renders a real range", () => {
    expect(formatDateTimeRange({ startsAtUtc: "2030-01-01T00:00:00Z", endsAtUtc: "2030-01-01T00:30:00Z", timeZoneId: "UTC" }))
      .toContain("2030");
  });

  it("formatDurationMinutes computes whole minutes", () => {
    expect(formatDurationMinutes({ startsAtUtc: "2030-01-01T00:00:00Z", endsAtUtc: "2030-01-01T00:45:00Z", timeZoneId: "UTC" }))
      .toBe("45 minutes");
  });

  it("formatDurationMinutes handles a missing range", () => {
    expect(formatDurationMinutes(undefined)).toBe("Duration unavailable");
  });

  it("statusLabel covers every known status and falls through unknowns unchanged", () => {
    expect(statusLabel("confirmed")).toBe("Confirmed");
    expect(statusLabel("cancelled")).toBe("Cancelled");
    expect(statusLabel("rescheduled")).toBe("Rescheduled");
    expect(statusLabel("pending_confirmation")).toBe("Pending confirmation");
    expect(statusLabel("no_show")).toBe("no_show");
  });

  it("paymentStatusLabel covers every known status", () => {
    expect(paymentStatusLabel("payment_required")).toBe("Payment required");
    expect(paymentStatusLabel("payment_satisfied_fake")).toBe("Payment satisfied (local test)");
    expect(paymentStatusLabel("not_required")).toBe("No payment required");
  });

  it("chipToneForValue maps known values and defaults to neutral", () => {
    expect(chipToneForValue("confirmed")).toBe("confirmed");
    expect(chipToneForValue("cancelled")).toBe("danger");
    expect(chipToneForValue("payment_required")).toBe("warning");
    expect(chipToneForValue("rescheduled")).toBe("info");
    expect(chipToneForValue("literally-anything-else")).toBe("neutral");
  });

  it("hasRescheduleRelation is true if any relation field is set", () => {
    expect(hasRescheduleRelation(booking())).toBe(false);
    expect(hasRescheduleRelation(booking({ rescheduledToBookingId: "b2" }))).toBe(true);
    expect(hasRescheduleRelation(booking({ replacementHoldId: "h1" }))).toBe(true);
  });

  it("bookingRescheduleStateCopy differentiates rescheduled/cancelled/confirmed", () => {
    expect(bookingRescheduleStateCopy(booking({ status: "cancelled" }))).toContain("cannot start");
    expect(bookingRescheduleStateCopy(booking({ status: "rescheduled", rescheduledToBookingId: "b2" }))).toContain("b2");
    expect(bookingRescheduleStateCopy(booking({ status: "confirmed" }))).toContain("Only confirmed");
  });

  it("isPaymentRequiredError detects the specific server error code", () => {
    expect(isPaymentRequiredError("payment_required")).toBe(true);
    expect(isPaymentRequiredError("slot_conflict")).toBe(false);
    expect(isPaymentRequiredError(undefined)).toBe(false);
  });
});

describe("shared/format - misc", () => {
  it("initialsOf takes the first letter of up to two words", () => {
    expect(initialsOf("Ada Lovelace")).toBe("AL");
    expect(initialsOf("Cher")).toBe("C");
    expect(initialsOf("")).toBe("");
  });
});
