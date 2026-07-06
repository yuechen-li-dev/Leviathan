/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rescheduleTasks = vi.hoisted(() => ({
  listSlots: vi.fn(),
  createReplacementHold: vi.fn(),
  submitIntake: vi.fn(),
  fakeSatisfyPayment: vi.fn(),
  confirmBooking: vi.fn(),
  getBooking: vi.fn(),
}));

vi.mock("../api", () => rescheduleTasks);

import { BookingReschedulePanel } from "./BookingReschedulePanel";
import type { Booking } from "../types";

const booking: Booking = {
  id: { value: "b1" },
  serviceId: { value: "s1" },
  status: "confirmed",
  customer: { name: "Ada", email: "ada@example.test", phone: "", notes: "" },
  range: { startsAtUtc: "2030-01-01T00:00:00Z", endsAtUtc: "2030-01-01T00:30:00Z", timeZoneId: "UTC" },
} as Booking;

const slot = {
  providerId: "p1",
  serviceId: "s1",
  resourceId: "r1",
  startsAtUtc: "2030-03-14T15:00:00Z",
  endsAtUtc: "2030-03-14T15:30:00Z",
  timeZoneId: "UTC",
  displayLabel: "Mar 14",
  providerTimeZoneId: "UTC",
  displayTimeZoneId: "UTC",
  displayStartsAtLocal: "2030-03-14 15:00",
  displayEndsAtLocal: "2030-03-14 15:30",
};

const hold = {
  oldBookingId: "b1",
  replacementHoldId: "h1",
  claimToken: "tok",
  targetSlot: slot,
  lifecycle: { status: "active" },
};

describe("BookingReschedulePanel - live mode actuator wiring", () => {
  beforeEach(() => {
    rescheduleTasks.listSlots.mockResolvedValue([slot]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opening the picker auto-fetches slots and lets you pick one and create a hold", async () => {
    rescheduleTasks.createReplacementHold.mockResolvedValue(hold);
    render(<BookingReschedulePanel booking={booking} providerSlug="demo" serviceName="30 min" />);

    await act(async () => {
      screen.getByTestId("booking-reschedule-open").click();
    });

    await waitFor(() => expect(rescheduleTasks.listSlots).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getAllByTestId("booking-reschedule-slot-option").length).toBeGreaterThan(0));

    await act(async () => {
      screen.getAllByTestId("booking-reschedule-slot-option")[0].click();
    });

    await act(async () => {
      screen.getByTestId("booking-reschedule-create-hold").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(rescheduleTasks.createReplacementHold).toHaveBeenCalledTimes(1);
    // Both the "selected replacement" preview and the "hold created" detail
    // section use the same data-testid (true of the original component too,
    // preserved rather than "fixed") - once a hold exists both render at
    // once, so this checks all matches rather than assuming exactly one.
    await waitFor(() => {
      const sections = screen.getAllByTestId("booking-reschedule-replacement");
      expect(sections.some((el) => el.textContent?.includes("h1"))).toBe(true);
    });
  });

  it("a failed hold creation surfaces the error and re-enables the button, not stuck 'Creating…'", async () => {
    rescheduleTasks.createReplacementHold.mockRejectedValue(new Error("slot_conflict"));
    render(<BookingReschedulePanel booking={booking} providerSlug="demo" serviceName="30 min" />);

    await act(async () => {
      screen.getByTestId("booking-reschedule-open").click();
    });
    await waitFor(() => expect(screen.getAllByTestId("booking-reschedule-slot-option").length).toBeGreaterThan(0));
    await act(async () => {
      screen.getAllByTestId("booking-reschedule-slot-option")[0].click();
    });

    const createButton = screen.getByTestId("booking-reschedule-create-hold");
    await act(async () => {
      createButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(createButton).not.toBeDisabled();
    expect(createButton).toHaveTextContent("Create replacement hold");
    expect(screen.getByText(/slot_conflict|local demo state|not owned/i)).toBeTruthy();
  });

  it("walks hold -> intake -> confirm end to end, calling onReplacementConfirmed", async () => {
    rescheduleTasks.createReplacementHold.mockResolvedValue({ ...hold, lifecycle: { status: "active" } });
    rescheduleTasks.submitIntake.mockResolvedValue({ paymentRequirementStatus: "not_required" });
    rescheduleTasks.confirmBooking.mockResolvedValue({ ...booking, id: { value: "new-booking" }, status: "confirmed" });
    rescheduleTasks.getBooking.mockResolvedValue({ ...booking, status: "rescheduled" });

    const onReplacementConfirmed = vi.fn();
    render(
      <BookingReschedulePanel
        booking={booking}
        onReplacementConfirmed={onReplacementConfirmed}
        providerSlug="demo"
        serviceName="30 min"
      />,
    );

    await act(async () => {
      screen.getByTestId("booking-reschedule-open").click();
    });
    await waitFor(() => expect(screen.getAllByTestId("booking-reschedule-slot-option").length).toBeGreaterThan(0));
    await act(async () => {
      screen.getAllByTestId("booking-reschedule-slot-option")[0].click();
    });
    await act(async () => {
      screen.getByTestId("booking-reschedule-create-hold").click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId("booking-reschedule-submit-intake")).toBeInTheDocument());

    await act(async () => {
      screen.getByTestId("booking-reschedule-submit-intake").click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(rescheduleTasks.submitIntake).toHaveBeenCalledTimes(1);

    // Not payment-required (per the mocked intake response), so confirm is enabled directly.
    await act(async () => {
      screen.getByTestId("booking-reschedule-confirm").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(rescheduleTasks.confirmBooking).toHaveBeenCalledTimes(1);
    expect(rescheduleTasks.getBooking).toHaveBeenCalledWith("b1");
    expect(onReplacementConfirmed).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId("booking-reschedule-result")).toBeInTheDocument());
  });

  it("does not attempt any network calls before the picker is opened - not eligible bookings return null", () => {
    render(<BookingReschedulePanel booking={{ ...booking, status: "cancelled" } as Booking} providerSlug="demo" serviceName="30 min" />);
    expect(rescheduleTasks.listSlots).not.toHaveBeenCalled();
  });
});
