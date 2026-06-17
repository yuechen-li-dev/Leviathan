import type { MachinaSlotProps } from "machinalayout/react";
import type { BookableSlot, Booking, BookingAuditEvent, SchedulingLifecycleSummary, SchedulingService } from "./types";
import { schedulingEndpoints } from "./api";
import { slotSelected } from "./dispatch";

type SlotProps = MachinaSlotProps<unknown, { dispatch?: (event: unknown) => void }>;
export const localDevAdminWarning = "Local/dev admin mode. Provider setup endpoints are intentionally unsafe and require `LEVIATHAN_ALLOW_UNSAFE_ADMIN=true`. Do not expose this server publicly.";
export const adminGateMessage = "Provider setup is blocked because unsafe local/dev admin mode is disabled. Restart the backend with LEVIATHAN_ALLOW_UNSAFE_ADMIN=true for local demos only.";
export const isUnsafeAdminError = (message?: string) => !!message && (message.includes("unsafe_admin_disabled") || message.includes("LEVIATHAN_ALLOW_UNSAFE_ADMIN") || message.includes("X-Leviathan-Unsafe-Admin"));

export function SchedulingHomeView() {
  return <section className="panel scheduling-home"><h2>Scheduling</h2><p>Demo provider setup, public booking, cancellation, audit, and lifecycle inspection for the local Scheduling app.</p><p><a href="/apps/scheduling/setup">Provider setup</a> · <a href="/apps/scheduling/bookings">Bookings</a></p><AdminModeBanner /></section>;
}
export function AdminModeBanner({ errorMessage }: { errorMessage?: string }) {
  return <aside className="scheduling-admin-warning" role={errorMessage ? "alert" : "note"}><strong>{isUnsafeAdminError(errorMessage) ? "Admin gate blocked." : "Local/dev admin mode."}</strong> {isUnsafeAdminError(errorMessage) ? adminGateMessage : localDevAdminWarning}</aside>;
}
export function ProviderSetupView({ errorMessage, providerSlug = "demo-provider", providerTimeZone = browserTimeZone() }: { errorMessage?: string; providerSlug?: string; providerTimeZone?: string }) {
  const publicLink = `/book/${providerSlug}`;
  return <section className="panel scheduling-setup"><h2>Provider setup</h2><AdminModeBanner errorMessage={errorMessage} /><ol><li>Create provider <code>{providerSlug}</code> in <code>{providerTimeZone}</code>.</li><li>Create a <code>person</code> resource.</li><li>Create a public 30 minute service.</li><li>Assign the service to the resource.</li><li>Create Monday 09:00–17:00 availability.</li></ol><p>Generated public booking link: <a href={publicLink}>{publicLink}</a></p></section>;
}
export function SlotPickerView(props: SlotProps & { slots?: BookableSlot[]; errorMessage?: string; providerName?: string; services?: SchedulingService[] }) {
  const slots = props.slots ?? [];
  const providerTimeZone = slots[0]?.providerTimeZoneId;
  const displayTimeZone = slots[0]?.displayTimeZoneId;
  return <section className="panel"><h2>Pick a slot</h2>{props.providerName ? <p>Provider: {props.providerName}</p> : null}{props.errorMessage ? <p role="alert">{controlledSchedulingError(props.errorMessage)}</p> : null}{props.services?.length ? <ul>{props.services.map(s => <li key={s.id.value}>{s.name} — {s.durationMinutes} minutes</li>)}</ul> : null}{providerTimeZone ? <p>Provider timezone: {providerTimeZone}</p> : null}{displayTimeZone ? <p>Shown in: {displayTimeZone}</p> : null}{slots.map((slot) => <button key={`${slot.resourceId}-${slot.startsAtUtc}`} onClick={() => props.nodeData?.dispatch?.(slotSelected(slot))}>{slot.displayLabel}<span className="sr-only"> Provider timezone {slot.providerTimeZoneId}; display timezone {slot.displayTimeZoneId}</span></button>)}</section>;
}
export function ConfirmationView({ booking, serviceName = "Service", resourceName = "Resource" }: { booking: Booking; serviceName?: string; resourceName?: string }) {
  const bookingId = booking.id.value;
  const tz = booking.range?.timeZoneId ?? "timezone unavailable";
  return <section className="panel"><h2>Booking confirmed</h2><p>{booking.customer.name} — {booking.status}</p><dl><dt>Booking id</dt><dd>{bookingId}</dd><dt>Service</dt><dd>{serviceName}</dd><dt>Resource</dt><dd>{resourceName}</dd><dt>Date/time</dt><dd>{booking.range?.startsAtUtc ?? "time unavailable"}</dd><dt>Timezone</dt><dd>{tz}</dd></dl>{booking.status === "confirmed" ? <a href={schedulingEndpoints.bookingIcs(bookingId)}>Download ICS</a> : null}</section>;
}
export function ProviderBookingsView({ bookings = [], selectedBooking, auditEvents = [], lifecycle, errorMessage }: { bookings?: Booking[]; selectedBooking?: Booking; auditEvents?: BookingAuditEvent[]; lifecycle?: SchedulingLifecycleSummary; errorMessage?: string }) {
  return <section className="panel scheduling-bookings"><h2>Provider bookings</h2><AdminModeBanner errorMessage={errorMessage} />{errorMessage && !isUnsafeAdminError(errorMessage) ? <p role="alert">{controlledSchedulingError(errorMessage)}</p> : null}<table><thead><tr><th>Status</th><th>Customer</th><th>Time</th><th>Actions</th></tr></thead><tbody>{bookings.map(b => <tr key={b.id.value}><td>{statusLabel(b.status)}</td><td>{b.customer.name} ({b.customer.email})</td><td>{b.range?.startsAtUtc} {b.range?.timeZoneId}</td><td>{b.status === "confirmed" ? <button>Cancel booking</button> : null} {b.status === "confirmed" ? <a href={schedulingEndpoints.bookingIcs(b.id.value)}>ICS</a> : null}</td></tr>)}</tbody></table>{selectedBooking ? <BookingDebugPanel booking={selectedBooking} auditEvents={auditEvents} lifecycle={lifecycle} /> : null}</section>;
}
export function BookingDebugPanel({ booking, auditEvents, lifecycle }: { booking: Booking; auditEvents: BookingAuditEvent[]; lifecycle?: SchedulingLifecycleSummary }) {
  return <aside className="scheduling-debug"><h3>Audit and lifecycle</h3>{booking.cancellationReasonCode ? <p>Cancellation reason: {booking.cancellationReasonCode}</p> : null}<p>Lifecycle state: {lifecycle?.workflowState ?? "unknown"}</p><p>Decision/policy result: {lifecycle?.lastDecisionCode ?? booking.cancellationPolicyResult ?? "unknown"}</p><p>Last audit event id: {lifecycle?.lastAuditEventId ?? "none"}</p><p>Checkpoint exists: {String(lifecycle?.checkpointExists ?? !!lifecycle?.checkpointPath)}</p><ul>{auditEvents.map(e => <li key={e.eventId}>{e.eventType} · {e.occurredAt} · {e.data?.decision ?? e.data?.policyResult ?? e.message}</li>)}</ul></aside>;
}
function browserTimeZone() { return typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" : "UTC"; }
function statusLabel(status: string) { return status === "confirmed" ? "Confirmed" : status === "cancelled" ? "Cancelled" : status; }
function controlledSchedulingError(message: string) { return isUnsafeAdminError(message) ? adminGateMessage : message; }
