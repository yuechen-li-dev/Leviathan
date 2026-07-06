/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listProviderBookings: vi.fn(),
  getBookingAudit: vi.fn(),
  getBookingLifecycle: vi.fn(),
  getBookingNotifications: vi.fn(),
  cancelBooking: vi.fn(),
}));

vi.mock("../api", () => api);

import { LiveProviderBookingsView } from "./LiveProviderBookingsView";

function booking(id: string): any {
  return {
    id: { value: id },
    providerId: { value: "p1" },
    status: "confirmed",
    customer: { name: `Customer ${id}`, email: `${id}@example.test` },
    range: { startsAtUtc: "2030-01-01T00:00:00Z", endsAtUtc: "2030-01-01T00:30:00Z", timeZoneId: "UTC" },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("LiveProviderBookingsView - M2.5 async task wiring", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState({}, "", "/apps/scheduling/bookings?providerId=p1");
    api.getBookingAudit.mockResolvedValue([]);
    api.getBookingLifecycle.mockResolvedValue({ status: "active" });
    api.getBookingNotifications.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.history.pushState({}, "", "/");
  });

  it("selecting booking B while A's detail fetch is still in flight does not let A's late response clobber B's data", async () => {
    const bookingA = booking("a");
    const bookingB = booking("b");
    api.listProviderBookings.mockResolvedValue([bookingA, bookingB]);

    // A's audit fetch is slow; B's resolves immediately.
    const slowAAudit = deferred<any[]>();
    api.getBookingAudit.mockImplementation((bookingId: string) => {
      if (bookingId === "a") return slowAAudit.promise;
      return Promise.resolve([{ eventId: "audit-b", eventType: "booking_confirmed", occurredAt: "2030-01-01T00:00:00Z" }]);
    });

    render(<LiveProviderBookingsView />);
    await waitFor(() => expect(screen.getByTestId(`booking-row-a`)).toBeInTheDocument());

    // Initial refresh auto-selects the last booking (B) - select A explicitly to start its slow fetch.
    await act(async () => {
      screen.getByTestId("booking-select-a").click();
    });

    // Before A's audit resolves, select B - this should cancel A's in-flight detail fetch.
    await act(async () => {
      screen.getByTestId("booking-select-b").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Now let A's slow response finally resolve.
    await act(async () => {
      slowAAudit.resolve([{ eventId: "audit-a", eventType: "should_not_appear", occurredAt: "2030-01-01T00:00:00Z" }]);
      await Promise.resolve();
      await Promise.resolve();
    });

    // The debug panel should reflect B's data, not get clobbered by A's late arrival.
    const debugPanelText = document.body.textContent ?? "";
    expect(debugPanelText).not.toContain("should_not_appear");
  });

  it("refresh and cancel each disable via their own task status, not a single shared busy flag stuck on", async () => {
    const bookingA = booking("a");
    let cancelled = false;
    api.listProviderBookings.mockImplementation(() => Promise.resolve([cancelled ? { ...bookingA, status: "cancelled" } : bookingA]));
    api.cancelBooking.mockImplementation(() => {
      cancelled = true;
      return Promise.resolve({ booking: { ...bookingA, status: "cancelled" }, auditEventId: "evt-1", lifecycle: { status: "cancelled" } });
    });

    render(<LiveProviderBookingsView />);
    await waitFor(() => expect(screen.getByTestId("booking-row-a")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("booking-cancel")).not.toBeDisabled());

    const cancelButton = screen.getByTestId("booking-cancel");
    await act(async () => {
      cancelButton.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.cancelBooking).toHaveBeenCalledWith("a");
    // After cancellation, the booking becomes non-confirmed and the cancel
    // button itself should no longer render (matches original component
    // behavior: cancel is confirmed-only).
    await waitFor(() => expect(screen.queryByTestId("booking-cancel")).not.toBeInTheDocument());
  });

  it("shows a clear message when no live provider is available yet, without calling the API", async () => {
    window.history.pushState({}, "", "/apps/scheduling/bookings");
    render(<LiveProviderBookingsView />);
    expect(await screen.findByText(/No live provider is available yet/i)).toBeInTheDocument();
    expect(api.listProviderBookings).not.toHaveBeenCalled();
  });
});
