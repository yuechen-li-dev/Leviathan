/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getPublicProvider: vi.fn(),
  getPublicServices: vi.fn(),
  listSlots: vi.fn(),
  createHold: vi.fn(),
  submitIntake: vi.fn(),
  fakeSatisfyPayment: vi.fn(),
  confirmBooking: vi.fn(),
}));

vi.mock("../api", () => api);

import { SchedulingBookingPageProvider } from "./BookingPageContext";
import { BookingFooterSummaryView, BookingMainHeaderView, BookingSlotsRegionView } from "./BookingViews";

const provider = { id: { value: "p1" }, slug: "demo", displayName: "Emma Brown", timeZoneId: "UTC", publicDescription: "" };
const service = { id: { value: "s1" }, name: "30 min", durationMinutes: 30 };
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
  displayStartsAtLocal: "3:00 PM",
  displayEndsAtLocal: "3:30 PM",
};
const hold = { holdId: "h1", claimToken: "tok", expiresAt: "2030-03-14T15:30:00Z", status: "held", paymentRequirementStatus: "not_required" };

function renderPage() {
  return render(
    <SchedulingBookingPageProvider>
      <BookingMainHeaderView {...({} as any)} />
      <BookingSlotsRegionView {...({} as any)} />
      <BookingFooterSummaryView {...({} as any)} />
    </SchedulingBookingPageProvider>,
  );
}

describe("public booking flow - M3 real DeusMachina + async port", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState({}, "", "/book/demo");
    api.getPublicProvider.mockResolvedValue(provider);
    api.getPublicServices.mockResolvedValue([service]);
    api.listSlots.mockResolvedValue([slot]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.history.pushState({}, "", "/");
  });

  it("walks hold -> intake -> confirm end to end and navigates to the confirmation route", async () => {
    api.createHold.mockResolvedValue(hold);
    api.submitIntake.mockResolvedValue({ ...hold, paymentRequirementStatus: "not_required" });
    api.confirmBooking.mockResolvedValue({ id: { value: "b1" }, status: "confirmed", customer: { name: "Ada", email: "a@test" }, range: { startsAtUtc: "x", endsAtUtc: "y", timeZoneId: "UTC" } });

    const assignMock = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", { value: { ...originalLocation, assign: assignMock }, writable: true });

    renderPage();

    await waitFor(() => expect(screen.getAllByTestId("public-slot-option").length).toBeGreaterThan(0));
    await act(async () => {
      screen.getAllByTestId("public-slot-option")[0].click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(api.createHold).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId("public-hold-state")).toHaveTextContent("h1"));

    await act(async () => {
      screen.getByTestId("public-submit-intake").click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(api.submitIntake).toHaveBeenCalledTimes(1);

    await act(async () => {
      screen.getByTestId("public-confirm-booking").click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(api.confirmBooking).toHaveBeenCalledTimes(1);
    expect(assignMock).toHaveBeenCalledWith(expect.stringContaining("/book/demo/confirmed/b1"));

    Object.defineProperty(window, "location", { value: originalLocation, writable: true });
  });

  it("a failed hold creation surfaces the error and re-enables slot selection", async () => {
    api.createHold.mockRejectedValue(new Error("slot_conflict"));
    renderPage();

    await waitFor(() => expect(screen.getAllByTestId("public-slot-option").length).toBeGreaterThan(0));
    await act(async () => {
      screen.getAllByTestId("public-slot-option")[0].click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/slot_conflict|local demo state|not owned/i)).toBeTruthy();
    // Still browsing, not stuck - slot options remain clickable.
    expect(screen.getAllByTestId("public-slot-option").length).toBeGreaterThan(0);
  });

  it("selecting a different service while a hold exists clears the hold (live mode only)", async () => {
    api.createHold.mockResolvedValue(hold);
    const secondService = { id: { value: "s2" }, name: "60 min", durationMinutes: 60 };
    api.getPublicServices.mockResolvedValue([service, secondService]);

    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("public-slot-option").length).toBeGreaterThan(0));
    await act(async () => {
      screen.getAllByTestId("public-slot-option")[0].click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId("public-hold-state")).toHaveTextContent("h1"));

    await act(async () => {
      screen.getByRole("tab", { name: "60m" }).click();
    });

    expect(screen.getByTestId("public-hold-state")).toHaveTextContent("none");
  });
});
