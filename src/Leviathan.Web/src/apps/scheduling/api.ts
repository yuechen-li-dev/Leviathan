import { api } from "../../machina/api";
import type {
  AvailabilityRule,
  BookableResource,
  BookableSlot,
  Booking,
  BookingAuditEvent,
  CancelBookingResponse,
  HoldResponse,
  LocalDevPlatformContext,
  Provider,
  ReplacementHoldResponse,
  ScheduledNotification,
  SchedulingLifecycleSummary,
  SchedulingNotificationPolicy,
  SchedulingPaymentPolicy,
  SchedulingService,
} from "./types";

export const schedulingEndpoints = {
  providers: "/apps/scheduling/providers",
  resources: "/apps/scheduling/resources",
  services: "/apps/scheduling/services",
  availabilityRules: "/apps/scheduling/availability-rules",
  holds: "/apps/scheduling/holds",
  confirm: "/apps/scheduling/bookings/confirm",
  bookings: (providerId: string) => `/apps/scheduling/bookings?providerId=${encodeURIComponent(providerId)}`,
  booking: (bookingId: string) => `/apps/scheduling/bookings/${encodeURIComponent(bookingId)}`,
  bookingAudit: (bookingId: string, providerId: string) => `/apps/scheduling/bookings/${encodeURIComponent(bookingId)}/audit?providerId=${encodeURIComponent(providerId)}`,
  bookingLifecycle: (bookingId: string) => `/apps/scheduling/bookings/${encodeURIComponent(bookingId)}/lifecycle`,
  holdLifecycle: (holdId: string, providerId: string) => `/apps/scheduling/holds/${encodeURIComponent(holdId)}/lifecycle?providerId=${encodeURIComponent(providerId)}`,
  bookingIcs: (bookingId: string) => `/apps/scheduling/bookings/${encodeURIComponent(bookingId)}/ics`,
  cancelBooking: (bookingId: string) => `/apps/scheduling/bookings/${encodeURIComponent(bookingId)}/cancel`,
  createReplacementHold: (bookingId: string) => `/apps/scheduling/bookings/${encodeURIComponent(bookingId)}/reschedule/holds`,
  bookingNotifications: (bookingId: string) => `/apps/scheduling/bookings/${encodeURIComponent(bookingId)}/notifications`,
  fakeSendNotification: (notificationId: string) => `/apps/scheduling/notifications/${encodeURIComponent(notificationId)}/fake-send`,
  assignResource: (serviceId: string) => `/apps/scheduling/services/${encodeURIComponent(serviceId)}/resources`,
  publicProvider: (slug: string) => `/apps/scheduling/public/${slug}`,
  publicServices: (slug: string) => `/apps/scheduling/public/${slug}/services`,
  publicSlots: (slug: string, serviceId: string, from: string, to: string, timeZone: string) => `/apps/scheduling/public/${slug}/slots?serviceId=${encodeURIComponent(serviceId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&timeZone=${encodeURIComponent(timeZone)}`,
  submitIntake: (holdId: string) => `/apps/scheduling/holds/${encodeURIComponent(holdId)}/intake`,
  fakeSatisfyPayment: (holdId: string) => `/apps/scheduling/holds/${encodeURIComponent(holdId)}/payment/fake-satisfy`,
};
export const getLocalDevContext = () => api<LocalDevPlatformContext>("/platform/local-dev/context");
export const createProvider = (body: { slug: string; displayName: string; timeZoneId: string; contactEmail?: string; publicDescription?: string }) => api<Provider>(schedulingEndpoints.providers, { method: "POST", body: JSON.stringify(body) });
export const createResource = (body: { providerId: string; displayName: string; resourceType: string; timeZoneId?: string }) => api<BookableResource>(schedulingEndpoints.resources, { method: "POST", body: JSON.stringify(body) });
export const createService = (body: {
  providerId: string;
  name: string;
  description?: string;
  durationMinutes: number;
  paymentPolicy?: SchedulingPaymentPolicy;
  notificationPolicy?: SchedulingNotificationPolicy;
}) => api<SchedulingService>(schedulingEndpoints.services, { method: "POST", body: JSON.stringify(body) });
export const assignResourceToService = (serviceId: string, providerId: string, resourceId: string) => api<SchedulingService>(schedulingEndpoints.assignResource(serviceId), { method: "POST", body: JSON.stringify({ providerId, resourceId }) });
export const createAvailabilityRule = (body: { providerId: string; resourceId: string; timeZoneId: string; daysOfWeek: string[]; localStartTime: string; localEndTime: string }) => api<AvailabilityRule>(schedulingEndpoints.availabilityRules, { method: "POST", body: JSON.stringify(body) });
export const listProviderBookings = (providerId: string) => api<Booking[]>(schedulingEndpoints.bookings(providerId));
export const getBooking = (bookingId: string) => api<Booking>(schedulingEndpoints.booking(bookingId));
export const getBookingAudit = (bookingId: string, providerId: string) => api<BookingAuditEvent[]>(schedulingEndpoints.bookingAudit(bookingId, providerId));
export const getBookingLifecycle = (bookingId: string) => api<SchedulingLifecycleSummary>(schedulingEndpoints.bookingLifecycle(bookingId));
export const getHoldLifecycle = (holdId: string, providerId: string) => api<SchedulingLifecycleSummary>(schedulingEndpoints.holdLifecycle(holdId, providerId));
export const getBookingNotifications = (bookingId: string) => api<ScheduledNotification[]>(schedulingEndpoints.bookingNotifications(bookingId));
export const cancelBooking = (bookingId: string, reason = "provider_cancelled", message?: string, actor = "local-dev-admin") => api<CancelBookingResponse>(schedulingEndpoints.cancelBooking(bookingId), { method: "POST", body: JSON.stringify({ reason, message, actor }) });
export const createReplacementHold = (
  bookingId: string,
  body: {
    serviceId: string;
    resourceId: string;
    startUtc: string;
    endUtc: string;
    timeZoneId: string;
    displayTimeZoneId?: string;
    reason?: string;
    message?: string;
    actor?: string;
  },
) =>
  api<ReplacementHoldResponse>(schedulingEndpoints.createReplacementHold(bookingId), {
    method: "POST",
    body: JSON.stringify({
      serviceId: body.serviceId,
      resourceId: body.resourceId,
      startUtc: body.startUtc,
      endUtc: body.endUtc,
      timeZoneId: body.timeZoneId,
      displayTimeZoneId: body.displayTimeZoneId,
      reason: body.reason ?? "customer_requested",
      message: body.message,
      actor: body.actor ?? "local-dev-admin",
    }),
  });
export const getPublicProvider = (slug: string) => api<Provider>(schedulingEndpoints.publicProvider(slug));
export const getPublicServices = (slug: string) => api<SchedulingService[]>(schedulingEndpoints.publicServices(slug));
export const listSlots = (slug: string, serviceId: string, from: string, to: string, timeZone = "UTC") => api<BookableSlot[]>(schedulingEndpoints.publicSlots(slug, serviceId, from, to, timeZone));
export const createHold = (slot: BookableSlot) => api<HoldResponse>(schedulingEndpoints.holds, { method: "POST", body: JSON.stringify({ providerId: slot.providerId, serviceId: slot.serviceId, resourceId: slot.resourceId, startsAtUtc: slot.startsAtUtc, endsAtUtc: slot.endsAtUtc, timeZoneId: slot.timeZoneId }) });
export const submitIntake = (holdId: string, claimToken: string, customer: { name: string; email: string; phone?: string; notes?: string }) =>
  api<HoldResponse>(schedulingEndpoints.submitIntake(holdId), { method: "POST", body: JSON.stringify({ claimToken, name: customer.name, email: customer.email, phone: customer.phone, notes: customer.notes }) });
export const confirmBooking = (holdId: string, claimToken: string, customer: { name: string; email: string; phone?: string; notes?: string }) => api<Booking>(schedulingEndpoints.confirm, { method: "POST", body: JSON.stringify({ holdId, claimToken, customer }) });
export const fakeSatisfyPayment = (holdId: string, claimToken: string, actor = "local-dev-admin") =>
  api<{ holdId: string; paymentRequirementStatus: string; paymentReference: string; paymentSatisfiedAt: string; auditEventId: string }>(schedulingEndpoints.fakeSatisfyPayment(holdId), { method: "POST", body: JSON.stringify({ claimToken, actor }) });
export const fakeSendNotification = (notificationId: string, actor = "local-dev-admin") =>
  api<{ notification: ScheduledNotification; auditEventId: string }>(schedulingEndpoints.fakeSendNotification(notificationId), { method: "POST", body: JSON.stringify({ actor }) });
