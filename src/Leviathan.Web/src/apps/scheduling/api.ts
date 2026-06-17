import { api } from "../../machina/api";
import type { AvailabilityRule, BookableResource, BookableSlot, Booking, BookingAuditEvent, CancelBookingResponse, HoldResponse, Provider, SchedulingLifecycleSummary, SchedulingService, LocalDevPlatformContext } from "./types";

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
  bookingIcs: (bookingId: string) => `/apps/scheduling/bookings/${encodeURIComponent(bookingId)}/ics`,
  cancelBooking: (bookingId: string) => `/apps/scheduling/bookings/${encodeURIComponent(bookingId)}/cancel`,
  assignResource: (serviceId: string) => `/apps/scheduling/services/${encodeURIComponent(serviceId)}/resources`,
  publicProvider: (slug: string) => `/apps/scheduling/public/${slug}`,
  publicServices: (slug: string) => `/apps/scheduling/public/${slug}/services`,
  publicSlots: (slug: string, serviceId: string, from: string, to: string, timeZone: string) => `/apps/scheduling/public/${slug}/slots?serviceId=${encodeURIComponent(serviceId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&timeZone=${encodeURIComponent(timeZone)}`,
};
export const getLocalDevContext = () => api<LocalDevPlatformContext>("/platform/local-dev/context");
export const createProvider = (body: { slug: string; displayName: string; timeZoneId: string; contactEmail?: string; publicDescription?: string }) => api<Provider>(schedulingEndpoints.providers, { method: "POST", body: JSON.stringify(body) });
export const createResource = (body: { providerId: string; displayName: string; resourceType: string; timeZoneId?: string }) => api<BookableResource>(schedulingEndpoints.resources, { method: "POST", body: JSON.stringify(body) });
export const createService = (body: { providerId: string; name: string; description?: string; durationMinutes: number }) => api<SchedulingService>(schedulingEndpoints.services, { method: "POST", body: JSON.stringify(body) });
export const assignResourceToService = (serviceId: string, providerId: string, resourceId: string) => api<SchedulingService>(schedulingEndpoints.assignResource(serviceId), { method: "POST", body: JSON.stringify({ providerId, resourceId }) });
export const createAvailabilityRule = (body: { providerId: string; resourceId: string; timeZoneId: string; daysOfWeek: string[]; localStartTime: string; localEndTime: string }) => api<AvailabilityRule>(schedulingEndpoints.availabilityRules, { method: "POST", body: JSON.stringify(body) });
export const listProviderBookings = (providerId: string) => api<Booking[]>(schedulingEndpoints.bookings(providerId));
export const getBookingAudit = (bookingId: string, providerId: string) => api<BookingAuditEvent[]>(schedulingEndpoints.bookingAudit(bookingId, providerId));
export const getBookingLifecycle = (bookingId: string) => api<SchedulingLifecycleSummary>(schedulingEndpoints.bookingLifecycle(bookingId));
export const cancelBooking = (bookingId: string, reason = "provider_cancelled", message?: string, actor = "local-dev-admin") => api<CancelBookingResponse>(schedulingEndpoints.cancelBooking(bookingId), { method: "POST", body: JSON.stringify({ reason, message, actor }) });
export const listSlots = (slug: string, serviceId: string, from: string, to: string, timeZone = "UTC") => api<BookableSlot[]>(schedulingEndpoints.publicSlots(slug, serviceId, from, to, timeZone));
export const createHold = (slot: BookableSlot) => api<HoldResponse>(schedulingEndpoints.holds, { method: "POST", body: JSON.stringify({ providerId: slot.providerId, serviceId: slot.serviceId, resourceId: slot.resourceId, startsAtUtc: slot.startsAtUtc, endsAtUtc: slot.endsAtUtc, timeZoneId: slot.timeZoneId }) });
export const confirmBooking = (holdId: string, claimToken: string, customer: { name: string; email: string; phone?: string; notes?: string }) => api<Booking>(schedulingEndpoints.confirm, { method: "POST", body: JSON.stringify({ holdId, claimToken, customer }) });
