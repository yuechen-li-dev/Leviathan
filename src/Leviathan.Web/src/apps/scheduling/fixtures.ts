import type {
  AvailabilityRule,
  BookableResource,
  BookableSlot,
  Booking,
  BookingAuditEvent,
  LocalDevPlatformContext,
  Provider,
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
  setupProvider?: Provider;
  setupResource?: BookableResource;
  setupService?: SchedulingService;
  setupAvailabilityRule?: AvailabilityRule;
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
    id: { value: "svc_intro_15" },
    providerId: { value: "prov_demo" },
    name: "15 min Check-In",
    description: "A quick sync for lightweight questions or scheduling follow-up.",
    durationMinutes: 15,
    assignedResourceIds: [{ value: "res_emma" }],
    isPublic: true,
  },
  {
    id: { value: "svc_intro_30" },
    providerId: { value: "prov_demo" },
    name: "30 min Intro Call",
    description: "A focused introductory meeting to discuss goals, constraints, and next steps.",
    durationMinutes: 30,
    assignedResourceIds: [{ value: "res_emma" }],
    isPublic: true,
  },
  {
    id: { value: "svc_intro_45" },
    providerId: { value: "prov_demo" },
    name: "45 min Working Session",
    description: "More room for context, discovery, and live problem solving.",
    durationMinutes: 45,
    assignedResourceIds: [{ value: "res_emma" }],
    isPublic: true,
  },
  {
    id: { value: "svc_intro_60" },
    providerId: { value: "prov_demo" },
    name: "60 min Strategy Session",
    description: "A longer planning block for deeper scheduling and workflow questions.",
    durationMinutes: 60,
    assignedResourceIds: [{ value: "res_emma" }],
    isPublic: true,
  },
];

const setupProvider: Provider = {
  id: { value: "prov_demo" },
  slug: "demo-provider",
  displayName: "Emma Brown",
  timeZoneId: "America/Los_Angeles",
  contactEmail: "emma@example.test",
  publicDescription: "Intro calls and working sessions for local scheduling demos.",
};

const setupResource: BookableResource = {
  id: { value: "res_emma" },
  providerId: { value: "prov_demo" },
  displayName: "Emma Brown",
  resourceType: "person",
  timeZoneId: "America/Los_Angeles",
};

const setupService: SchedulingService = {
  id: { value: "svc_setup_intro_30" },
  providerId: { value: "prov_demo" },
  name: "30 min Intro Call",
  description: "A focused introductory meeting to discuss goals, constraints, and next steps.",
  durationMinutes: 30,
  assignedResourceIds: [{ value: "res_emma" }],
  isPublic: true,
  paymentPolicy: {
    requiresDeposit: false,
    requiresPrepay: true,
    depositAmount: null,
    prepayAmount: { minorUnits: 2500, currency: "USD" },
    currency: "USD",
    paymentTiming: "before_confirmation",
    paymentProviderMode: "fake/local",
    cancellationPaymentPolicy: "no_refund_policy_yet",
    reschedulePaymentPolicy: "carry_payment_forward_deferred",
  },
  notificationPolicy: {
    enabled: true,
    rules: [
      {
        trigger: "booking_confirmed",
        channel: "app",
        recipientType: "manual_test",
        templateKey: "booking-confirmed-local",
        offsetMinutesBeforeStart: null,
      },
    ],
  },
};

const setupAvailabilityRule: AvailabilityRule = {
  id: { value: "avail_demo_weekdays" },
  providerId: { value: "prov_demo" },
  resourceId: { value: "res_emma" },
  timeZoneId: "America/Los_Angeles",
  daysOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  localStartTime: "09:00",
  localEndTime: "17:00",
};

const slots: BookableSlot[] = [
  {
    providerId: "prov_demo",
    serviceId: "svc_intro_15",
    resourceId: "res_emma",
    startsAtUtc: "2025-05-06T16:00:00Z",
    endsAtUtc: "2025-05-06T16:30:00Z",
    timeZoneId: "America/Los_Angeles",
    displayLabel: "Tue May 6, 9:00 AM",
    providerTimeZoneId: "America/Los_Angeles",
    displayTimeZoneId: "America/Los_Angeles",
    displayStartsAtLocal: "Tue May 6, 9:00 AM PDT",
    displayEndsAtLocal: "Tue May 6, 9:30 AM PDT",
  },
  {
    providerId: "prov_demo",
    serviceId: "svc_intro_45",
    resourceId: "res_emma",
    startsAtUtc: "2025-05-07T17:00:00Z",
    endsAtUtc: "2025-05-07T17:30:00Z",
    timeZoneId: "America/Los_Angeles",
    displayLabel: "Wed May 7, 10:00 AM",
    providerTimeZoneId: "America/Los_Angeles",
    displayTimeZoneId: "America/Los_Angeles",
    displayStartsAtLocal: "Wed May 7, 10:00 AM PDT",
    displayEndsAtLocal: "Wed May 7, 10:30 AM PDT",
  },
  {
    providerId: "prov_demo",
    serviceId: "svc_intro_60",
    resourceId: "res_emma",
    startsAtUtc: "2025-05-08T18:00:00Z",
    endsAtUtc: "2025-05-08T18:30:00Z",
    timeZoneId: "America/Los_Angeles",
    displayLabel: "Thu May 8, 11:00 AM",
    providerTimeZoneId: "America/Los_Angeles",
    displayTimeZoneId: "America/Los_Angeles",
    displayStartsAtLocal: "Thu May 8, 11:00 AM PDT",
    displayEndsAtLocal: "Thu May 8, 11:30 AM PDT",
  },
  {
    providerId: "prov_demo",
    serviceId: "svc_intro_15",
    resourceId: "res_emma",
    startsAtUtc: "2025-05-13T17:00:00Z",
    endsAtUtc: "2025-05-13T17:30:00Z",
    timeZoneId: "America/Los_Angeles",
    displayLabel: "Tue May 13, 10:00 AM",
    providerTimeZoneId: "America/Los_Angeles",
    displayTimeZoneId: "America/Los_Angeles",
    displayStartsAtLocal: "Tue May 13, 10:00 AM PDT",
    displayEndsAtLocal: "Tue May 13, 10:30 AM PDT",
  },
  {
    providerId: "prov_demo",
    serviceId: "svc_intro_45",
    resourceId: "res_emma",
    startsAtUtc: "2025-05-15T16:30:00Z",
    endsAtUtc: "2025-05-15T17:00:00Z",
    timeZoneId: "America/Los_Angeles",
    displayLabel: "Thu May 15, 9:30 AM",
    providerTimeZoneId: "America/Los_Angeles",
    displayTimeZoneId: "America/Los_Angeles",
    displayStartsAtLocal: "Thu May 15, 9:30 AM PDT",
    displayEndsAtLocal: "Thu May 15, 10:00 AM PDT",
  },
  {
    providerId: "prov_demo",
    serviceId: "svc_intro_30",
    resourceId: "res_emma",
    startsAtUtc: "2025-05-16T16:00:00Z",
    endsAtUtc: "2025-05-16T16:30:00Z",
    timeZoneId: "America/Los_Angeles",
    displayLabel: "Fri May 16, 9:00 AM",
    providerTimeZoneId: "America/Los_Angeles",
    displayTimeZoneId: "America/Los_Angeles",
    displayStartsAtLocal: "Fri May 16, 9:00 AM PDT",
    displayEndsAtLocal: "Fri May 16, 9:30 AM PDT",
  },
  {
    providerId: "prov_demo",
    serviceId: "svc_intro_30",
    resourceId: "res_emma",
    startsAtUtc: "2025-05-16T16:30:00Z",
    endsAtUtc: "2025-05-16T17:00:00Z",
    timeZoneId: "America/Los_Angeles",
    displayLabel: "Fri May 16, 9:30 AM",
    providerTimeZoneId: "America/Los_Angeles",
    displayTimeZoneId: "America/Los_Angeles",
    displayStartsAtLocal: "Fri May 16, 9:30 AM PDT",
    displayEndsAtLocal: "Fri May 16, 10:00 AM PDT",
  },
  {
    providerId: "prov_demo",
    serviceId: "svc_intro_30",
    resourceId: "res_emma",
    startsAtUtc: "2025-05-16T17:00:00Z",
    endsAtUtc: "2025-05-16T17:30:00Z",
    timeZoneId: "America/Los_Angeles",
    displayLabel: "Fri May 16, 10:00 AM",
    providerTimeZoneId: "America/Los_Angeles",
    displayTimeZoneId: "America/Los_Angeles",
    displayStartsAtLocal: "Fri May 16, 10:00 AM PDT",
    displayEndsAtLocal: "Fri May 16, 10:30 AM PDT",
  },
  {
    providerId: "prov_demo",
    serviceId: "svc_intro_30",
    resourceId: "res_emma",
    startsAtUtc: "2025-05-16T21:30:00Z",
    endsAtUtc: "2025-05-16T22:00:00Z",
    timeZoneId: "America/Los_Angeles",
    displayLabel: "Fri May 16, 2:30 PM",
    providerTimeZoneId: "America/Los_Angeles",
    displayTimeZoneId: "America/Los_Angeles",
    displayStartsAtLocal: "Fri May 16, 2:30 PM PDT",
    displayEndsAtLocal: "Fri May 16, 3:00 PM PDT",
  },
  {
    providerId: "prov_demo",
    serviceId: "svc_intro_30",
    resourceId: "res_emma",
    startsAtUtc: "2025-05-16T23:00:00Z",
    endsAtUtc: "2025-05-16T23:30:00Z",
    timeZoneId: "America/Los_Angeles",
    displayLabel: "Fri May 16, 4:00 PM",
    providerTimeZoneId: "America/Los_Angeles",
    displayTimeZoneId: "America/Los_Angeles",
    displayStartsAtLocal: "Fri May 16, 4:00 PM PDT",
    displayEndsAtLocal: "Fri May 16, 4:30 PM PDT",
  },
  {
    providerId: "prov_demo",
    serviceId: "svc_intro_15",
    resourceId: "res_emma",
    startsAtUtc: "2025-05-20T16:00:00Z",
    endsAtUtc: "2025-05-20T16:15:00Z",
    timeZoneId: "America/Los_Angeles",
    displayLabel: "Tue May 20, 9:00 AM",
    providerTimeZoneId: "America/Los_Angeles",
    displayTimeZoneId: "America/Los_Angeles",
    displayStartsAtLocal: "Tue May 20, 9:00 AM PDT",
    displayEndsAtLocal: "Tue May 20, 9:15 AM PDT",
  },
  {
    providerId: "prov_demo",
    serviceId: "svc_intro_45",
    resourceId: "res_emma",
    startsAtUtc: "2025-05-22T18:00:00Z",
    endsAtUtc: "2025-05-22T18:45:00Z",
    timeZoneId: "America/Los_Angeles",
    displayLabel: "Thu May 22, 11:00 AM",
    providerTimeZoneId: "America/Los_Angeles",
    displayTimeZoneId: "America/Los_Angeles",
    displayStartsAtLocal: "Thu May 22, 11:00 AM PDT",
    displayEndsAtLocal: "Thu May 22, 11:45 AM PDT",
  },
  {
    providerId: "prov_demo",
    serviceId: "svc_intro_60",
    resourceId: "res_emma",
    startsAtUtc: "2025-05-29T20:00:00Z",
    endsAtUtc: "2025-05-29T21:00:00Z",
    timeZoneId: "America/Los_Angeles",
    displayLabel: "Thu May 29, 1:00 PM",
    providerTimeZoneId: "America/Los_Angeles",
    displayTimeZoneId: "America/Los_Angeles",
    displayStartsAtLocal: "Thu May 29, 1:00 PM PDT",
    displayEndsAtLocal: "Thu May 29, 2:00 PM PDT",
  },
];

const confirmedBooking: Booking = {
  id: { value: "book_demo_confirmed" },
  providerId: { value: "prov_demo" },
  serviceId: { value: "svc_intro_30" },
  resourceId: { value: "res_emma" },
  status: "confirmed",
  createdAt: "2025-05-16T16:57:00Z",
  updatedAt: "2025-05-16T17:02:00Z",
  confirmedAt: "2025-05-16T17:01:00Z",
  customer: {
    name: "Ada Lovelace",
    email: "ada@example.test",
    phone: "+1 555-0100",
    notes: "Interested in discussing goals, constraints, and next steps.",
  },
  range: {
    startsAtUtc: "2025-05-16T17:00:00Z",
    endsAtUtc: "2025-05-16T17:30:00Z",
    timeZoneId: "America/Los_Angeles",
  },
  paymentStatus: "payment_satisfied_fake",
  paymentPolicyLabel: "Controlled local/test payment satisfaction recorded for this booking.",
  paymentReference: "fakepay_demo_001",
  notificationPolicyLabel: "Booking confirmation plus reminder policy.",
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
  cancelledAt: "2025-05-16T18:15:00Z",
  cancellationReasonCode: "provider_cancelled",
  cancellationMessage: "Weather closure in local fixture.",
  cancellationActor: "local-dev-admin",
  notificationSummary: {
    pending: 0,
    sentFake: 1,
    cancelled: 1,
    skipped: 0,
    failed: 0,
    deferredProviderUnavailable: 0,
  },
};

const rescheduledBooking: Booking = {
  ...confirmedBooking,
  id: { value: "book_demo_rescheduled_old" },
  status: "rescheduled",
  updatedAt: "2025-05-20T15:04:00Z",
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
  createdAt: "2025-05-20T15:04:00Z",
  confirmedAt: "2025-05-20T15:04:00Z",
  rescheduledFromBookingId: "book_demo_rescheduled_old",
  range: {
    startsAtUtc: "2025-05-20T18:00:00Z",
    endsAtUtc: "2025-05-20T18:30:00Z",
    timeZoneId: "America/Los_Angeles",
  },
};

const paymentRequiredBooking: Booking = {
  ...confirmedBooking,
  id: { value: "book_demo_payment_required" },
  status: "pending_confirmation",
  createdAt: "2025-05-16T16:57:00Z",
  paymentStatus: "payment_required",
  paymentPolicyLabel: "Controlled local/test payment satisfaction is required before confirmation.",
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
    occurredAt: "2025-05-16T16:57:00Z",
    data: { decision: "accepted" },
  },
  {
    eventId: "evt_confirmed",
    eventType: "booking_confirmed",
    occurredAt: "2025-05-16T17:01:00Z",
    data: { policyResult: "hold_consumed" },
  },
  {
    eventId: "evt_notification",
    eventType: "notification_sent_fake",
    occurredAt: "2025-05-16T17:02:00Z",
    data: { decision: "sent_fake" },
  },
];

const cancelledAuditEvents: BookingAuditEvent[] = [
  {
    eventId: "evt_cancelled",
    eventType: "booking_cancelled",
    occurredAt: "2025-05-16T18:15:00Z",
    data: { decision: "accepted", policyResult: "accepted_confirmed_booking" },
  },
  {
    eventId: "evt_notification_cancelled",
    eventType: "notification_cancelled",
    occurredAt: "2025-05-16T18:15:02Z",
    data: { decision: "pending_notifications_cancelled" },
  },
];

const rescheduleAuditEvents: BookingAuditEvent[] = [
  {
    eventId: "evt_reschedule_requested",
    eventType: "booking_reschedule_requested",
    occurredAt: "2025-05-20T15:00:00Z",
    data: { decision: "replacement_hold_created" },
  },
  {
    eventId: "evt_rescheduled",
    eventType: "booking_rescheduled",
    occurredAt: "2025-05-20T15:04:00Z",
    data: { policyResult: "replacement_confirmed" },
  },
];

const lifecycle: SchedulingLifecycleSummary = {
  workflowState: "confirmed",
  status: "confirmed",
  createdAt: "2025-05-16T16:57:00Z",
  confirmedAt: "2025-05-16T17:01:00Z",
  lastDecisionCode: "payment_satisfied_fake",
  lastAuditEventId: "evt_notification",
  checkpointExists: true,
  paymentStatus: "payment_satisfied_fake",
  notificationSummary: confirmedBooking.notificationSummary,
};

const cancelledLifecycle: SchedulingLifecycleSummary = {
  workflowState: "cancelled",
  status: "cancelled",
  createdAt: "2025-05-16T16:57:00Z",
  confirmedAt: "2025-05-16T17:01:00Z",
  cancelledAt: "2025-05-16T18:15:00Z",
  lastDecisionCode: "accepted_confirmed_booking",
  lastAuditEventId: "evt_notification_cancelled",
  checkpointExists: true,
  notificationSummary: cancelledBooking.notificationSummary,
};

const rescheduledLifecycle: SchedulingLifecycleSummary = {
  workflowState: "rescheduled",
  status: "rescheduled",
  createdAt: "2025-05-16T16:57:00Z",
  confirmedAt: "2025-05-16T17:01:00Z",
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
    body: "Two-column public booking layout with calendar, slot list, intake details, and a pending summary footer.",
    cta: "Open booking demo",
  },
  {
    title: "Booking confirmation",
    href: "/book/demo-provider/confirmed/book_demo_confirmed?debug=1&fixture=booking-confirmation",
    body: "Confirmed booking status surface with lifecycle context, fake/local policy labels, and the follow-on provider bookings path.",
    cta: "Open confirmation demo",
  },
  {
    title: "Payment required",
    href: "/book/demo-provider?debug=1&fixture=payment-required",
    body: "Public booking state that shows the blocked-before-confirmation path without claiming a real provider integration.",
    cta: "Open payment-required demo",
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
      "Public booking with a calm summary panel, explicit provider/service context, and visible timezone.",
      "Hold before confirmation, then a controlled confirm/cancel/reschedule lifecycle.",
      "Fake/local payment and notification policy labels without claiming real providers exist.",
      "Machina shell geometry stays authoritative while inner cards and lists stay easy to scan.",
    ],
    providerSlug: "demo-provider",
    providerName: "Emma Brown",
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
      "Guided local-dev setup for creating a provider, resource, service, and weekly availability without knowing Leviathan internals.",
      "/apps/scheduling/setup",
    ),
    localDevContext,
    setupProvider,
    setupResource,
    setupService,
    setupAvailabilityRule,
  },
  "public-booking": {
    ...baseScenario(
      "public-booking",
      "booking",
      "Public booking",
      "Public demo state showing a calmer booking flow with service duration, calendar, slots, intake details, and confirmation affordance.",
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
    bookings: [cancelledBooking, rescheduledBooking, replacementBooking, confirmedBooking],
    selectedBooking: cancelledBooking,
    auditEvents: cancelledAuditEvents,
    lifecycle: cancelledLifecycle,
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
