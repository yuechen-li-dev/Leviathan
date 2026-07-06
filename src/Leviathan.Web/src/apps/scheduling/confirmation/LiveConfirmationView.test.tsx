/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getBooking: vi.fn(),
  schedulingEndpoints: { bookingIcs: (id: string) => `/apps/scheduling/bookings/${id}/ics` },
}));
vi.mock("../api", () => api);

import { LiveConfirmationView } from "./LiveConfirmationView";

const booking: any = {
  id: { value: "b1" },
  providerId: { value: "p1" },
  status: "confirmed",
  customer: { name: "Ada", email: "ada@example.test" },
  range: { startsAtUtc: "2030-01-01T00:00:00Z", endsAtUtc: "2030-01-01T00:30:00Z", timeZoneId: "UTC" },
};

describe("LiveConfirmationView - M2.5 async task wiring", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.history.pushState({}, "", "/");
  });

  it("shows a clear message when the bookingId is missing, without calling the API", async () => {
    window.history.pushState({}, "", "/book/demo");
    render(<LiveConfirmationView />);
    expect(await screen.findByText(/Booking id is missing/i)).toBeInTheDocument();
    expect(api.getBooking).not.toHaveBeenCalled();
  });

  it("fetches and renders the booking from the route's bookingId", async () => {
    window.history.pushState({}, "", "/book/demo/confirmed/b1");
    api.getBooking.mockResolvedValue(booking);
    render(<LiveConfirmationView />);
    await waitFor(() => expect(screen.getByText(/Ada booked/)).toBeInTheDocument());
    expect(api.getBooking).toHaveBeenCalledWith("b1");
  });

  it("surfaces a fetch failure instead of hanging on 'Loading…' forever", async () => {
    window.history.pushState({}, "", "/book/demo/confirmed/b1");
    api.getBooking.mockRejectedValue(new Error("booking_not_found"));
    render(<LiveConfirmationView />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent).toMatch(/booking_not_found|local demo state|not owned/i);
  });
});
