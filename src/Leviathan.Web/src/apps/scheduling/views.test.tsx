import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cancelBooking, schedulingEndpoints } from "./api";
import { slotSelected } from "./dispatch";
import { resolveSchedulingFixtureScenario } from "./fixtures";
import {
  AdminModeBanner,
  BookingDebugPanel,
  ConfirmationView,
  ProviderBookingsView,
  ProviderSetupView,
  SchedulingHomeView,
  SlotPickerView,
  StatusChip,
} from "./views";

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
    expect(html).toContain("not owned by the current local-dev Scheduling installation");
  });

  it("admin gate error displays useful message", () => {
    const html = renderToStaticMarkup(createElement(AdminModeBanner, { errorMessage: "unsafe_admin_disabled" }));
    expect(html).toContain("Admin gate blocked");
    expect(html).toContain("Restart the backend with LEVIATHAN_ALLOW_UNSAFE_ADMIN=true");
  });

  it("public slot display includes timezone and service cards", () => {
    const html = renderToStaticMarkup(
      createElement(SlotPickerView as any, {
        slots: [slot],
        services: [{ id: { value: "svc" }, providerId: { value: "p" }, name: "Consult", durationMinutes: 30, assignedResourceIds: [], isPublic: true }],
        nodeData: { dispatch: vi.fn() },
      }),
    );
    expect(html).toContain("provider timezone America/Los_Angeles");
    expect(html).toContain("shown in America/New_York");
    expect(html).toContain("Consult");
  });

  it("confirmation view includes booking id/timezone/ICS link when appropriate", () => {
    const html = renderToStaticMarkup(createElement(ConfirmationView, { booking: confirmedBooking, serviceName: "Consult", resourceName: "Ada" }));
    expect(html).toContain("Booking confirmed");
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
    expect(html).toContain("Payment satisfied (fake/local)");
    expect(html).toContain("notifications pending 1");
    expect(html).toContain("Cancel booking");
  });

  it("cancelled booking status renders without ICS", () => {
    const html = renderToStaticMarkup(createElement(ProviderBookingsView, { bookings: [{ ...confirmedBooking, status: "cancelled" }] }));
    expect(html).toContain("Cancelled");
    expect(html).not.toContain("Cancel booking");
    expect(html).not.toContain("/ics");
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
    expect(html).toContain("Lifecycle state: cancelled");
    expect(html).toContain("Last audit event id: evt");
    expect(html).toContain("Cancellation reason: provider_cancelled");
    expect(html).toContain("Payment required");
  });

  it("renders useful scheduling errors", () => {
    const html = renderToStaticMarkup(createElement(SlotPickerView as any, { errorMessage: "payment_required" }));
    expect(html).toContain("Payment is required before confirmation");
  });
});
