import type {
  BookableSlot,
  Booking,
  BookingAuditEvent,
  LocalDevPlatformContext,
  SchedulingLifecycleSummary,
  SchedulingService,
} from "./types";

export type SchedulingFixtureKey =
  | "landing"
  | "provider-setup"
  | "public-booking"
  | "booking-confirmation"
  | "cancelled-rescheduled"
  | "payment-required"
  | "notification-summary";

export type SchedulingSurface = "landing" | "setup" | "booking" | "confirmation" | "bookings";

export type SchedulingFixtureScenario = {
  key: SchedulingFixtureKey;
  surface: SchedulingSurface;
  title: string;
  subtitle: string;
  eyebrow: string;
  routeLabel: string;
  actions: Array<{ title: string; href: string; body: string; cta: string }>;
  proofPoints: string[];
  localDevContext?: LocalDevPlatformContext;
  errorMessage?: string;
  providerSlug?: string;
  providerName?: string;
  providerTimeZone?: string;
  services?: SchedulingService[];
  slots?: BookableSlot[];
  booking?: Booking;
  bookings?: Booking[];
  selectedBooking?: Booking;
  auditEvents?: BookingAuditEvent[];
  lifecycle?: SchedulingLifecycleSummary;
};

const localDevContext: LocalDevPlatformContext = {
  actorKind: "local-dev",
  userId: "user_local_dev",
  accountId: "acct_local_dev",
  unsafeLocalDev: true,
  requestId: "req_ui_fixture",
  schedulingInstallation: {
    appInstallationId: { value: "inst_local_dev_scheduling" },
    accountId: { value: "acct_local_dev" },
    appId: "scheduling",
    status: "active-local-dev",
    persistenceScope: "scheduling",
  },
};

const services: SchedulingService[] = [
  {
    id: { value: "svc_consult_30" },
    providerId: { value: "prov_demo" },
    name: "30 minute consult",
    description: "Resource-first demo service with local fake payment/notification policy labels.",
    durationMinutes: 30,
    assignedResourceIds: [{ value: "res_ada" }],
    isPublic: true,
  },
  {
    id: { value: "svc_followup_45" },
    providerId: { value: "prov_demo" },
    name: "45 minute follow-up",
    description: "Longer booking to show slot density and timezone handling.",
    durationMinutes: 45,
    assignedResourceIds: [{ value: "res_ada" }],
    isPublic: true,
  },
];

const slots: BookableSlot[] = [
  {
    providerId: "prov_demo",
    serviceId: "svc_consult_30",
    resourceId: "res_ada",
    startsAtUtc: "2030-01-07T17:00:00Z",
    endsAtUtc: "2030-01-07T17:30:00Z",
    timeZoneId: "America/Los_Angeles",
    displayLabel: "Mon Jan 7, 9:00 AM",
    providerTimeZoneId: "America/Los_Angeles",
    displayTimeZoneId: "America/Los_Angeles",
    displayStartsAtLocal: "Mon Jan 7, 9:00 AM PST",
    displayEndsAtLocal: "Mon Jan 7, 9:30 AM PST",
  },
  {
    providerId: "prov_demo",
    serviceId: "svc_consult_30",
    resourceId: "res_ada",
    startsAtUtc: "2030-01-07T18:00:00Z",
    endsAtUtc: "2030-01-07T18:30:00Z",
    timeZoneId: "America/Los_Angeles",
    displayLabel: "Mon Jan 7, 10:00 AM",
    providerTimeZoneId: "America/Los_Angeles",
    displayTimeZoneId: "America/Los_Angeles",
    displayStartsAtLocal: "Mon Jan 7, 10:00 AM PST",
    displayEndsAtLocal: "Mon Jan 7, 10:30 AM PST",
  },
  {
    providerId: "prov_demo",
    serviceId: "svc_followup_45",
    resourceId: "res_ada",
    startsAtUtc: "2030-01-07T20:00:00Z",
    endsAtUtc: "2030-01-07T20:45:00Z",
    timeZoneId: "America/Los_Angeles",
    displayLabel: "Mon Jan 7, 12:00 PM",
    providerTimeZoneId: "America/Los_Angeles",
    displayTimeZoneId: "America/Los_Angeles",
    displayStartsAtLocal: "Mon Jan 7, 12:00 PM PST",
    displayEndsAtLocal: "Mon Jan 7, 12:45 PM PST",
  },
];

const confirmedBooking: Booking = {
  id: { value: "book_demo_confirmed" },
  providerId: { value: "prov_demo" },
  serviceId: { value: "svc_consult_30" },
  resourceId: { value: "res_ada" },
  status: "confirmed",
  customer: {
    name: "Ada Lovelace",
    email: "ada@example.test",
    phone: "+1 555-0100",
    notes: "Wants reminder labels visible in demo.",
  },
  range: {
    startsAtUtc: "2030-01-07T17:00:00Z",
    endsAtUtc: "2030-01-07T17:30:00Z",
    timeZoneId: "America/Los_Angeles",
  },
  paymentStatus: "payment_satisfied_fake",
  paymentPolicyLabel: "Fake/local prepay satisfied for demo",
  paymentReference: "fakepay_demo_001",
  notificationPolicyLabel: "Reminder + booking confirmed labels only",
  notificationSummary: {
    pending: 1,
    sentFake: 1,
    cancelled: 0,
    skipped: 0,
    failed: 0,
    deferredProviderUnavailable: 0,
  },
};

const cancelledBooking: Booking = {
  ...confirmedBooking,
  id: { value: "book_demo_cancelled" },
  status: "cancelled",
  cancellationReasonCode: "provider_cancelled",
  cancellationMessage: "Weather closure in local fixture.",
  cancellationActor: "local-dev-admin",
};

const rescheduledBooking: Booking = {
  ...confirmedBooking,
  id: { value: "book_demo_rescheduled_old" },
  status: "rescheduled",
  rescheduledToBookingId: "book_demo_rescheduled_new",
  notificationSummary: {
    pending: 0,
    sentFake: 0,
    cancelled: 2,
    skipped: 0,
    failed: 0,
    deferredProviderUnavailable: 0,
  },
};

const replacementBooking: Booking = {
  ...confirmedBooking,
  id: { value: "book_demo_rescheduled_new" },
  status: "confirmed",
  rescheduledFromBookingId: "book_demo_rescheduled_old",
  range: {
    startsAtUtc: "2030-01-08T18:00:00Z",
    endsAtUtc: "2030-01-08T18:30:00Z",
    timeZoneId: "America/Los_Angeles",
  },
};

const paymentRequiredBooking: Booking = {
  ...confirmedBooking,
  id: { value: "book_demo_payment_required" },
  status: "pending_confirmation",
  paymentStatus: "payment_required",
  paymentPolicyLabel: "Deposit required before confirmation",
  paymentReference: undefined,
  notificationSummary: {
    pending: 1,
    sentFake: 0,
    cancelled: 0,
    skipped: 0,
    failed: 0,
    deferredProviderUnavailable: 0,
  },
};

const auditEvents: BookingAuditEvent[] = [
  {
    eventId: "evt_hold_created",
    eventType: "booking_hold_created",
    occurredAt: "2030-01-07T16:57:00Z",
    data: { decision: "accepted" },
  },
  {
    eventId: "evt_confirmed",
    eventType: "booking_confirmed",
    occurredAt: "2030-01-07T17:01:00Z",
    data: { policyResult: "hold_consumed" },
  },
  {
    eventId: "evt_notification",
    eventType: "notification_sent_fake",
    occurredAt: "2030-01-07T17:02:00Z",
    data: { decision: "sent_fake" },
  },
];

const cancelledAuditEvents: BookingAuditEvent[] = [
  {
    eventId: "evt_cancelled",
    eventType: "booking_cancelled",
    occurredAt: "2030-01-07T18:15:00Z",
    data: { decision: "accepted", policyResult: "accepted_confirmed_booking" },
  },
  {
    eventId: "evt_notification_cancelled",
    eventType: "notification_cancelled",
    occurredAt: "2030-01-07T18:15:02Z",
    data: { decision: "pending_notifications_cancelled" },
  },
];

const rescheduleAuditEvents: BookingAuditEvent[] = [
  {
    eventId: "evt_reschedule_requested",
    eventType: "booking_reschedule_requested",
    occurredAt: "2030-01-08T15:00:00Z",
    data: { decision: "replacement_hold_created" },
  },
  {
    eventId: "evt_rescheduled",
    eventType: "booking_rescheduled",
    occurredAt: "2030-01-08T15:04:00Z",
    data: { policyResult: "replacement_confirmed" },
  },
];

const lifecycle: SchedulingLifecycleSummary = {
  workflowState: "confirmed",
  status: "confirmed",
  lastDecisionCode: "payment_satisfied_fake",
  lastAuditEventId: "evt_notification",
  checkpointExists: true,
  paymentStatus: "payment_satisfied_fake",
  notificationSummary: confirmedBooking.notificationSummary,
};

const cancelledLifecycle: SchedulingLifecycleSummary = {
  workflowState: "cancelled",
  status: "cancelled",
  lastDecisionCode: "accepted_confirmed_booking",
  lastAuditEventId: "evt_notification_cancelled",
  checkpointExists: true,
  notificationSummary: cancelledBooking.notificationSummary,
};

const rescheduledLifecycle: SchedulingLifecycleSummary = {
  workflowState: "rescheduled",
  status: "rescheduled",
  lastDecisionCode: "replacement_confirmed",
  lastAuditEventId: "evt_rescheduled",
  checkpointExists: true,
  notificationSummary: rescheduledBooking.notificationSummary,
};

const sharedActions = [
  {
    title: "Provider setup",
    href: "/apps/scheduling/setup?debug=1&fixture=provider-setup",
    body: "Unsafe local-dev setup path with defaults, ownership context, and the generated public booking link.",
    cta: "Open setup demo",
  },
  {
    title: "Public booking demo",
    href: "/book/demo-provider?debug=1&fixture=public-booking",
    body: "Resource-first service cards, timezone labels, slot picking, and controlled hold/confirm messaging.",
    cta: "Open booking demo",
  },
  {
    title: "Provider bookings",
    href: "/apps/scheduling/bookings?debug=1&fixture=cancelled-rescheduled",
    body: "Readable lifecycle panels with cancellation, reschedule, and fake payment/notification status chips.",
    cta: "Open bookings demo",
  },
  {
    title: "Audit and lifecycle",
    href: "/apps/scheduling/bookings?debug=1&fixture=notification-summary",
    body: "Booking summary panels for lifecycle checkpoints, notification counts, and policy labels.",
    cta: "Inspect status labels",
  },
];

function baseScenario(
  key: SchedulingFixtureKey,
  surface: SchedulingSurface,
  title: string,
  subtitle: string,
  routeLabel: string,
): SchedulingFixtureScenario {
  return {
    key,
    surface,
    title,
    subtitle,
    eyebrow: "Scheduling demo surface",
    routeLabel,
    actions: sharedActions,
    proofPoints: [
      "Resource-first booking with explicit provider and display timezone labels.",
      "Hold before confirmation, then a controlled confirm/cancel/reschedule lifecycle.",
      "Fake/local payment and notification policy labels without claiming real providers exist.",
      "Machina shell geometry stays authoritative while inner cards and lists stay easy to scan.",
    ],
    providerSlug: "demo-provider",
    providerName: "Ada Demo Practice",
    providerTimeZone: "America/Los_Angeles",
  };
}

const scenarios: Record<SchedulingFixtureKey, SchedulingFixtureScenario> = {
  landing: {
    ...baseScenario(
      "landing",
      "landing",
      "Scheduling",
      "Demo-ready local surfaces for provider setup, public booking, booking confirmation, and lifecycle inspection.",
      "/apps/scheduling",
    ),
    localDevContext,
  },
  "provider-setup": {
    ...baseScenario(
      "provider-setup",
      "setup",
      "Provider setup",
      "Unsafe local-dev admin path with generated public link, ownership context, and sensible default configuration steps.",
      "/apps/scheduling/setup",
    ),
    localDevContext,
  },
  "public-booking": {
    ...baseScenario(
      "public-booking",
      "booking",
      "Public booking",
      "Public demo state showing services, slots, timezone context, and the hold-then-confirm path.",
      "/book/demo-provider",
    ),
    services,
    slots,
  },
  "booking-confirmation": {
    ...baseScenario(
      "booking-confirmation",
      "confirmation",
      "Booking confirmed",
      "Confirmed booking summary with service/resource details, fake/local policy labels, and ICS download availability.",
      "/book/demo-provider/confirmed/book_demo_confirmed",
    ),
    booking: confirmedBooking,
    services,
    auditEvents,
    lifecycle,
  },
  "cancelled-rescheduled": {
    ...baseScenario(
      "cancelled-rescheduled",
      "bookings",
      "Provider bookings",
      "Admin-oriented audit surface showing cancelled and rescheduled lifecycle summaries in one readable screen.",
      "/apps/scheduling/bookings",
    ),
    localDevContext,
    bookings: [confirmedBooking, cancelledBooking, rescheduledBooking, replacementBooking],
    selectedBooking: rescheduledBooking,
    auditEvents: rescheduleAuditEvents,
    lifecycle: rescheduledLifecycle,
  },
  "payment-required": {
    ...baseScenario(
      "payment-required",
      "booking",
      "Payment required",
      "Controlled booking state that blocks confirmation until a fake/local payment requirement is satisfied.",
      "/book/demo-provider",
    ),
    services,
    slots,
    booking: paymentRequiredBooking,
    errorMessage: "payment_required",
    auditEvents: [
      {
        eventId: "evt_payment_required",
        eventType: "payment_required",
        occurredAt: "2030-01-07T17:05:00Z",
        data: { decision: "before_confirmation" },
      },
    ],
    lifecycle: {
      workflowState: "payment_required",
      status: "pending_confirmation",
      lastDecisionCode: "payment_required",
      lastAuditEventId: "evt_payment_required",
      checkpointExists: true,
      paymentStatus: "payment_required",
      notificationSummary: paymentRequiredBooking.notificationSummary,
    },
  },
  "notification-summary": {
    ...baseScenario(
      "notification-summary",
      "bookings",
      "Notification summary",
      "Lifecycle-oriented booking detail showing fake/local notification counts and policy labels without implying real send providers.",
      "/apps/scheduling/bookings",
    ),
    localDevContext,
    bookings: [confirmedBooking, cancelledBooking],
    selectedBooking: confirmedBooking,
    auditEvents,
    lifecycle,
  },
};

function fixtureKeyFromLocation(locationLike: Pick<Location, "pathname" | "search">): SchedulingFixtureKey {
  const params = new URLSearchParams(locationLike.search);
  const explicit = params.get("fixture");
  if (explicit && explicit in scenarios) return explicit as SchedulingFixtureKey;

  if (locationLike.pathname.startsWith("/apps/scheduling/setup")) return "provider-setup";
  if (locationLike.pathname.includes("/confirmed/")) return "booking-confirmation";
  if (locationLike.pathname.startsWith("/book/")) return "public-booking";
  if (locationLike.pathname.startsWith("/apps/scheduling/bookings")) return "cancelled-rescheduled";
  return "landing";
}

export function resolveSchedulingFixtureScenario(
  locationLike: Pick<Location, "pathname" | "search"> = window.location,
): SchedulingFixtureScenario {
  return scenarios[fixtureKeyFromLocation(locationLike)];
}
