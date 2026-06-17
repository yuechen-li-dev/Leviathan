import { api } from "../../machina/api";
import type { BookableSlot, Booking, HoldResponse } from "./types";

export const schedulingEndpoints = {
  providers: "/apps/scheduling/providers",
  resources: "/apps/scheduling/resources",
  services: "/apps/scheduling/services",
  availabilityRules: "/apps/scheduling/availability-rules",
  holds: "/apps/scheduling/holds",
  confirm: "/apps/scheduling/bookings/confirm",
  publicProvider: (slug: string) => `/apps/scheduling/public/${slug}`,
  publicServices: (slug: string) => `/apps/scheduling/public/${slug}/services`,
  publicSlots: (slug: string, serviceId: string, from: string, to: string, timeZone: string) => `/apps/scheduling/public/${slug}/slots?serviceId=${encodeURIComponent(serviceId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&timeZone=${encodeURIComponent(timeZone)}`,
};
export const listSlots = (slug: string, serviceId: string, from: string, to: string, timeZone = "UTC") => api<BookableSlot[]>(schedulingEndpoints.publicSlots(slug, serviceId, from, to, timeZone));
export const createHold = (slot: BookableSlot) => api<HoldResponse>(schedulingEndpoints.holds, { method: "POST", body: JSON.stringify({ providerId: slot.providerId, serviceId: slot.serviceId, resourceId: slot.resourceId, startsAtUtc: slot.startsAtUtc, endsAtUtc: slot.endsAtUtc, timeZoneId: slot.timeZoneId }) });
export const confirmBooking = (holdId: string, claimToken: string, customer: { name: string; email: string; phone?: string; notes?: string }) => api<Booking>(schedulingEndpoints.confirm, { method: "POST", body: JSON.stringify({ holdId, claimToken, customer }) });
