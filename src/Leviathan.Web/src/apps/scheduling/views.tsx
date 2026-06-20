import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { MachinaSlotProps } from "machinalayout/react";
import type {
  BookableSlot,
  Booking,
  BookingAuditEvent,
  BookableResource,
  AvailabilityRule,
  HoldResponse,
  LocalDevPlatformContext,
  NotificationSummary,
  ScheduledNotification,
  SchedulingLifecycleSummary,
  SchedulingService,
} from "./types";
import {
  assignResourceToService,
  cancelBooking,
  confirmBooking,
  createAvailabilityRule,
  createHold,
  createProvider,
  createResource,
  createService,
  fakeSatisfyPayment,
  getBooking,
  getBookingAudit,
  getBookingLifecycle,
  getBookingNotifications,
  getLocalDevContext,
  getPublicProvider,
  getPublicServices,
  listProviderBookings,
  listSlots,
  schedulingEndpoints,
  submitIntake,
} from "./api";
import { slotSelected } from "./dispatch";
import { resolveSchedulingFixtureScenario, type SchedulingFixtureScenario } from "./fixtures";

type SlotProps = MachinaSlotProps<unknown, { dispatch?: (event: unknown) => void }>;
type DispatchNodeData = { dispatch?: (event: unknown) => void };
type SchedulingViewData = { scenario: SchedulingFixtureScenario };
type LiveSchedulingContext = {
  providerId?: string;
  providerSlug?: string;
  providerName?: string;
  providerTimeZone?: string;
  resourceId?: string;
  serviceId?: string;
  bookingId?: string;
};

const liveSchedulingStorageKey = "leviathan.scheduling.liveContext";
const defaultProviderSlug = "m24-smoke-provider";
const defaultCustomer = {
  name: "M24 Smoke Customer",
  email: "m24-smoke@example.test",
  phone: "555-0100",
  notes: "Created by the Leviathan M24 real-backend smoke.",
};

const fixtureCustomer = {
  name: "",
  email: "",
  phone: "",
  notes: "",
};

const livePaymentPolicy = {
  requiresDeposit: false,
  requiresPrepay: true,
  depositAmount: null,
  prepayAmount: { minorUnits: 2500, currency: "USD" },
  currency: "USD",
  paymentTiming: "before_confirmation",
  paymentProviderMode: "fake/local",
  cancellationPaymentPolicy: "no_refund_policy_yet",
  reschedulePaymentPolicy: "carry_payment_forward_deferred",
} as const;

const liveNotificationPolicy = {
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
};

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

function isFixtureMode() {
  if (typeof window === "undefined") return true;
  return new URLSearchParams(window.location.search).has("fixture");
}

function pathname() {
  return typeof window === "undefined" ? "/apps/scheduling" : window.location.pathname;
}

function bookingIdFromPath() {
  const match = pathname().match(/\/confirmed\/([^/?#]+)/);
  return match?.[1];
}

function providerSlugFromPath() {
  const match = pathname().match(/^\/book\/([^/?#]+)/);
  return match?.[1];
}

function currentQueryString() {
  return typeof window === "undefined" ? "" : window.location.search;
}

function queryValue(name: string) {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get(name) ?? undefined;
}

function linkWithCurrentQuery(path: string) {
  if (typeof window === "undefined") return path;
  const url = new URL(path, window.location.origin);
  const current = new URLSearchParams(window.location.search);
  current.forEach((value, key) => {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  });
  return `${url.pathname}${url.search}`;
}

function loadLiveContext(): LiveSchedulingContext {
  if (typeof window === "undefined") return {};
  try {
    const stored = window.localStorage.getItem(liveSchedulingStorageKey);
    if (!stored) return {};
    return JSON.parse(stored) as LiveSchedulingContext;
  } catch {
    return {};
  }
}

function saveLiveContext(next: LiveSchedulingContext) {
  if (typeof window === "undefined") return;
  const merged = { ...loadLiveContext(), ...next };
  window.localStorage.setItem(liveSchedulingStorageKey, JSON.stringify(merged));
}

function liveRouteLabel() {
  if (pathname().startsWith("/apps/scheduling/setup")) return "Real backend provider setup";
  if (pathname().startsWith("/apps/scheduling/bookings")) return "Real backend provider bookings";
  if (pathname().includes("/confirmed/")) return "Real backend booking confirmation";
  if (pathname().startsWith("/book/")) return "Real backend public booking";
  return "Real backend scheduling smoke";
}

function liveRouteTitle() {
  if (pathname().startsWith("/apps/scheduling/setup")) return "Scheduling setup";
  if (pathname().startsWith("/apps/scheduling/bookings")) return "Provider bookings";
  if (pathname().includes("/confirmed/")) return "Booking confirmed";
  if (pathname().startsWith("/book/")) return "Public booking";
  return "Scheduling";
}

type BookingPageContextValue = {
  live: boolean;
  scenario: SchedulingFixtureScenario;
  providerName: string;
  providerRole: string;
  providerDescription: string;
  providerSlug?: string;
  providerTimeZone: string;
  providerAvailabilityLabel: string;
  services: SchedulingService[];
  selectedService?: SchedulingService;
  selectedServiceId?: string;
  selectedServiceDurationLabel: string;
  serviceLocationLabel: string;
  servicePriceLabel: string;
  selectedDateKey?: string;
  selectedSlot?: BookableSlot;
  hold: HoldResponse | null;
  booking: Booking | null;
  busy: string | null;
  errorMessage?: string;
  customer: typeof defaultCustomer;
  monthLabel: string;
  monthCanGoPrevious: boolean;
  monthCanGoNext: boolean;
  calendarWeeks: CalendarCell[][];
  dayHeadline: string;
  slotGroups: SlotPresentation[];
  timezoneLabel: string;
  intakeReady: boolean;
  hasPaymentAlert: boolean;
  paymentAlertText?: string;
  stepIndex: 0 | 1 | 2;
  whatToExpectLines: string[];
  trustNotes: string[];
  selectService: (serviceId: string) => void;
  selectDate: (dateKey: string) => void;
  selectSlot: (slot: BookableSlot) => void;
  clearSelection: () => void;
  setCustomerField: (field: "name" | "email" | "phone" | "notes", value: string) => void;
  submitIntake: () => void;
  confirmBooking: () => void;
  satisfyPayment: () => void;
};

type CalendarCell = {
  key: string;
  dayNumber: number;
  dateKey?: string;
  available: boolean;
  selected: boolean;
  outsideMonth: boolean;
};

type SlotPresentation = {
  slot: BookableSlot;
  label: string;
  sublabel: string;
  selected: boolean;
};

const BookingPageContext = createContext<BookingPageContextValue | null>(null);

function useBookingPage() {
  const value = useContext(BookingPageContext);
  if (!value) throw new Error("Scheduling booking page context is unavailable.");
  return value;
}

export function SchedulingBookingPageProvider(props: {
  scenario?: SchedulingFixtureScenario | null;
  children: ReactNode;
}) {
  const scenario =
    props.scenario ??
    resolveSchedulingFixtureScenario({
      pathname: typeof window === "undefined" ? "/book/demo-provider" : window.location.pathname,
      search: typeof window === "undefined" ? "?fixture=public-booking" : window.location.search,
    } as Location);
  const live = !isFixtureMode();
  const liveContext = loadLiveContext();
  const fixturePreferredSlot =
    scenario.slots?.find((slot) => slot.displayLabel.includes("Fri May 16, 10:00 AM")) ??
    scenario.slots?.find((slot) => slot.displayLabel.includes("10:00 AM")) ??
    scenario.slots?.[0];
  const [providerName, setProviderName] = useState(scenario.providerName ?? liveContext.providerName ?? "Emma Brown");
  const [providerSlug, setProviderSlug] = useState(scenario.providerSlug ?? liveContext.providerSlug);
  const [providerTimeZone, setProviderTimeZone] = useState(scenario.providerTimeZone ?? liveContext.providerTimeZone ?? browserTimeZone());
  const [providerDescription, setProviderDescription] = useState(
    live ? "Public booking with the existing Leviathan local-dev backend flow." : "Office Hours",
  );
  const [services, setServices] = useState<SchedulingService[]>(
    live ? [] : scenario.services ?? [],
  );
  const [selectedServiceId, setSelectedServiceId] = useState<string | undefined>(
    live
      ? undefined
      : scenario.services?.find((service) => service.durationMinutes === 30)?.id.value ?? scenario.services?.[0]?.id.value,
  );
  const [slots, setSlots] = useState<BookableSlot[]>(live ? [] : scenario.slots ?? []);
  const [selectedDateKey, setSelectedDateKey] = useState<string | undefined>(
    live ? undefined : fixturePreferredSlot ? dateKeyForSlot(fixturePreferredSlot) : undefined,
  );
  const [selectedSlotKey, setSelectedSlotKey] = useState<string | undefined>(
    live ? undefined : fixturePreferredSlot ? slotKey(fixturePreferredSlot) : undefined,
  );
  const [hold, setHold] = useState<HoldResponse | null>(
    live
      ? null
      : scenario.booking
        ? {
            holdId: "fixture-hold",
            claimToken: "fixture-claim",
            expiresAt: "2025-05-16T17:15:00Z",
            status: "held",
            paymentRequirementStatus: scenario.booking.paymentStatus ?? scenario.booking.paymentRequirementStatus,
            paymentReference: scenario.booking.paymentReference,
            paymentSatisfiedAt: scenario.booking.paymentSatisfiedAt,
          }
        : null,
  );
  const [booking, setBooking] = useState<Booking | null>(live ? null : scenario.booking ?? null);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(live ? undefined : scenario.errorMessage);
  const [busy, setBusy] = useState<string | null>(null);
  const [customer, setCustomer] = useState(live ? defaultCustomer : fixtureCustomer);
  const [activeMonthKey, setActiveMonthKey] = useState<string | undefined>();

  useEffect(() => {
    if (!live) return;
    const slug = providerSlugFromPath();
    if (!slug) return;
    void (async () => {
      try {
        const [provider, liveServices] = await Promise.all([getPublicProvider(slug), getPublicServices(slug)]);
        setProviderName(provider.displayName);
        setProviderSlug(provider.slug);
        setProviderTimeZone(provider.timeZoneId);
        setProviderDescription(provider.publicDescription?.trim() || "Public booking with the existing Leviathan local-dev backend flow.");
        setServices(liveServices.map((service) => ({ ...service, isPublic: true })));
        setSelectedServiceId((current) =>
          liveServices.some((service) => service.id.value === current) ? current : liveServices[0]?.id.value,
        );
        saveLiveContext({
          providerId: provider.id.value,
          providerSlug: provider.slug,
          providerName: provider.displayName,
          providerTimeZone: provider.timeZoneId,
          serviceId: liveServices[0]?.id.value,
        });
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    })();
  }, [live]);

  useEffect(() => {
    if (!live || !selectedServiceId) return;
    const slug = providerSlugFromPath();
    if (!slug) return;
    void (async () => {
      try {
        const from = new Date();
        const to = new Date(from.getTime() + 21 * 24 * 60 * 60 * 1000);
        const liveSlots = await listSlots(slug, selectedServiceId, from.toISOString(), to.toISOString(), browserTimeZone());
        setSlots(liveSlots);
        setErrorMessage(undefined);
        setHold(null);
        setBooking(null);
        setSelectedSlotKey(undefined);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    })();
  }, [live, selectedServiceId]);

  const selectedService = services.find((service) => service.id.value === selectedServiceId) ?? services[0];
  const serviceSlots = slots
    .filter((slot) => !selectedServiceId || slot.serviceId === selectedServiceId)
    .sort((left, right) => left.startsAtUtc.localeCompare(right.startsAtUtc));
  const availableDates = buildAvailableDates(serviceSlots);
  const selectedDate = selectedDateKey && availableDates.some((entry) => entry.dateKey === selectedDateKey)
    ? selectedDateKey
    : availableDates[0]?.dateKey;
  const months = buildMonthOptions(availableDates);
  const resolvedMonthKey = activeMonthKey && months.some((entry) => entry.monthKey === activeMonthKey)
    ? activeMonthKey
    : selectedDate
      ? selectedDate.slice(0, 7)
      : months[0]?.monthKey;
  const monthIndex = months.findIndex((entry) => entry.monthKey === resolvedMonthKey);
  const slotGroups = serviceSlots
    .filter((slot) => !selectedDate || dateKeyForSlot(slot) === selectedDate)
    .map((slot) => ({
      slot,
      label: timeLabelForSlot(slot),
      sublabel: slot.displayStartsAtLocal,
      selected: selectedSlotKey === slotKey(slot),
    }));
  const selectedSlot = serviceSlots.find((slot) => slotKey(slot) === selectedSlotKey);
  const calendarWeeks = buildCalendarWeeks(resolvedMonthKey, availableDates, selectedDate);
  const monthLabel = monthLabelForKey(resolvedMonthKey);
  const dayHeadline = selectedSlot
    ? longDateLabelForSlot(selectedSlot)
    : selectedDate
      ? longDateLabelForDateKey(selectedDate)
      : "Choose a day";
  const timezoneLabel = selectedSlot?.displayTimeZoneId ?? serviceSlots[0]?.displayTimeZoneId ?? providerTimeZone;
  const paymentAlertText = isPaymentRequiredError(errorMessage)
    ? "Payment is required before confirmation. Use the fake/local satisfy action, then continue to confirmation."
    : hold?.paymentRequirementStatus === "payment_required"
      ? "Payment is still required before confirmation."
      : undefined;
  const stepIndex: 0 | 1 | 2 = selectedSlot ? 1 : 0;

  useEffect(() => {
    if (selectedDate !== selectedDateKey) setSelectedDateKey(selectedDate);
    if (resolvedMonthKey !== activeMonthKey) setActiveMonthKey(resolvedMonthKey);
  }, [activeMonthKey, resolvedMonthKey, selectedDate, selectedDateKey]);

  async function selectLiveSlot(slot: BookableSlot) {
    try {
      setBusy("hold");
      setErrorMessage(undefined);
      setBooking(null);
      const created = await createHold(slot);
      setHold(created);
      setSelectedSlotKey(slotKey(slot));
      saveLiveContext({ providerId: slot.providerId, serviceId: slot.serviceId });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function submitLiveIntake() {
    if (!hold) return;
    try {
      setBusy("intake");
      setErrorMessage(undefined);
      const updated = await submitIntake(hold.holdId, hold.claimToken, customer);
      setHold(updated);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function confirmLiveBooking() {
    if (!hold) return;
    try {
      setBusy("confirm");
      setErrorMessage(undefined);
      const confirmed = await confirmBooking(hold.holdId, hold.claimToken, customer);
      setBooking(confirmed);
      saveLiveContext({ bookingId: confirmed.id.value });
      if (typeof window !== "undefined") {
        window.location.assign(linkWithCurrentQuery(`/book/${providerSlugFromPath()}/confirmed/${confirmed.id.value}`));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function satisfyLivePayment() {
    if (!hold) return;
    try {
      setBusy("payment");
      setErrorMessage(undefined);
      const payment = await fakeSatisfyPayment(hold.holdId, hold.claimToken);
      setHold({
        ...hold,
        paymentRequirementStatus: payment.paymentRequirementStatus,
        paymentReference: payment.paymentReference,
        paymentSatisfiedAt: payment.paymentSatisfiedAt,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  const value: BookingPageContextValue = {
    live,
    scenario,
    providerName,
    providerRole: live ? "Public booking" : "Office Hours",
    providerDescription,
    providerSlug,
    providerTimeZone,
    providerAvailabilityLabel: live ? "Available through local-dev availability" : "Available this week",
    services,
    selectedService,
    selectedServiceId,
    selectedServiceDurationLabel: selectedService ? `${selectedService.durationMinutes} min` : "Duration unavailable",
    serviceLocationLabel: "Google Meet",
    servicePriceLabel: servicePriceLabel(selectedService, hold),
    selectedDateKey: selectedDate,
    selectedSlot,
    hold,
    booking,
    busy,
    errorMessage,
    customer,
    monthLabel,
    monthCanGoPrevious: monthIndex > 0,
    monthCanGoNext: monthIndex >= 0 && monthIndex < months.length - 1,
    calendarWeeks,
    dayHeadline,
    slotGroups,
    timezoneLabel,
    intakeReady: !!selectedSlot,
    hasPaymentAlert: !!paymentAlertText,
    paymentAlertText,
    stepIndex,
    whatToExpectLines: [
      "We’ll meet on Google Meet.",
      live ? "This path still uses Leviathan’s real Scheduling backend flow." : "You’ll receive a calendar invite with a link.",
    ],
    trustNotes: live
      ? ["No account required", "Fake/local payment only. No real provider is connected."]
      : ["No account required", "You can reschedule later from your confirmation email."],
    selectService: (serviceId) => {
      setSelectedServiceId(serviceId);
      setSelectedSlotKey(undefined);
      setSelectedDateKey(undefined);
      setHold(live ? null : hold);
      setErrorMessage(undefined);
    },
    selectDate: (dateKey) => {
      setSelectedDateKey(dateKey);
      setSelectedSlotKey(undefined);
      if (live) {
        setHold(null);
        setBooking(null);
      }
    },
    selectSlot: (slot) => {
      setSelectedDateKey(dateKeyForSlot(slot));
      if (live) {
        void selectLiveSlot(slot);
        return;
      }
      setSelectedSlotKey(slotKey(slot));
      setHold((current) =>
        current ?? {
          holdId: "fixture-hold",
          claimToken: "fixture-claim",
          expiresAt: slot.endsAtUtc,
          status: "held",
          paymentRequirementStatus: scenario.errorMessage === "payment_required" ? "payment_required" : "not_required",
        },
      );
      setBooking(scenario.booking ?? null);
    },
    clearSelection: () => {
      setSelectedSlotKey(undefined);
      if (live) {
        setHold(null);
        setBooking(null);
      }
    },
    setCustomerField: (field, value) => setCustomer((current) => ({ ...current, [field]: value })),
    submitIntake: () => {
      if (live) {
        void submitLiveIntake();
      }
    },
    confirmBooking: () => {
      if (live) {
        void confirmLiveBooking();
      }
    },
    satisfyPayment: () => {
      if (live) {
        void satisfyLivePayment();
      }
    },
  };

  return <BookingPageContext.Provider value={value}>{props.children}</BookingPageContext.Provider>;
}

export function SchedulingHeroView(props: SlotProps) {
  const scenario = scenarioFrom(props);
  if (!isFixtureMode()) return <LiveSchedulingHero />;
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
  if (!isFixtureMode()) return <LiveSchedulingMain />;

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
  if (!isFixtureMode()) return <LiveSchedulingSidebar />;
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

export function BookingHeaderView(props: SlotProps) {
  void props;
  return (
    <header className="scheduling-booking-header">
      <a className="scheduling-booking-brand" href={linkWithCurrentQuery("/apps/scheduling")}>
        <span className="scheduling-booking-brand-mark" aria-hidden="true">
          L
        </span>
        <span>Leviathan Scheduling</span>
      </a>
      <div className="scheduling-booking-header-actions">
        <a className="scheduling-booking-header-button" href={linkWithCurrentQuery("/apps/scheduling")}>
          Help
        </a>
        <a className="scheduling-booking-header-button" href={linkWithCurrentQuery("/apps")}>
          Back to apps
        </a>
        <button aria-label="Theme toggle placeholder" className="scheduling-booking-header-icon" disabled type="button">
          ◐
        </button>
      </div>
    </header>
  );
}

export function BookingSummaryPanelView(props: SlotProps) {
  void props;
  const page = useBookingPage();
  const service = page.selectedService;

  return (
    <section className="scheduling-booking-summary">
      <div className="scheduling-provider-head">
        <div className="scheduling-provider-avatar" aria-hidden="true">
          {initialsOf(page.providerName)}
        </div>
        <div>
          <h2>{page.providerName}</h2>
          <p>{page.providerRole}</p>
          <span className="status-chip status-chip-confirmed">{page.providerAvailabilityLabel}</span>
        </div>
      </div>

      <div className="scheduling-booking-summary-block">
        <h3>{service?.name ?? "Choose a service"}</h3>
        <p>{service?.description ?? page.providerDescription}</p>
      </div>

      <dl className="scheduling-booking-meta">
        <div>
          <dt>Duration</dt>
          <dd>{page.selectedServiceDurationLabel}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{page.serviceLocationLabel}</dd>
        </div>
        <div>
          <dt>Timezone</dt>
          <dd>{page.providerTimeZone}</dd>
        </div>
        <div>
          <dt>Price</dt>
          <dd>{page.servicePriceLabel}</dd>
        </div>
      </dl>

      <ol className="scheduling-booking-steps">
        {["Select a time", "Enter details", "Confirm booking"].map((label, index) => (
          <li className={page.stepIndex === index ? "is-active" : page.stepIndex > index ? "is-complete" : ""} key={label}>
            <span>{index + 1}</span>
            <strong>{label}</strong>
          </li>
        ))}
      </ol>

      <aside className="scheduling-booking-callout" role="note">
        <h3>What to expect</h3>
        {page.whatToExpectLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </aside>

      <div className="scheduling-booking-trust">
        {page.trustNotes.map((note) => (
          <p key={note}>{note}</p>
        ))}
      </div>
    </section>
  );
}

export function BookingMainHeaderView(props: SlotProps) {
  void props;
  const page = useBookingPage();

  return (
    <section className="scheduling-booking-main-header">
      <div>
        <h2>Choose a date and time</h2>
        <p>Times shown in {page.timezoneLabel}</p>
      </div>
      <div className="scheduling-duration-picker" role="tablist" aria-label="Available durations">
        {page.services.map((service) => (
          <button
            aria-selected={page.selectedServiceId === service.id.value}
            className={page.selectedServiceId === service.id.value ? "is-selected" : ""}
            key={service.id.value}
            onClick={() => page.selectService(service.id.value)}
            role="tab"
            type="button"
          >
            {service.durationMinutes}m
          </button>
        ))}
      </div>
    </section>
  );
}

export function BookingCalendarRegionView(props: SlotProps) {
  void props;
  const page = useBookingPage();

  return (
    <section className="scheduling-booking-calendar">
      <div className="scheduling-booking-calendar-head">
        <button disabled={!page.monthCanGoPrevious} type="button">
          ‹
        </button>
        <h3>{page.monthLabel}</h3>
        <button disabled={!page.monthCanGoNext} type="button">
          ›
        </button>
      </div>
      <div className="scheduling-booking-weekdays">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="scheduling-booking-calendar-grid">
        {page.calendarWeeks.flat().map((cell) =>
          cell.dateKey ? (
            <button
              className={[
                "scheduling-booking-day",
                cell.available ? "is-available" : "",
                cell.selected ? "is-selected" : "",
                cell.outsideMonth ? "is-outside" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={!cell.available}
              key={cell.key}
              onClick={() => page.selectDate(cell.dateKey!)}
              type="button"
            >
              <span>{cell.dayNumber}</span>
            </button>
          ) : (
            <span className="scheduling-booking-day is-empty" key={cell.key} />
          ),
        )}
      </div>
      <p className="scheduling-booking-timezone-note">Times shown in {page.timezoneLabel}</p>
    </section>
  );
}

export function BookingSlotsRegionView(props: SlotProps) {
  void props;
  const page = useBookingPage();
  const showIntake = !!page.selectedSlot;

  return (
    <section className="scheduling-booking-slots">
      <h3>{page.dayHeadline}</h3>

      {page.errorMessage && !page.hasPaymentAlert ? (
        <p className="error" role="alert">
          {controlledSchedulingError(page.errorMessage)}
        </p>
      ) : null}

      <div className="scheduling-booking-slot-list">
        {page.slotGroups.map((entry) => (
          <button
            className={entry.selected ? "is-selected" : ""}
            data-testid={entry.selected ? "public-selected-slot" : "public-slot-option"}
            key={slotKey(entry.slot)}
            onClick={() => page.selectSlot(entry.slot)}
            type="button"
          >
            <strong>{entry.label}</strong>
            <span>{entry.sublabel}</span>
            {entry.selected ? <span aria-hidden="true">✓</span> : null}
          </button>
        ))}
        {!page.slotGroups.length ? <p>No available times for this day yet.</p> : null}
      </div>

      {showIntake ? (
        <article className="scheduling-booking-intake">
          <label>
            Your name
            <input
              data-testid="public-intake-name"
              onChange={(event) => page.setCustomerField("name", event.target.value)}
              placeholder="e.g., Alex Johnson"
              value={page.customer.name}
            />
          </label>
          <label>
            Email
            <input
              data-testid="public-intake-email"
              onChange={(event) => page.setCustomerField("email", event.target.value)}
              placeholder="e.g., alex@example.com"
              value={page.customer.email}
            />
          </label>
          <label>
            Phone
            <input onChange={(event) => page.setCustomerField("phone", event.target.value)} placeholder="Optional" value={page.customer.phone} />
          </label>
          <label>
            Notes <span className="scheduling-inline-note">(optional)</span>
            <textarea onChange={(event) => page.setCustomerField("notes", event.target.value)} placeholder="Anything we should know?" value={page.customer.notes} />
          </label>

          {page.hasPaymentAlert ? (
            <p className="error" data-testid="public-payment-required" role="alert">
              {page.paymentAlertText}
            </p>
          ) : null}

          <div className="scheduling-booking-intake-actions">
            <button
              data-testid="public-submit-intake"
              disabled={page.live ? !page.hold || !!page.busy : true}
              onClick={() => page.submitIntake()}
              type="button"
            >
              {page.busy === "intake" ? "Saving details…" : "Save details"}
            </button>
            <button
              data-testid="public-confirm-booking"
              disabled={page.live ? !page.hold || !!page.busy : true}
              onClick={() => page.confirmBooking()}
              type="button"
            >
              {page.busy === "confirm" ? "Continuing…" : "Continue to confirmation"}
            </button>
          </div>

          {page.live ? (
            <button
              className="scheduling-booking-ghost-button"
              data-testid="public-fake-satisfy-payment"
              disabled={!page.hold || !!page.busy}
              onClick={() => page.satisfyPayment()}
              type="button"
            >
              {page.busy === "payment" ? "Satisfying fake/local payment…" : "Satisfy fake/local payment"}
            </button>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}

export function BookingFooterSummaryView(props: SlotProps) {
  void props;
  const page = useBookingPage();

  return (
    <section className="scheduling-booking-footer" data-testid="public-hold-state">
      <div className="scheduling-booking-footer-main">
        <div className="scheduling-provider-avatar is-small" aria-hidden="true">
          {initialsOf(page.providerName)}
        </div>
        <div>
          <strong>{page.providerName}</strong>
          <p>
            {page.selectedService?.name ?? "Choose a service"}
            {page.selectedSlot ? ` · ${longDateLabelForSlot(page.selectedSlot)} · ${page.serviceLocationLabel}` : " · Select a time to continue"}
          </p>
        </div>
      </div>
      <dl className="scheduling-booking-footer-state">
        <div>
          <dt>Hold id:</dt>
          <dd>{page.hold?.holdId ?? "none"}</dd>
        </div>
        <div>
          <dt>Hold status:</dt>
          <dd>{page.hold?.status ?? "none"}</dd>
        </div>
        <div>
          <dt>Payment reference:</dt>
          <dd>{page.hold?.paymentReference ?? "none"}</dd>
        </div>
      </dl>
      <button disabled={!page.selectedSlot} onClick={() => page.clearSelection()} type="button">
        Cancel selection
      </button>
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
          {paymentSummaryLabel(booking) ? <StatusChip tone={chipToneForValue(paymentToneValue(booking))} label={paymentSummaryLabel(booking)!} /> : null}
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
                      {paymentSummaryLabel(booking) ? (
                        <StatusChip tone={chipToneForValue(paymentToneValue(booking))} label={paymentSummaryLabel(booking)!} />
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
          {lifecycle?.paymentStatus || lifecycle?.paymentRequirementStatus ? (
            <StatusChip tone={chipToneForValue(lifecycle.paymentStatus ?? lifecycle.paymentRequirementStatus ?? "not_required")} label={paymentStatusLabel(lifecycle.paymentStatus ?? lifecycle.paymentRequirementStatus ?? "not_required")} />
          ) : null}
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
  const serviceName =
    scenario.services?.find((service) => service.id.value === booking?.serviceId?.value)?.name ??
    scenario.services?.find((service) => service.durationMinutes === 30)?.name ??
    "30 min Intro Call";
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
        {paymentSummaryLabel(booking) ? <StatusChip tone={chipToneForValue(paymentToneValue(booking))} label={paymentSummaryLabel(booking)!} /> : null}
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
      {booking.paymentPolicyLabel || booking.paymentPolicySnapshot || booking.paymentReference ? (
        <article className={compact ? "" : "card"}>
          <h4>Payment</h4>
          {booking.paymentPolicyLabel ? <p>{booking.paymentPolicyLabel}</p> : null}
          {booking.paymentPolicySnapshot && !booking.paymentPolicyLabel ? <p>{paymentRequirementLabel(booking.paymentRequirementStatus)}</p> : null}
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

function LiveSchedulingHero() {
  return (
    <section className="panel scheduling-shell scheduling-shell-hero">
      <div className="scheduling-eyebrow-row">
        <span className="scheduling-eyebrow">Scheduling real-backend smoke</span>
        <span className="scheduling-route-badge">{liveRouteLabel()}</span>
      </div>
      <h1>{liveRouteTitle()}</h1>
      <p className="scheduling-hero-copy">Fixture mode is off for this route. The UI below is talking to the live ASP.NET Scheduling backend through the existing local-dev path.</p>
      <div className="scheduling-chip-row">
        <StatusChip tone="confirmed" label="real backend" />
        <StatusChip tone="warning" label="unsafe local-dev admin" />
        <StatusChip tone="info" label="Machina layout driven" />
      </div>
    </section>
  );
}

function LiveSchedulingMain() {
  if (pathname().startsWith("/apps/scheduling/setup")) return <LiveProviderSetupView />;
  if (pathname().startsWith("/apps/scheduling/bookings")) return <LiveProviderBookingsView />;
  if (pathname().includes("/confirmed/")) return <LiveConfirmationView />;
  if (pathname().startsWith("/book/")) return <LivePublicBookingView />;
  return <LiveSchedulingLandingView />;
}

function LiveSchedulingSidebar() {
  const liveContext = loadLiveContext();
  const publicLink = liveContext.providerSlug ? linkWithCurrentQuery(`/book/${liveContext.providerSlug}`) : null;
  const bookingsLink = liveContext.providerId ? linkWithCurrentQuery(`/apps/scheduling/bookings?providerId=${encodeURIComponent(liveContext.providerId)}`) : linkWithCurrentQuery("/apps/scheduling/bookings");

  return (
    <section className="panel scheduling-shell scheduling-shell-sidebar">
      <div className="scheduling-stack">
        <section className="scheduling-subpanel">
          <h2>Smoke flow</h2>
          <ul className="scheduling-checklist">
            <li>Create provider, resource, service, and availability with the unsafe local-dev admin path.</li>
            <li>Use the public booking route to create a hold, submit intake, satisfy fake/local payment, and confirm.</li>
            <li>Inspect provider bookings, lifecycle, audit events, and cancellation from the same live backend data.</li>
          </ul>
        </section>

        <section className="scheduling-subpanel">
          <h2>Current links</h2>
          <div className="scheduling-action-grid">
            <article className="card scheduling-action-card">
              <p className="scheduling-card-kicker">Setup</p>
              <a className="scheduling-inline-link" href={linkWithCurrentQuery("/apps/scheduling/setup")}>
                Open setup
              </a>
            </article>
            {publicLink ? (
              <article className="card scheduling-action-card">
                <p className="scheduling-card-kicker">Public booking</p>
                <a className="scheduling-inline-link" data-testid="live-sidebar-public-link" href={publicLink}>
                  Open booking link
                </a>
              </article>
            ) : null}
            <article className="card scheduling-action-card">
              <p className="scheduling-card-kicker">Provider bookings</p>
              <a className="scheduling-inline-link" href={bookingsLink}>
                Open bookings
              </a>
            </article>
          </div>
        </section>

        {liveContext.providerId ? (
          <section className="scheduling-subpanel">
            <h2>Live context</h2>
            <ul className="scheduling-checklist scheduling-checklist-tight">
              <li>Provider id: {liveContext.providerId}</li>
              <li>Provider slug: {liveContext.providerSlug ?? "unknown"}</li>
              <li>Service id: {liveContext.serviceId ?? "not created yet"}</li>
              <li>Booking id: {liveContext.bookingId ?? "not confirmed yet"}</li>
            </ul>
          </section>
        ) : null}
      </div>
    </section>
  );
}

function LiveSchedulingLandingView() {
  return (
    <div className="scheduling-stack">
      <section className="scheduling-subpanel">
        <h2>Scheduling real-backend smoke</h2>
        <p>This route is ready for live backend verification. Start on provider setup, then follow the generated public booking link through hold, intake, payment-required, confirmation, and provider bookings.</p>
        <AdminModeBanner />
      </section>
      <section className="scheduling-subpanel">
        <h2>Next step</h2>
        <a className="scheduling-inline-link" data-testid="live-open-setup" href={linkWithCurrentQuery("/apps/scheduling/setup")}>
          Open provider setup
        </a>
      </section>
    </div>
  );
}

function LiveProviderSetupView() {
  const [context, setContext] = useState<LocalDevPlatformContext | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [busyStep, setBusyStep] = useState<string | null>(null);
  const [provider, setProvider] = useState(loadLiveContext().providerId ? { id: { value: loadLiveContext().providerId! }, slug: loadLiveContext().providerSlug ?? defaultProviderSlug, displayName: loadLiveContext().providerName ?? "M24 Smoke Provider", timeZoneId: loadLiveContext().providerTimeZone ?? browserTimeZone() } : null);
  const [resource, setResource] = useState<BookableResource | null>(null);
  const [service, setService] = useState<SchedulingService | null>(null);
  const [availabilityRule, setAvailabilityRule] = useState<AvailabilityRule | null>(null);
  const providerTimeZone = provider?.timeZoneId ?? loadLiveContext().providerTimeZone ?? browserTimeZone();
  const publicLink = provider?.slug ? linkWithCurrentQuery(`/book/${provider.slug}`) : null;

  useEffect(() => {
    void getLocalDevContext()
      .then((value) => {
        setContext(value);
        setErrorMessage(undefined);
      })
      .catch((error) => setErrorMessage(error instanceof Error ? error.message : String(error)));
  }, []);

  async function runStep(step: "provider" | "resource" | "service" | "availability") {
    try {
      setBusyStep(step);
      setErrorMessage(undefined);

      if (step === "provider") {
        const created = await createProvider({
          slug: defaultProviderSlug,
          displayName: "M24 Smoke Provider",
          timeZoneId: providerTimeZone,
          contactEmail: "provider-smoke@example.test",
          publicDescription: "M24 real-backend smoke provider.",
        });
        setProvider(created);
        saveLiveContext({
          providerId: created.id.value,
          providerSlug: created.slug,
          providerName: created.displayName,
          providerTimeZone: created.timeZoneId,
        });
        return;
      }

      const liveContext = loadLiveContext();
      const providerId = provider?.id.value ?? liveContext.providerId;
      if (!providerId) throw new Error("Create provider first.");

      if (step === "resource") {
        const created = await createResource({
          providerId,
          displayName: "M24 Smoke Resource",
          resourceType: "person",
          timeZoneId: providerTimeZone,
        });
        setResource(created);
        saveLiveContext({ providerId, resourceId: created.id.value });
        return;
      }

      const resourceId = resource?.id.value ?? liveContext.resourceId;
      if (!resourceId) throw new Error("Create resource first.");

      if (step === "service") {
        const created = await createService({
          providerId,
          name: "30 minute consult",
          description: "Live backend smoke service with fake/local payment and notification policy.",
          durationMinutes: 30,
          paymentPolicy: livePaymentPolicy,
          notificationPolicy: liveNotificationPolicy,
        });
        const assigned = await assignResourceToService(created.id.value, providerId, resourceId);
        setService(assigned);
        saveLiveContext({ providerId, resourceId, serviceId: assigned.id.value });
        return;
      }

      const serviceId = service?.id.value ?? liveContext.serviceId;
      if (!serviceId) throw new Error("Create service first.");
      void serviceId;
      const created = await createAvailabilityRule({
        providerId,
        resourceId,
        timeZoneId: providerTimeZone,
        daysOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        localStartTime: "09:00",
        localEndTime: "17:00",
      });
      setAvailabilityRule(created);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyStep(null);
    }
  }

  return (
    <div className="scheduling-stack">
      <section className="scheduling-subpanel">
        <h2>Provider setup</h2>
        <p>This real-backend flow uses the existing local-dev admin endpoints with stable defaults for smoke coverage.</p>
        <AdminModeBanner errorMessage={errorMessage} />
        {context ? <OwnershipSummary localDevContext={context} /> : null}
        {errorMessage && !isUnsafeAdminError(errorMessage) ? (
          <p className="error" role="alert">
            {controlledSchedulingError(errorMessage)}
          </p>
        ) : null}
      </section>

      <section className="scheduling-two-column">
        <article className="card scheduling-setup-card">
          <h3>Stable defaults</h3>
          <dl className="scheduling-definition-list">
            <dt>Provider slug</dt>
            <dd>
              <code>{defaultProviderSlug}</code>
            </dd>
            <dt>Display timezone</dt>
            <dd>
              <code>{providerTimeZone}</code>
            </dd>
            <dt>Public booking link</dt>
            <dd>{publicLink ? <a className="scheduling-inline-link" data-testid="setup-public-link" href={publicLink}>{publicLink}</a> : "Created after provider setup."}</dd>
          </dl>
        </article>

        <article className="card scheduling-setup-card">
          <h3>Setup actions</h3>
          <ol className="scheduling-sequence">
            <li>
              <button data-testid="setup-create-provider" disabled={!!busyStep || !!provider} onClick={() => void runStep("provider")}>
                {busyStep === "provider" ? "Creating provider…" : provider ? "Provider created" : "Create provider"}
              </button>
            </li>
            <li>
              <button data-testid="setup-create-resource" disabled={!!busyStep || !provider || !!resource} onClick={() => void runStep("resource")}>
                {busyStep === "resource" ? "Creating resource…" : resource ? "Resource created" : "Create resource"}
              </button>
            </li>
            <li>
              <button data-testid="setup-create-service" disabled={!!busyStep || !resource || !!service} onClick={() => void runStep("service")}>
                {busyStep === "service" ? "Creating service…" : service ? "Service created" : "Create service"}
              </button>
            </li>
            <li>
              <button data-testid="setup-create-availability" disabled={!!busyStep || !service || !!availabilityRule} onClick={() => void runStep("availability")}>
                {busyStep === "availability" ? "Creating availability…" : availabilityRule ? "Availability created" : "Create availability"}
              </button>
            </li>
          </ol>
        </article>
      </section>

      <section className="scheduling-subpanel">
        <h2>Created entities</h2>
        <ul className="scheduling-checklist">
          <li>Provider: {provider ? provider.id.value : "pending"}</li>
          <li>Resource: {resource ? resource.id.value : "pending"}</li>
          <li>Service: {service ? service.id.value : "pending"}</li>
          <li>Availability rule: {availabilityRule ? availabilityRule.id.value : "pending"}</li>
        </ul>
      </section>
    </div>
  );
}

function LivePublicBookingView() {
  const slug = providerSlugFromPath();
  const [providerName, setProviderName] = useState<string>();
  const [services, setServices] = useState<SchedulingService[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>();
  const [slots, setSlots] = useState<BookableSlot[]>([]);
  const [hold, setHold] = useState<HoldResponse | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [busy, setBusy] = useState<string | null>(null);
  const [customer, setCustomer] = useState(defaultCustomer);

  useEffect(() => {
    if (!slug) return;
    void (async () => {
      try {
        const [provider, liveServices] = await Promise.all([
          getPublicProvider(slug),
          getPublicServices(slug),
        ]);
        setProviderName(provider.displayName);
        setServices(liveServices);
        setSelectedServiceId(liveServices[0]?.id.value);
        saveLiveContext({
          providerId: provider.id.value,
          providerSlug: provider.slug,
          providerName: provider.displayName,
          providerTimeZone: provider.timeZoneId,
          serviceId: liveServices[0]?.id.value,
        });
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    })();
  }, [slug]);

  useEffect(() => {
    if (!slug || !selectedServiceId) return;
    void (async () => {
      try {
        const from = new Date();
        const to = new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);
        const liveSlots = await listSlots(slug, selectedServiceId, from.toISOString(), to.toISOString(), browserTimeZone());
        setSlots(liveSlots);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    })();
  }, [slug, selectedServiceId]);

  async function createLiveHold(slot: BookableSlot) {
    try {
      setBusy("hold");
      setErrorMessage(undefined);
      setBooking(null);
      const created = await createHold(slot);
      setHold(created);
      saveLiveContext({ providerId: slot.providerId, serviceId: slot.serviceId });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function submitLiveIntake() {
    if (!hold) return;
    try {
      setBusy("intake");
      setErrorMessage(undefined);
      const updated = await submitIntake(hold.holdId, hold.claimToken, customer);
      setHold(updated);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function confirmLiveBooking() {
    if (!hold) return;
    try {
      setBusy("confirm");
      setErrorMessage(undefined);
      const confirmed = await confirmBooking(hold.holdId, hold.claimToken, customer);
      setBooking(confirmed);
      saveLiveContext({ bookingId: confirmed.id.value });
      if (typeof window !== "undefined") {
        window.location.assign(linkWithCurrentQuery(`/book/${slug}/confirmed/${confirmed.id.value}`));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function satisfyLivePayment() {
    if (!hold) return;
    try {
      setBusy("payment");
      setErrorMessage(undefined);
      const payment = await fakeSatisfyPayment(hold.holdId, hold.claimToken);
      setHold({
        ...hold,
        paymentRequirementStatus: payment.paymentRequirementStatus,
        paymentReference: payment.paymentReference,
        paymentSatisfiedAt: payment.paymentSatisfiedAt,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="scheduling-stack">
      <SlotPickerView
        providerName={providerName}
        slots={slots}
        services={services.map((service) => ({ ...service, isPublic: true }))}
        errorMessage={errorMessage}
        nodeData={{ dispatch: (event) => {
          if ((event as { type?: string }).type === "scheduling.slot-selected") {
            void createLiveHold((event as { slot: BookableSlot }).slot);
          }
        } }}
      />

      <section className="scheduling-two-column">
        <article className="card">
          <h3>Intake</h3>
          <label>
            Name
            <input data-testid="public-intake-name" value={customer.name} onChange={(event) => setCustomer((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label>
            Email
            <input data-testid="public-intake-email" value={customer.email} onChange={(event) => setCustomer((current) => ({ ...current, email: event.target.value }))} />
          </label>
          <label>
            Phone
            <input value={customer.phone} onChange={(event) => setCustomer((current) => ({ ...current, phone: event.target.value }))} />
          </label>
          <label>
            Notes
            <textarea value={customer.notes} onChange={(event) => setCustomer((current) => ({ ...current, notes: event.target.value }))} />
          </label>
          <div className="scheduling-chip-row">
            <button data-testid="public-submit-intake" disabled={!hold || !!busy} onClick={() => void submitLiveIntake()}>
              {busy === "intake" ? "Submitting intake…" : "Submit intake"}
            </button>
            <button data-testid="public-confirm-booking" disabled={!hold || !!busy} onClick={() => void confirmLiveBooking()}>
              {busy === "confirm" ? "Confirming…" : "Confirm booking"}
            </button>
            <button data-testid="public-fake-satisfy-payment" disabled={!hold || !!busy} onClick={() => void satisfyLivePayment()}>
              {busy === "payment" ? "Satisfying payment…" : "Fake-satisfy payment"}
            </button>
          </div>
          {errorMessage && isPaymentRequiredError(errorMessage) ? (
            <p className="error" data-testid="public-payment-required" role="alert">
              Payment is required before confirmation. Use the fake/local satisfy action, then confirm again.
            </p>
          ) : null}
        </article>

        <article className="card" data-testid="public-hold-state">
          <h3>Current hold / confirmation state</h3>
          <ul className="scheduling-checklist scheduling-checklist-tight">
            <li>Hold id: {hold?.holdId ?? "none"}</li>
            <li>Hold status: {hold?.status ?? "none"}</li>
            <li>Payment requirement: {hold ? paymentRequirementLabel(hold.paymentRequirementStatus) : "unknown"}</li>
            <li>Payment reference: {hold?.paymentReference ?? "none"}</li>
            <li>Confirmed booking: {booking?.id.value ?? "not yet confirmed"}</li>
          </ul>
        </article>
      </section>
    </div>
  );
}

function LiveConfirmationView() {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
  const liveContext = loadLiveContext();

  useEffect(() => {
    const bookingId = bookingIdFromPath() ?? liveContext.bookingId;
    if (!bookingId) {
      setErrorMessage("Booking id is missing from the confirmation route.");
      return;
    }
    void getBooking(bookingId)
      .then((value) => {
        setBooking(value);
        saveLiveContext({ bookingId: value.id.value, providerId: value.providerId?.value });
      })
      .catch((error) => setErrorMessage(error instanceof Error ? error.message : String(error)));
  }, [liveContext.bookingId]);

  if (!booking) {
    return (
      <div className="scheduling-stack">
        <section className="scheduling-subpanel">
          <h2>Booking confirmed</h2>
          {errorMessage ? <p className="error" role="alert">{controlledSchedulingError(errorMessage)}</p> : <p>Loading booking confirmation…</p>}
        </section>
      </div>
    );
  }

  return (
    <div className="scheduling-stack">
      <ConfirmationView booking={booking} serviceName="30 minute consult" resourceName="M24 Smoke Resource" />
      <section className="scheduling-subpanel">
        <a className="scheduling-inline-link" data-testid="confirmation-open-bookings" href={linkWithCurrentQuery(`/apps/scheduling/bookings?providerId=${encodeURIComponent(booking.providerId?.value ?? liveContext.providerId ?? "")}&bookingId=${encodeURIComponent(booking.id.value)}`)}>
          Open provider bookings
        </a>
      </section>
    </div>
  );
}

function LiveProviderBookingsView() {
  const liveContext = loadLiveContext();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [auditEvents, setAuditEvents] = useState<BookingAuditEvent[]>([]);
  const [lifecycle, setLifecycle] = useState<SchedulingLifecycleSummary>();
  const [notifications, setNotifications] = useState<ScheduledNotification[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const providerId = queryValue("providerId") ?? liveContext.providerId;
  const requestedBookingId = queryValue("bookingId") ?? liveContext.bookingId;

  useEffect(() => {
    if (!providerId) {
      setErrorMessage("No live provider is available yet. Create one from provider setup first.");
      return;
    }
    void refreshBookings(providerId, requestedBookingId);
  }, [providerId, requestedBookingId]);

  async function refreshBookings(currentProviderId: string, preferredBookingId?: string) {
    try {
      setBusy(true);
      setErrorMessage(undefined);
      const nextBookings = await listProviderBookings(currentProviderId);
      setBookings(nextBookings);
      const nextSelected = nextBookings.find((booking) => booking.id.value === preferredBookingId) ?? nextBookings.at(-1) ?? null;
      setSelectedBooking(nextSelected);
      if (nextSelected) {
        await loadBookingDetail(currentProviderId, nextSelected.id.value);
        saveLiveContext({ providerId: currentProviderId, bookingId: nextSelected.id.value });
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function loadBookingDetail(currentProviderId: string, currentBookingId: string) {
    const [audit, liveLifecycle, liveNotifications] = await Promise.all([
      getBookingAudit(currentBookingId, currentProviderId),
      getBookingLifecycle(currentBookingId),
      getBookingNotifications(currentBookingId),
    ]);
    setAuditEvents(audit);
    setLifecycle(liveLifecycle);
    setNotifications(liveNotifications);
  }

  async function cancelSelectedBooking() {
    if (!selectedBooking) return;
    try {
      setBusy(true);
      setErrorMessage(undefined);
      const result = await cancelBooking(selectedBooking.id.value);
      setSelectedBooking(result.booking);
      setLifecycle(result.lifecycle);
      await refreshBookings(providerId!, result.booking.id.value);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scheduling-stack">
      <section className="scheduling-subpanel">
        <div className="scheduling-section-head">
          <div>
            <h2>Provider bookings</h2>
            <p>Live admin surface for lifecycle, audit, notification summary, and cancellation.</p>
          </div>
          <div className="scheduling-chip-row">
            <button data-testid="bookings-refresh" disabled={busy || !providerId} onClick={() => void refreshBookings(providerId!, selectedBooking?.id.value)}>
              {busy ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
        <AdminModeBanner errorMessage={errorMessage} />
        {errorMessage && !isUnsafeAdminError(errorMessage) ? <p className="error" role="alert">{controlledSchedulingError(errorMessage)}</p> : null}

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
                <tr key={booking.id.value} data-testid={`booking-row-${booking.id.value}`}>
                  <td><StatusChip tone={chipToneForValue(booking.status)} label={statusLabel(booking.status)} /></td>
                  <td><strong>{booking.customer.name}</strong><div>{booking.customer.email}</div></td>
                  <td>{booking.range?.startsAtUtc} {booking.range?.timeZoneId}</td>
                  <td>
                    <div className="scheduling-chip-row">
                      {paymentSummaryLabel(booking) ? <StatusChip tone={chipToneForValue(paymentToneValue(booking))} label={paymentSummaryLabel(booking)!} /> : null}
                      {notificationSummaryLabel(booking.notificationSummary) ? <StatusChip tone="info" label={notificationSummaryLabel(booking.notificationSummary)!} /> : null}
                    </div>
                  </td>
                  <td>
                    <button data-testid={`booking-select-${booking.id.value}`} onClick={() => { setSelectedBooking(booking); if (providerId) void loadBookingDetail(providerId, booking.id.value); }}>
                      Inspect
                    </button>
                    {booking.status === "confirmed" ? (
                      <button data-testid="booking-cancel" disabled={busy || selectedBooking?.id.value !== booking.id.value} onClick={() => void cancelSelectedBooking()}>
                        Cancel booking
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selectedBooking ? <BookingDebugPanel booking={selectedBooking} auditEvents={auditEvents} lifecycle={lifecycle} /> : null}

      {selectedBooking ? (
        <section className="scheduling-subpanel" data-testid="booking-notifications">
          <h3>Notifications</h3>
          {notifications.length ? (
            <ul className="scheduling-audit-list">
              {notifications.map((notification) => (
                <li key={notification.id.value}>
                  <strong>{notification.trigger}</strong> · {notification.status} · {notification.channel} · {notification.scheduledForUtc}
                </li>
              ))}
            </ul>
          ) : (
            <p>No booking notifications were recorded for this booking.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}

export function StatusChip({ tone, label }: { tone: "confirmed" | "warning" | "danger" | "info" | "neutral"; label: string }) {
  return <span className={`status-chip status-chip-${tone}`}>{label}</span>;
}

function slotKey(slot: BookableSlot) {
  return `${slot.resourceId}:${slot.serviceId}:${slot.startsAtUtc}`;
}

function dateKeyForSlot(slot: BookableSlot) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: slot.displayTimeZoneId || slot.timeZoneId || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(slot.startsAtUtc));
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function buildAvailableDates(slots: BookableSlot[]) {
  return Array.from(
    new Map(
      slots.map((slot) => {
        const dateKey = dateKeyForSlot(slot);
        return [
          dateKey,
          {
            dateKey,
            year: Number.parseInt(dateKey.slice(0, 4), 10),
            month: Number.parseInt(dateKey.slice(5, 7), 10),
            day: Number.parseInt(dateKey.slice(8, 10), 10),
          },
        ] as const;
      }),
    ).values(),
  ).sort((left, right) => left.dateKey.localeCompare(right.dateKey));
}

function buildMonthOptions(dates: Array<{ dateKey: string; year: number; month: number; day: number }>) {
  return Array.from(
    new Map(
      dates.map((entry) => [
        entry.dateKey.slice(0, 7),
        {
          monthKey: entry.dateKey.slice(0, 7),
          year: entry.year,
          month: entry.month,
        },
      ]),
    ).values(),
  ).sort((left, right) => left.monthKey.localeCompare(right.monthKey));
}

function buildCalendarWeeks(
  monthKey: string | undefined,
  dates: Array<{ dateKey: string; year: number; month: number; day: number }>,
  selectedDateKey?: string,
): CalendarCell[][] {
  if (!monthKey) return [];
  const year = Number.parseInt(monthKey.slice(0, 4), 10);
  const month = Number.parseInt(monthKey.slice(5, 7), 10);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekday = firstDay.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const availableSet = new Set(dates.map((entry) => entry.dateKey));
  const cells: CalendarCell[] = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push({ key: `empty-start-${index}`, dayNumber: 0, available: false, selected: false, outsideMonth: true });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${monthKey}-${String(day).padStart(2, "0")}`;
    cells.push({
      key: dateKey,
      dayNumber: day,
      dateKey,
      available: availableSet.has(dateKey),
      selected: selectedDateKey === dateKey,
      outsideMonth: false,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({
      key: `empty-end-${cells.length}`,
      dayNumber: 0,
      available: false,
      selected: false,
      outsideMonth: true,
    });
  }

  const weeks: CalendarCell[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

function monthLabelForKey(monthKey?: string) {
  if (!monthKey) return "Choose a month";
  const year = Number.parseInt(monthKey.slice(0, 4), 10);
  const month = Number.parseInt(monthKey.slice(5, 7), 10);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

function timeLabelForSlot(slot: BookableSlot) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: slot.displayTimeZoneId || slot.timeZoneId || "UTC",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(slot.startsAtUtc));
}

function longDateLabelForDateKey(dateKey: string) {
  const year = Number.parseInt(dateKey.slice(0, 4), 10);
  const month = Number.parseInt(dateKey.slice(5, 7), 10);
  const day = Number.parseInt(dateKey.slice(8, 10), 10);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function longDateLabelForSlot(slot: BookableSlot) {
  return `${longDateLabelForDateKey(dateKeyForSlot(slot))} at ${timeLabelForSlot(slot)}`;
}

function servicePriceLabel(service?: SchedulingService, hold?: HoldResponse | null) {
  const paymentMode = hold?.paymentRequirementStatus ?? service?.paymentPolicy?.paymentProviderMode;
  if (hold?.paymentRequirementStatus === "payment_required") return "Controlled fake/local payment";
  if (service?.paymentPolicy?.requiresPrepay || service?.paymentPolicy?.requiresDeposit) return "Controlled fake/local prepay";
  if (paymentMode === "fake/local") return "Controlled fake/local payment";
  return "Free";
}

function initialsOf(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function browserTimeZone() {
  return typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" : "UTC";
}

function chipToneForValue(value: string): "confirmed" | "warning" | "danger" | "info" | "neutral" {
  if (value === "confirmed" || value === "payment_satisfied_fake" || value === "sent_fake") return "confirmed";
  if (value === "cancelled") return "danger";
  if (value === "payment_required" || value === "pending_confirmation" || value === "required") return "warning";
  if (value === "satisfied") return "confirmed";
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
      : status === "required"
        ? "Payment required"
        : status === "satisfied"
          ? "Payment satisfied (fake/local)"
        : status === "not_required"
          ? "No payment required"
          : status;
}

function paymentRequirementLabel(status?: string) {
  return status ? paymentStatusLabel(status) : "No payment requirement recorded";
}

function paymentToneValue(booking: Booking) {
  return booking.paymentStatus ?? booking.paymentRequirementStatus ?? "not_required";
}

function paymentSummaryLabel(booking: Booking) {
  const value = booking.paymentStatus ?? booking.paymentRequirementStatus;
  return value ? paymentStatusLabel(value) : null;
}

function notificationSummaryLabel(summary?: NotificationSummary) {
  if (!summary) return null;
  if (summary.pending > 0) return `notifications pending ${summary.pending}`;
  if (summary.sentFake > 0) return `notifications sent fake ${summary.sentFake}`;
  if (summary.cancelled > 0) return `notifications cancelled ${summary.cancelled}`;
  return "notification summary";
}

function isPaymentRequiredError(message?: string) {
  return !!message && message.includes("payment_required");
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
