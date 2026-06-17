import type { MachinaSlotProps } from "machinalayout/react";
import type {
  BookableSlot,
  Booking,
  BookingAuditEvent,
  LocalDevPlatformContext,
  NotificationSummary,
  SchedulingLifecycleSummary,
  SchedulingService,
} from "./types";
import { schedulingEndpoints } from "./api";
import { slotSelected } from "./dispatch";
import type { SchedulingFixtureScenario } from "./fixtures";

type SlotProps = MachinaSlotProps<unknown, { dispatch?: (event: unknown) => void }>;
type DispatchNodeData = { dispatch?: (event: unknown) => void };
type SchedulingViewData = { scenario: SchedulingFixtureScenario };

export const localDevAdminWarning =
  "Local/dev admin mode. Provider setup endpoints are intentionally unsafe and require `LEVIATHAN_ALLOW_UNSAFE_ADMIN=true`. Do not expose this server publicly.";
export const adminGateMessage =
  "Provider setup is blocked because unsafe local/dev admin mode is disabled. Restart the backend with LEVIATHAN_ALLOW_UNSAFE_ADMIN=true for local demos only.";
export const isUnsafeAdminError = (message?: string) =>
  !!message &&
  (message.includes("unsafe_admin_disabled") ||
    message.includes("LEVIATHAN_ALLOW_UNSAFE_ADMIN") ||
    message.includes("X-Leviathan-Unsafe-Admin"));
export const isOwnershipError = (message?: string) =>
  !!message && (message.includes("provider_owner_forbidden") || message.includes("not owned") || message.includes("owner_forbidden"));

function scenarioFrom(props: SlotProps): SchedulingFixtureScenario {
  return (props.viewData as SchedulingViewData).scenario;
}

export function SchedulingHeroView(props: SlotProps) {
  const scenario = scenarioFrom(props);
  return (
    <section className="panel scheduling-shell scheduling-shell-hero">
      <div className="scheduling-eyebrow-row">
        <span className="scheduling-eyebrow">{scenario.eyebrow}</span>
        <span className="scheduling-route-badge">{scenario.routeLabel}</span>
      </div>
      <h1>{scenario.title}</h1>
      <p className="scheduling-hero-copy">{scenario.subtitle}</p>
      <div className="scheduling-chip-row">
        <StatusChip tone="confirmed" label="resource-first booking" />
        <StatusChip tone="warning" label="local/dev admin" />
        <StatusChip tone="info" label="Machina layout driven" />
      </div>
    </section>
  );
}

export function SchedulingMainView(props: SlotProps) {
  const scenario = scenarioFrom(props);

  return (
    <section className="panel scheduling-shell scheduling-shell-main">
      {scenario.surface === "landing" ? (
        <SchedulingHomeView scenario={scenario} />
      ) : scenario.surface === "setup" ? (
        <ProviderSetupView
          errorMessage={scenario.errorMessage}
          providerSlug={scenario.providerSlug}
          providerTimeZone={scenario.providerTimeZone}
          localDevContext={scenario.localDevContext}
        />
      ) : scenario.surface === "booking" ? (
        <PublicBookingFlowView
          providerName={scenario.providerName}
          slots={scenario.slots}
          services={scenario.services}
          errorMessage={scenario.errorMessage}
          booking={scenario.booking}
          nodeData={props.nodeData}
        />
      ) : scenario.surface === "confirmation" ? (
        <ConfirmationSurfaceView scenario={scenario} />
      ) : (
        <ProviderBookingsView
          bookings={scenario.bookings}
          selectedBooking={scenario.selectedBooking}
          auditEvents={scenario.auditEvents}
          lifecycle={scenario.lifecycle}
          errorMessage={scenario.errorMessage}
        />
      )}
    </section>
  );
}

export function SchedulingSidebarView(props: SlotProps) {
  const scenario = scenarioFrom(props);
  const spotlight = scenario.selectedBooking ?? scenario.booking;

  return (
    <section className="panel scheduling-shell scheduling-shell-sidebar">
      <div className="scheduling-stack">
        <section className="scheduling-subpanel">
          <h2>Demo flow</h2>
          <div className="scheduling-action-grid">
            {scenario.actions.map((action) => (
              <article className="card scheduling-action-card" key={action.title}>
                <p className="scheduling-card-kicker">{action.title}</p>
                <p>{action.body}</p>
                <a className="scheduling-inline-link" href={action.href}>
                  {action.cta}
                </a>
              </article>
            ))}
          </div>
        </section>

        <section className="scheduling-subpanel">
          <h2>What this proves</h2>
          <ul className="scheduling-checklist">
            {scenario.proofPoints.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        {spotlight ? (
          <section className="scheduling-subpanel">
            <h2>Fixture spotlight</h2>
            <BookingStatusSummary booking={spotlight} lifecycle={scenario.lifecycle} />
          </section>
        ) : null}
      </div>
    </section>
  );
}

export function SchedulingHomeView({ scenario }: { scenario: SchedulingFixtureScenario }) {
  return (
    <div className="scheduling-stack">
      <section className="scheduling-subpanel">
        <h2>Scheduling landing</h2>
        <p>
          Demo-ready local surfaces for provider setup, public booking, booking confirmation, and lifecycle inspection without adding auth, payments,
          SMS, email, or calendar sync.
        </p>
        <AdminModeBanner />
      </section>

      <section className="scheduling-subpanel">
          <h2>Action cards</h2>
          <div className="scheduling-action-grid">
          {scenario.actions.map((action) => (
            <article className="card scheduling-action-card" key={action.title}>
              <h3>{action.title}</h3>
              <p>{action.body}</p>
              <a className="scheduling-inline-link" href={action.href}>
                {action.cta}
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="scheduling-subpanel">
          <h2>Current proof points</h2>
          <div className="scheduling-proof-grid">
          {scenario.proofPoints.map((point) => (
            <article className="card scheduling-proof-card" key={point}>
              <p>{point}</p>
            </article>
          ))}
        </div>
      </section>

      {scenario.localDevContext ? (
        <section className="scheduling-subpanel">
          <h2>Unsafe local-dev ownership context</h2>
          <OwnershipSummary localDevContext={scenario.localDevContext} />
        </section>
      ) : null}
    </div>
  );
}

export function AdminModeBanner({ errorMessage }: { errorMessage?: string }) {
  return (
    <aside className="scheduling-admin-warning" role={errorMessage ? "alert" : "note"}>
      <strong>{isUnsafeAdminError(errorMessage) ? "Admin gate blocked." : "Local/dev admin mode."}</strong>{" "}
      {isUnsafeAdminError(errorMessage) ? adminGateMessage : localDevAdminWarning}
    </aside>
  );
}

export function ProviderSetupView({
  errorMessage,
  providerSlug = "demo-provider",
  providerTimeZone = browserTimeZone(),
  localDevContext,
}: {
  errorMessage?: string;
  providerSlug?: string;
  providerTimeZone?: string;
  localDevContext?: LocalDevPlatformContext;
}) {
  const publicLink = `/book/${providerSlug}`;

  return (
    <div className="scheduling-stack">
      <section className="scheduling-subpanel">
        <h2>Provider setup</h2>
        <p>Unsafe local-dev path for creating a demo provider, assigning a resource, and generating a public booking link.</p>
        <AdminModeBanner errorMessage={errorMessage} />
        {localDevContext ? <OwnershipSummary localDevContext={localDevContext} /> : null}
        {errorMessage && isOwnershipError(errorMessage) ? (
          <p className="error" role="alert">
            This provider is not owned by the current local-dev Scheduling installation.
          </p>
        ) : null}
      </section>

      <section className="scheduling-two-column">
        <article className="card scheduling-setup-card">
          <h3>Suggested defaults</h3>
          <dl className="scheduling-definition-list">
            <dt>Provider slug</dt>
            <dd>
              <code>{providerSlug}</code>
            </dd>
            <dt>Display timezone</dt>
            <dd>
              <code>{providerTimeZone}</code>
            </dd>
            <dt>Public booking link</dt>
            <dd>
              <a className="scheduling-inline-link" href={publicLink}>
                {publicLink}
              </a>
            </dd>
          </dl>
        </article>

        <article className="card scheduling-setup-card">
          <h3>Setup sequence</h3>
          <ol className="scheduling-sequence">
            <li>
              Create provider <code>{providerSlug}</code> in <code>{providerTimeZone}</code>.
            </li>
            <li>Create a <code>person</code> resource.</li>
            <li>Create a public 30 minute service.</li>
            <li>Assign the service to the resource.</li>
            <li>Create Monday 09:00–17:00 availability.</li>
          </ol>
        </article>
      </section>
    </div>
  );
}

export function SlotPickerView(props: { nodeData?: DispatchNodeData; slots?: BookableSlot[]; errorMessage?: string; providerName?: string; services?: SchedulingService[] }) {
  const slots = props.slots ?? [];
  const providerTimeZone = slots[0]?.providerTimeZoneId;
  const displayTimeZone = slots[0]?.displayTimeZoneId;

  return (
    <section className="scheduling-subpanel">
      <div className="scheduling-section-head">
        <div>
          <h2>Pick a slot</h2>
          {props.providerName ? <p>Provider: {props.providerName}</p> : null}
        </div>
        <div className="scheduling-chip-row">
          {providerTimeZone ? <StatusChip tone="info" label={`provider timezone ${providerTimeZone}`} /> : null}
          {displayTimeZone ? <StatusChip tone="neutral" label={`shown in ${displayTimeZone}`} /> : null}
        </div>
      </div>

      {props.errorMessage ? (
        <p className="error" role="alert">
          {controlledSchedulingError(props.errorMessage)}
        </p>
      ) : null}

      {props.services?.length ? (
        <div className="scheduling-service-grid">
          {props.services.map((service) => (
            <article className="card scheduling-service-card" key={service.id.value}>
              <h3>{service.name}</h3>
              <p>{service.description ?? "Public booking service."}</p>
              <div className="scheduling-chip-row">
                <StatusChip tone="confirmed" label={`${service.durationMinutes} minutes`} />
                <StatusChip tone={service.isPublic ? "info" : "neutral"} label={service.isPublic ? "public service" : "private"} />
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <div className="scheduling-slot-grid">
        {slots.map((slot) => (
          <button
            className="scheduling-slot-button"
            key={`${slot.resourceId}-${slot.startsAtUtc}`}
            onClick={() => props.nodeData?.dispatch?.(slotSelected(slot))}
          >
            <strong>{slot.displayLabel}</strong>
            <span>{slot.displayStartsAtLocal}</span>
            <span>{slot.displayEndsAtLocal}</span>
            <span className="sr-only">
              Provider timezone {slot.providerTimeZoneId}; display timezone {slot.displayTimeZoneId}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function ConfirmationView({
  booking,
  serviceName = "Service",
  resourceName = "Resource",
}: {
  booking: Booking;
  serviceName?: string;
  resourceName?: string;
}) {
  const bookingId = booking.id.value;
  const tz = booking.range?.timeZoneId ?? "timezone unavailable";

  return (
    <section className="scheduling-subpanel">
      <div className="scheduling-section-head">
        <div>
          <h2>Booking confirmed</h2>
          <p>
            {booking.customer.name} · {statusLabel(booking.status)}
          </p>
        </div>
        <div className="scheduling-chip-row">
          <StatusChip tone="confirmed" label={statusLabel(booking.status)} />
          {booking.paymentStatus ? <StatusChip tone={chipToneForValue(booking.paymentStatus)} label={paymentStatusLabel(booking.paymentStatus)} /> : null}
        </div>
      </div>
      <dl className="scheduling-definition-list">
        <dt>Booking id</dt>
        <dd>{bookingId}</dd>
        <dt>Service</dt>
        <dd>{serviceName}</dd>
        <dt>Resource</dt>
        <dd>{resourceName}</dd>
        <dt>Date/time</dt>
        <dd>{booking.range?.startsAtUtc ?? "time unavailable"}</dd>
        <dt>Timezone</dt>
        <dd>{tz}</dd>
      </dl>
      <BookingMetaPanels booking={booking} />
      {booking.status === "confirmed" ? (
        <a className="scheduling-inline-link" href={schedulingEndpoints.bookingIcs(bookingId)}>
          Download ICS
        </a>
      ) : null}
    </section>
  );
}

export function ProviderBookingsView({
  bookings = [],
  selectedBooking,
  auditEvents = [],
  lifecycle,
  errorMessage,
}: {
  bookings?: Booking[];
  selectedBooking?: Booking;
  auditEvents?: BookingAuditEvent[];
  lifecycle?: SchedulingLifecycleSummary;
  errorMessage?: string;
}) {
  return (
    <div className="scheduling-stack">
      <section className="scheduling-subpanel">
        <div className="scheduling-section-head">
          <div>
            <h2>Provider bookings</h2>
            <p>Fixture-backed admin detail surface for lifecycle, policy, and audit summaries.</p>
          </div>
          <div className="scheduling-chip-row">
            <StatusChip tone="warning" label="unsafe local-dev admin" />
          </div>
        </div>
        <AdminModeBanner errorMessage={errorMessage} />
        {errorMessage && !isUnsafeAdminError(errorMessage) ? (
          <p className="error" role="alert">
            {controlledSchedulingError(errorMessage)}
          </p>
        ) : null}

        <div className="scheduling-bookings-table-wrap">
          <table className="scheduling-bookings-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Customer</th>
                <th>Time</th>
                <th>Policies</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id.value}>
                  <td>
                    <StatusChip tone={chipToneForValue(booking.status)} label={statusLabel(booking.status)} />
                  </td>
                  <td>
                    <strong>{booking.customer.name}</strong>
                    <div>{booking.customer.email}</div>
                  </td>
                  <td>
                    {booking.range?.startsAtUtc} {booking.range?.timeZoneId}
                  </td>
                  <td>
                    <div className="scheduling-chip-row">
                      {booking.paymentStatus ? (
                        <StatusChip tone={chipToneForValue(booking.paymentStatus)} label={paymentStatusLabel(booking.paymentStatus)} />
                      ) : null}
                      {notificationSummaryLabel(booking.notificationSummary) ? (
                        <StatusChip tone="info" label={notificationSummaryLabel(booking.notificationSummary)!} />
                      ) : null}
                    </div>
                  </td>
                  <td>
                    {booking.status === "confirmed" ? <button>Cancel booking</button> : null}
                    {booking.status === "confirmed" ? (
                      <a className="scheduling-inline-link" href={schedulingEndpoints.bookingIcs(booking.id.value)}>
                        ICS
                      </a>
                    ) : null}
                    {booking.status === "rescheduled" ? <span className="scheduling-inline-note">ICS blocked for old rescheduled booking</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selectedBooking ? <BookingDebugPanel booking={selectedBooking} auditEvents={auditEvents} lifecycle={lifecycle} /> : null}
    </div>
  );
}

export function BookingDebugPanel({
  booking,
  auditEvents,
  lifecycle,
}: {
  booking: Booking;
  auditEvents: BookingAuditEvent[];
  lifecycle?: SchedulingLifecycleSummary;
}) {
  return (
    <aside className="scheduling-subpanel scheduling-debug">
      <div className="scheduling-section-head">
        <div>
          <h3>Audit and lifecycle</h3>
          <p>Readable policy and notification summary without exposing raw Dominatus internals.</p>
        </div>
        <div className="scheduling-chip-row">
          <StatusChip tone={chipToneForValue(booking.status)} label={statusLabel(booking.status)} />
          {lifecycle?.paymentStatus ? <StatusChip tone={chipToneForValue(lifecycle.paymentStatus)} label={paymentStatusLabel(lifecycle.paymentStatus)} /> : null}
        </div>
      </div>

      <div className="scheduling-two-column">
        <article className="card">
          <h4>Lifecycle summary</h4>
          <p>Lifecycle state: {lifecycle?.workflowState ?? "unknown"}</p>
          <p>Decision/policy result: {lifecycle?.lastDecisionCode ?? booking.cancellationPolicyResult ?? "unknown"}</p>
          <p>Last audit event id: {lifecycle?.lastAuditEventId ?? "none"}</p>
          <p>Checkpoint exists: {String(lifecycle?.checkpointExists ?? !!lifecycle?.checkpointPath)}</p>
          {booking.cancellationReasonCode ? <p>Cancellation reason: {booking.cancellationReasonCode}</p> : null}
          {booking.rescheduledToBookingId ? <p>Rescheduled to: {booking.rescheduledToBookingId}</p> : null}
          {booking.rescheduledFromBookingId ? <p>Rescheduled from: {booking.rescheduledFromBookingId}</p> : null}
        </article>

        <article className="card">
          <h4>Policy labels</h4>
          <BookingMetaPanels booking={booking} notificationSummary={lifecycle?.notificationSummary ?? booking.notificationSummary} compact />
        </article>
      </div>

      <section className="card">
        <h4>Audit trail</h4>
        <ul className="scheduling-audit-list">
          {auditEvents.map((event) => (
            <li key={event.eventId}>
              <strong>{event.eventType}</strong> · {event.occurredAt} · {event.data?.decision ?? event.data?.policyResult ?? event.message}
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

function PublicBookingFlowView({
  providerName,
  slots,
  services,
  errorMessage,
  booking,
  nodeData,
}: {
  providerName?: string;
  slots?: BookableSlot[];
  services?: SchedulingService[];
  errorMessage?: string;
  booking?: Booking;
  nodeData?: DispatchNodeData;
}) {
  return (
    <div className="scheduling-stack">
      <SlotPickerView providerName={providerName} slots={slots} services={services} errorMessage={errorMessage} nodeData={nodeData} />

      <section className="scheduling-two-column">
        <article className="card">
          <h3>Flow summary</h3>
          <ol className="scheduling-sequence">
            <li>Select a public service scoped to an assigned resource.</li>
            <li>Create a hold for the chosen slot before collecting intake.</li>
            <li>Confirm the booking or surface a controlled state like conflict, expiry, or payment required.</li>
          </ol>
        </article>

        <article className="card">
          <h3>Controlled states</h3>
          <div className="scheduling-chip-row">
            <StatusChip tone="confirmed" label="confirmed" />
            <StatusChip tone="danger" label="cancelled" />
            <StatusChip tone="warning" label="payment required" />
            <StatusChip tone="info" label="notification summary" />
          </div>
          <p>These fixture states are UI-only proof surfaces. They do not imply live checkout, SMS, email, or calendar provider integrations.</p>
        </article>
      </section>

      {booking ? (
        <section className="scheduling-subpanel">
          <h2>Current hold / confirmation state</h2>
          <BookingStatusSummary booking={booking} />
        </section>
      ) : null}
    </div>
  );
}

function ConfirmationSurfaceView({ scenario }: { scenario: SchedulingFixtureScenario }) {
  const booking = scenario.booking;
  const serviceName = scenario.services?.[0]?.name ?? "30 minute consult";
  if (!booking) return null;

  return (
    <div className="scheduling-stack">
      <ConfirmationView booking={booking} serviceName={serviceName} resourceName="Ada Demo Practice" />
      <section className="scheduling-two-column">
        <article className="card">
          <h3>Confirmation notes</h3>
          <p>Confirmed bookings expose ICS. Cancelled and old rescheduled bookings do not render broken ICS links.</p>
        </article>
        <article className="card">
          <h3>Notification/payment labels</h3>
          <BookingMetaPanels booking={booking} />
        </article>
      </section>
    </div>
  );
}

function BookingStatusSummary({
  booking,
  lifecycle,
}: {
  booking: Booking;
  lifecycle?: SchedulingLifecycleSummary;
}) {
  return (
    <div className="scheduling-stack scheduling-stack-tight">
      <div className="scheduling-chip-row">
        <StatusChip tone={chipToneForValue(booking.status)} label={statusLabel(booking.status)} />
        {booking.paymentStatus ? <StatusChip tone={chipToneForValue(booking.paymentStatus)} label={paymentStatusLabel(booking.paymentStatus)} /> : null}
        {notificationSummaryLabel(lifecycle?.notificationSummary ?? booking.notificationSummary) ? (
          <StatusChip tone="info" label={notificationSummaryLabel(lifecycle?.notificationSummary ?? booking.notificationSummary)!} />
        ) : null}
      </div>
      <p>
        <strong>{booking.customer.name}</strong> · {booking.customer.email}
      </p>
      <p>
        {booking.range?.startsAtUtc ?? "time unavailable"} {booking.range?.timeZoneId ?? ""}
      </p>
      <BookingMetaPanels booking={booking} notificationSummary={lifecycle?.notificationSummary ?? booking.notificationSummary} compact />
    </div>
  );
}

function BookingMetaPanels({
  booking,
  notificationSummary,
  compact = false,
}: {
  booking: Booking;
  notificationSummary?: NotificationSummary;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "scheduling-stack scheduling-stack-tight" : "scheduling-two-column"}>
      {booking.paymentPolicyLabel || booking.paymentReference ? (
        <article className={compact ? "" : "card"}>
          <h4>Payment</h4>
          {booking.paymentPolicyLabel ? <p>{booking.paymentPolicyLabel}</p> : null}
          {booking.paymentReference ? <p>Reference: {booking.paymentReference}</p> : null}
        </article>
      ) : null}
      {booking.notificationPolicyLabel || notificationSummary ? (
        <article className={compact ? "" : "card"}>
          <h4>Notifications</h4>
          {booking.notificationPolicyLabel ? <p>{booking.notificationPolicyLabel}</p> : null}
          {notificationSummary ? <NotificationSummaryList summary={notificationSummary} /> : null}
        </article>
      ) : null}
    </div>
  );
}

function OwnershipSummary({ localDevContext }: { localDevContext: LocalDevPlatformContext }) {
  return (
    <aside className="scheduling-ownership" role="note">
      <strong>Local-dev owner:</strong> account <code>{localDevContext.accountId}</code> · Scheduling installation{" "}
      <code>{localDevContext.schedulingInstallation.appInstallationId.value}</code>. Ownership is assigned by the backend; do not enter account ids.
    </aside>
  );
}

function NotificationSummaryList({ summary }: { summary: NotificationSummary }) {
  return (
    <ul className="scheduling-checklist scheduling-checklist-tight">
      <li>Pending: {summary.pending}</li>
      <li>Sent fake: {summary.sentFake}</li>
      <li>Cancelled: {summary.cancelled}</li>
      <li>Skipped: {summary.skipped}</li>
      <li>Failed: {summary.failed}</li>
      <li>Deferred provider unavailable: {summary.deferredProviderUnavailable}</li>
    </ul>
  );
}

export function StatusChip({ tone, label }: { tone: "confirmed" | "warning" | "danger" | "info" | "neutral"; label: string }) {
  return <span className={`status-chip status-chip-${tone}`}>{label}</span>;
}

function browserTimeZone() {
  return typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" : "UTC";
}

function chipToneForValue(value: string): "confirmed" | "warning" | "danger" | "info" | "neutral" {
  if (value === "confirmed" || value === "payment_satisfied_fake" || value === "sent_fake") return "confirmed";
  if (value === "cancelled") return "danger";
  if (value === "payment_required" || value === "pending_confirmation") return "warning";
  if (value === "rescheduled") return "info";
  return "neutral";
}

function statusLabel(status: string) {
  return status === "confirmed"
    ? "Confirmed"
    : status === "cancelled"
      ? "Cancelled"
      : status === "rescheduled"
        ? "Rescheduled"
        : status === "pending_confirmation"
          ? "Pending confirmation"
          : status;
}

function paymentStatusLabel(status: string) {
  return status === "payment_required"
    ? "Payment required"
    : status === "payment_satisfied_fake"
      ? "Payment satisfied (fake/local)"
      : status === "not_required"
        ? "No payment required"
        : status;
}

function notificationSummaryLabel(summary?: NotificationSummary) {
  if (!summary) return null;
  if (summary.pending > 0) return `notifications pending ${summary.pending}`;
  if (summary.sentFake > 0) return `notifications sent fake ${summary.sentFake}`;
  if (summary.cancelled > 0) return `notifications cancelled ${summary.cancelled}`;
  return "notification summary";
}

function controlledSchedulingError(message: string) {
  return isUnsafeAdminError(message)
    ? adminGateMessage
    : isOwnershipError(message)
      ? "This provider is not owned by the current local-dev Scheduling installation."
      : message.includes("payment_required")
        ? "Payment is required before confirmation in this local demo state."
        : message;
}
