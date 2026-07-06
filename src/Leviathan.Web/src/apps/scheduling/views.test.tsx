import { describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cancelBooking, schedulingEndpoints } from "./api";
import { slotSelected } from "./dispatch";
import { resolveSchedulingFixtureScenario } from "./fixtures";
import { AdminModeBanner } from "./shared/AdminGateBanner";
import { StatusChip } from "./shared/StatusChip";
import { ProviderSetupView } from "./setup/ProviderSetupFlow";
import { SchedulingHomeView } from "./landing/SchedulingHomeView";
import { ProviderBookingsView } from "./bookings/ProviderBookingsView";
import { BookingDebugPanel } from "./bookings/BookingDebugPanel";
import { BookingReschedulePanel } from "./confirmation/BookingReschedulePanel";
import { ConfirmationView } from "./confirmation/ConfirmationView";
import { controlledSchedulingError } from "./shared/liveContext";
import { BookingCalendarRegionView } from "./publicBooking/BookingViews";
import { SchedulingBookingPageProvider } from "./publicBooking/BookingPageContext";

const slot = {
  providerId: "p",
  serviceId: "s",
  resourceId: "r",
  startsAtUtc: "2030-01-01T00:00:00Z",
  endsAtUtc: "2030-01-01T00:30:00Z",
  timeZoneId: "UTC",
  displayLabel: "Jan 1, 2030 03:00",
  providerTimeZoneId: "America/Los_Angeles",
  displayTimeZoneId: "America/New_York",
  displayStartsAtLocal: "2030-01-01 03:00 -05:00 (America/New_York)",
  displayEndsAtLocal: "2030-01-01 03:30 -05:00 (America/New_York)",
};

const confirmedBooking = {
  id: { value: "b" },
  status: "confirmed",
  customer: { name: "Ada", email: "a@example.test" },
  range: { startsAtUtc: "2030-01-01T00:00:00Z", endsAtUtc: "2030-01-01T00:30:00Z", timeZoneId: "America/New_York" },
  paymentStatus: "payment_satisfied_fake",
  paymentPolicyLabel: "Fake/local prepay satisfied for demo",
  notificationPolicyLabel: "Reminder + booking confirmed labels only",
  notificationSummary: { pending: 1, sentFake: 1, cancelled: 0, skipped: 0, failed: 0, deferredProviderUnavailable: 0 },
};

describe("scheduling frontend module", () => {
  it("declares expected API endpoints", () => {
    expect(schedulingEndpoints.holds).toBe("/apps/scheduling/holds");
    expect(schedulingEndpoints.publicSlots("demo", "svc", "a", "b", "UTC")).toContain("/apps/scheduling/public/demo/slots");
    expect(schedulingEndpoints.createReplacementHold("book_123")).toBe("/apps/scheduling/bookings/book_123/reschedule/holds");
  });

  it("scheduling API client calls cancel endpoint correctly", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ booking: confirmedBooking, auditEventId: "evt", lifecycle: { workflowState: "cancelled", status: "cancelled" } }),
    });
    vi.stubGlobal("window", { location: { protocol: "http:", hostname: "localhost", port: "5173" }, localStorage: { getItem: () => undefined } });
    vi.stubGlobal("fetch", fetchMock);
    await cancelBooking("b", "provider_cancelled", "weather", "local-dev-admin");
    expect(fetchMock.mock.calls[0][0]).toContain("/apps/scheduling/bookings/b/cancel");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(fetchMock.mock.calls[0][1].body).toContain("provider_cancelled");
    vi.unstubAllGlobals();
  });

  it("slot selection emits hold action intent", () => {
    expect(slotSelected(slot)).toEqual({ type: "scheduling.slot-selected", slot });
  });

  it("scheduling landing renders action cards and proof points", () => {
    const html = renderToStaticMarkup(createElement(SchedulingHomeView, { scenario: resolveSchedulingFixtureScenario({ pathname: "/apps/scheduling", search: "?fixture=landing" }) }));
    expect(html).toContain("Action cards");
    expect(html).toContain("Provider setup");
    expect(html).toContain("Public booking with a calm summary panel");
  });

  it("provider setup view renders local/dev warning and public link", () => {
    const html = renderToStaticMarkup(createElement(ProviderSetupView, { providerSlug: "demo", providerTimeZone: "America/Chicago" }));
    expect(html).toContain("Local/dev admin mode");
    expect(html).toContain("LEVIATHAN_ALLOW_UNSAFE_ADMIN=true");
    expect(html).toContain("/book/demo");
    expect(html).toContain("Set up bookable availability");
    expect(html).toContain("Setup checklist");
  });

  it("provider setup view renders local-dev ownership context without account entry", () => {
    const html = renderToStaticMarkup(
      createElement(ProviderSetupView, {
        providerSlug: "demo",
        localDevContext: {
          actorKind: "local-dev",
          userId: "user_local_dev",
          accountId: "acct_local_dev",
          unsafeLocalDev: true,
          requestId: "req",
          schedulingInstallation: {
            appInstallationId: { value: "inst_local_dev_scheduling" },
            accountId: { value: "acct_local_dev" },
            appId: "scheduling",
            status: "active-local-dev",
            persistenceScope: "scheduling",
          },
        },
      }),
    );
    expect(html).toContain("acct_local_dev");
    expect(html).toContain("inst_local_dev_scheduling");
    expect(html).toContain("do not enter account ids");
  });

  it("ownership errors render useful provider setup copy", () => {
    const html = renderToStaticMarkup(createElement(ProviderSetupView, { errorMessage: "provider_owner_forbidden" }));
    expect(html).toContain("This provider is not owned by the current local-dev Scheduling installation");
  });

  it("admin gate error displays useful message", () => {
    const html = renderToStaticMarkup(createElement(AdminModeBanner, { errorMessage: "unsafe_admin_disabled" }));
    expect(html).toContain("Admin gate blocked");
    expect(html).toContain("Restart the backend with LEVIATHAN_ALLOW_UNSAFE_ADMIN=true");
  });

  it("confirmation view includes booking id/timezone/ICS link when appropriate", () => {
    const html = renderToStaticMarkup(createElement(ConfirmationView, { booking: confirmedBooking, serviceName: "Consult", resourceName: "Ada" }));
    expect(html).toContain("Booking confirmed");
    expect(html).toContain("What happens next");
    expect(html).toContain("b");
    expect(html).toContain("America/New_York");
    expect(html).toContain("/apps/scheduling/bookings/b/ics");
  });

  it("status chips render expected labels", () => {
    const html = renderToStaticMarkup(createElement(StatusChip, { tone: "warning", label: "Payment required" }));
    expect(html).toContain("Payment required");
    expect(html).toContain("status-chip-warning");
  });

  it("confirmed booking detail renders payment and notification labels", () => {
    const html = renderToStaticMarkup(createElement(ProviderBookingsView, { bookings: [confirmedBooking] }));
    expect(html).toContain("Payment satisfied (local test)");
    expect(html).toContain("Notifications pending 1");
    expect(html).toContain("Cancel booking");
    expect(html).toContain("Inspect lifecycle");
  });

  it("cancelled booking status renders without ICS", () => {
    const html = renderToStaticMarkup(createElement(ProviderBookingsView, { bookings: [{ ...confirmedBooking, status: "cancelled" }] }));
    expect(html).toContain("Cancelled");
    expect(html).not.toContain("Cancel booking");
    expect(html).not.toContain("/ics");
  });

  it("reschedule panel shows safe replacement copy only for confirmed bookings", () => {
    const confirmedHtml = renderToStaticMarkup(
      createElement(BookingReschedulePanel, {
        booking: confirmedBooking,
        fixtureState: { stage: "available", oldBooking: confirmedBooking },
        providerSlug: "demo-provider",
      }),
    );
    const cancelledHtml = renderToStaticMarkup(
      createElement(BookingReschedulePanel, {
        booking: { ...confirmedBooking, status: "cancelled" },
        fixtureState: { stage: "available", oldBooking: { ...confirmedBooking, status: "cancelled" } },
        providerSlug: "demo-provider",
      }),
    );

    expect(confirmedHtml).toContain("Your current booking stays confirmed until the new time is confirmed.");
    expect(confirmedHtml).toContain("Reschedule");
    expect(cancelledHtml).toBe("");
    expect(cancelledHtml).not.toContain("Create replacement hold");
  });

  it("reschedule picker fixture renders replacement slot comparison", () => {
    const scenario = resolveSchedulingFixtureScenario({ pathname: "/book/demo-provider/confirmed/book_demo_confirmed", search: "?fixture=reschedule-picker" });
    const html = renderToStaticMarkup(
      createElement(BookingReschedulePanel, {
        booking: scenario.booking!,
        fixtureState: scenario.rescheduleState,
        providerSlug: scenario.providerSlug,
      }),
    );

    expect(html).toContain("Choose a replacement time");
    expect(html).toContain("Current time");
    expect(html).toContain("Selected replacement");
  });

  it("reschedule result fixture renders old and new booking relations", () => {
    const scenario = resolveSchedulingFixtureScenario({ pathname: "/book/demo-provider/confirmed/book_demo_rescheduled_old", search: "?fixture=reschedule-result" });
    const html = renderToStaticMarkup(
      createElement(BookingReschedulePanel, {
        booking: scenario.booking!,
        fixtureState: scenario.rescheduleState,
        providerSlug: scenario.providerSlug,
      }),
    );

    expect(html).toContain("Replacement confirmed");
    expect(html).toContain("Rescheduled to book_demo_rescheduled_new.");
    expect(html).toContain("Rescheduled from book_demo_rescheduled_old.");
  });

  it("audit/lifecycle panel renders mocked summaries", () => {
    const html = renderToStaticMarkup(
      createElement(BookingDebugPanel, {
        booking: { ...confirmedBooking, status: "cancelled", cancellationReasonCode: "provider_cancelled", cancellationPolicyResult: "accepted_confirmed_booking" },
        auditEvents: [{ eventId: "evt", eventType: "booking.cancelled", occurredAt: "2030-01-01T01:00:00Z", data: { decision: "accepted" } }],
        lifecycle: {
          workflowState: "cancelled",
          status: "cancelled",
          lastDecisionCode: "accepted_confirmed_booking",
          lastAuditEventId: "evt",
          checkpointExists: true,
          paymentStatus: "payment_required",
        },
      }),
    );
    expect(html).toContain("booking.cancelled");
    expect(html).toContain("Current state");
    expect(html).toContain("Last audit event id");
    expect(html).toContain("Cancellation reason");
    expect(html).toContain("provider_cancelled");
    expect(html).toContain("Payment required");
  });

  it("renders useful scheduling errors", () => {
    expect(controlledSchedulingError("payment_required")).toContain("Payment is required before confirmation");
  });

  it("provider setup fixture result card renders generated booking link and summary", () => {
    const scenario = resolveSchedulingFixtureScenario({ pathname: "/apps/scheduling/setup", search: "?fixture=provider-setup" });
    const html = renderToStaticMarkup(
      createElement(ProviderSetupView, {
        providerSlug: scenario.providerSlug,
        providerTimeZone: scenario.providerTimeZone,
        localDevContext: scenario.localDevContext,
        provider: scenario.setupProvider,
        resource: scenario.setupResource,
        service: scenario.setupService,
        availabilityRule: scenario.setupAvailabilityRule,
      }),
    );
    expect(html).toContain("Your public booking page is ready");
    expect(html).toContain("Open booking page");
    expect(html).toContain("Provider: prov_demo");
    expect(html).toContain("Availability rule: avail_demo_weekdays");
  });

  it("notification summary copy stays honest about provider connections", () => {
    const html = renderToStaticMarkup(createElement(ConfirmationView, { booking: confirmedBooking, serviceName: "Consult", resourceName: "Ada" }));
    expect(html).toContain("no real email/SMS provider connected");
  });

  it("calendar wrapper marks selected, available, and unavailable fixture dates accessibly", () => {
    const scenario = resolveSchedulingFixtureScenario({ pathname: "/book/demo-provider", search: "?fixture=public-booking" });
    const workingSessionScenario = {
      ...scenario,
      services: scenario.services?.filter((service) => service.durationMinutes === 45),
      slots: scenario.slots?.filter((slot) => slot.serviceId === "svc_intro_45"),
    };
    const html = renderToStaticMarkup(
      <SchedulingBookingPageProvider scenario={workingSessionScenario}>
        <BookingCalendarRegionView {...({} as any)} />
      </SchedulingBookingPageProvider>,
    );
    const dom = new JSDOM(html);
    const calendar = dom.window.document.querySelector("[data-slot='calendar']");
    expect(calendar).not.toBeNull();

    const day14 = Array.from(calendar!.querySelectorAll("button")).find((button) => button.textContent?.trim() === "14");
    const day15 = Array.from(calendar!.querySelectorAll("button")).find((button) => button.textContent?.trim() === "15");
    const day7 = Array.from(calendar!.querySelectorAll("button")).find((button) => button.textContent?.trim() === "7" && button.getAttribute("data-selected-single") === "true");

    expect(day14?.hasAttribute("disabled")).toBe(true);
    expect(day15?.hasAttribute("disabled")).toBe(false);
    expect(day7).toBeDefined();
  });
});
