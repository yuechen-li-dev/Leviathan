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
  Provider,
  ReplacementHoldResponse,
  ScheduledNotification,
  SchedulingLifecycleSummary,
  SchedulingService,
} from "./types";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ModeToggle } from "@/components/mode-toggle";
import {
  assignResourceToService,
  cancelBooking,
  confirmBooking,
  createReplacementHold,
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
import {
  bookingActionLabels,
  bookingPrimaryStatusBody,
  bookingPrimaryStatusHeading,
  bookingRescheduleStateCopy,
  browserTimeZone,
  buildAvailableDates,
  buildMonthOptions,
  chipToneForValue,
  dateFromDateKey,
  dateKeyForDate,
  dateKeyForSlot,
  formatDateTimeRange,
  formatDurationMinutes,
  formatSlotSummary,
  formatTimestamp,
  hasLifecycleCheckpoint,
  hasRescheduleRelation,
  initialsOf,
  isBookingReschedulable,
  isPaymentRequiredError,
  lifecycleStateLabel,
  longDateLabelForDateKey,
  longDateLabelForSlot,
  monthDateFromMonthKey,
  monthKeyForDate,
  nextStepLinesForBooking,
  notificationSummaryLabel,
  paymentRequirementLabel,
  paymentStatusLabel,
  paymentSummaryLabel,
  paymentToneValue,
  servicePriceLabel,
  slotKey,
  slotMatchesBooking,
  statusLabel,
  timeLabelForSlot,
} from "./shared/format";

import {
  adminGateMessage,
  bookingIdFromPath,
  controlledSchedulingError,
  currentQueryString,
  defaultCustomer,
  defaultProviderSlug,
  fixtureCustomer,
  isFixtureMode,
  isOwnershipError,
  isUnsafeAdminError,
  linkWithCurrentQuery,
  liveNotificationPolicy,
  livePaymentPolicy,
  liveRouteLabel,
  liveRouteTitle,
  loadLiveContext,
  localDevAdminWarning,
  pathname,
  providerSlugFromPath,
  queryValue,
  saveLiveContext,
  type LiveSchedulingContext,
} from "./shared/liveContext";

type SlotProps = MachinaSlotProps<unknown, { dispatch?: (event: unknown) => void }>;
type DispatchNodeData = { dispatch?: (event: unknown) => void };
type SchedulingViewData = { scenario: SchedulingFixtureScenario };

import { AdminModeBanner, OwnershipSummary } from "./shared/AdminGateBanner";
import { LiveProviderSetupView } from "./setup/LiveProviderSetupView";
import { ProviderSetupView } from "./setup/ProviderSetupFlow";
import { SchedulingHomeView } from "./landing/SchedulingHomeView";
import { LiveSchedulingLandingView } from "./landing/LiveSchedulingLandingView";
import { ProviderBookingsView } from "./bookings/ProviderBookingsView";
import { LiveProviderBookingsView } from "./bookings/LiveProviderBookingsView";
import { BookingDebugPanel } from "./bookings/BookingDebugPanel";
import { ConfirmationSurfaceView } from "./confirmation/ConfirmationSurfaceView";
import { LiveConfirmationView } from "./confirmation/LiveConfirmationView";
import { BookingReschedulePanel } from "./confirmation/BookingReschedulePanel";
import { BookingStatusSummary } from "./shared/BookingStatusSummary";
import { BookingMetaPanels } from "./shared/BookingMetaPanels";
import { StatusChip } from "./shared/StatusChip";

function scenarioFrom(props: SlotProps): SchedulingFixtureScenario {
  return (props.viewData as SchedulingViewData).scenario;
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
  availableDateKeys: string[];
  calendarMonth?: Date;
  calendarStartMonth?: Date;
  calendarEndMonth?: Date;
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
  setCalendarMonth: (month: Date) => void;
  selectSlot: (slot: BookableSlot) => void;
  clearSelection: () => void;
  setCustomerField: (field: "name" | "email" | "phone" | "notes", value: string) => void;
  submitIntake: () => void;
  confirmBooking: () => void;
  satisfyPayment: () => void;
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
  const calendarMonth = monthDateFromMonthKey(resolvedMonthKey);
  const calendarStartMonth = monthDateFromMonthKey(months[0]?.monthKey);
  const calendarEndMonth = monthDateFromMonthKey(months.at(-1)?.monthKey);
  const slotGroups = serviceSlots
    .filter((slot) => !selectedDate || dateKeyForSlot(slot) === selectedDate)
    .map((slot) => ({
      slot,
      label: timeLabelForSlot(slot),
      sublabel: slot.displayStartsAtLocal,
      selected: selectedSlotKey === slotKey(slot),
    }));
  const selectedSlot = serviceSlots.find((slot) => slotKey(slot) === selectedSlotKey);
  const dayHeadline = selectedSlot
    ? longDateLabelForSlot(selectedSlot)
    : selectedDate
      ? longDateLabelForDateKey(selectedDate)
      : "Choose a day";
  const timezoneLabel = selectedSlot?.displayTimeZoneId ?? serviceSlots[0]?.displayTimeZoneId ?? providerTimeZone;
  const paymentAlertText = isPaymentRequiredError(errorMessage)
    ? "This booking requires controlled local/test payment satisfaction before confirmation."
    : hold?.paymentRequirementStatus === "payment_required"
      ? "This booking still needs controlled local/test payment satisfaction before confirmation."
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
    availableDateKeys: availableDates.map((entry) => entry.dateKey),
    calendarMonth,
    calendarStartMonth,
    calendarEndMonth,
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
      : ["No account required", "Notifications in fixture mode are policy-only, not real sends."],
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
    setCalendarMonth: (month) => {
      const monthKey = monthKeyForDate(month);
      if (months.some((entry) => entry.monthKey === monthKey)) {
        setActiveMonthKey(monthKey);
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
          availabilityRule={scenario.setupAvailabilityRule}
          errorMessage={scenario.errorMessage}
          providerSlug={scenario.providerSlug}
          provider={scenario.setupProvider}
          providerTimeZone={scenario.providerTimeZone}
          resource={scenario.setupResource}
          service={scenario.setupService}
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
          reschedulePanel={
            scenario.selectedBooking ? (
              <BookingReschedulePanel
                booking={scenario.rescheduleState?.oldBooking ?? scenario.selectedBooking}
                fixtureState={scenario.rescheduleState}
                providerSlug={scenario.providerSlug}
              />
            ) : undefined
          }
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

function BookingHeaderContent({ mobile = false }: { mobile?: boolean }) {
  const headerClassName = mobile ? "scheduling-booking-header is-mobile" : "scheduling-booking-header";

  return (
    <header className={headerClassName}>
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
        <ModeToggle />
      </div>
    </header>
  );
}

function BookingProviderIdentity({
  page,
  compact = false,
}: {
  page: BookingPageContextValue;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "scheduling-provider-head is-compact" : "scheduling-provider-head"}>
      <div className="scheduling-provider-avatar" aria-hidden="true">
        {initialsOf(page.providerName)}
      </div>
      <div>
        <h2>{page.providerName}</h2>
        <p>{page.providerRole}</p>
        <Badge className="mt-2" variant="secondary">{page.providerAvailabilityLabel}</Badge>
      </div>
    </div>
  );
}

function BookingServiceSummary({
  page,
  compact = false,
}: {
  page: BookingPageContextValue;
  compact?: boolean;
}) {
  const service = page.selectedService;

  return (
    <div className={compact ? "scheduling-booking-summary-block is-compact" : "scheduling-booking-summary-block"}>
      <h3>{service?.name ?? "Choose a service"}</h3>
      <p>{service?.description ?? page.providerDescription}</p>
    </div>
  );
}

function BookingMetaRows({
  page,
  compact = false,
}: {
  page: BookingPageContextValue;
  compact?: boolean;
}) {
  return (
    <dl className={compact ? "scheduling-booking-meta is-compact" : "scheduling-booking-meta"}>
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
  );
}

function BookingStepList({
  page,
  compact = false,
}: {
  page: BookingPageContextValue;
  compact?: boolean;
}) {
  return (
    <ol className={compact ? "scheduling-booking-steps is-compact" : "scheduling-booking-steps"}>
      {["Select a time", "Enter details", "Confirm booking"].map((label, index) => (
        <li className={page.stepIndex === index ? "is-active" : page.stepIndex > index ? "is-complete" : ""} key={label}>
          <span>{index + 1}</span>
          <strong>{label}</strong>
        </li>
      ))}
    </ol>
  );
}

function BookingDurationPicker({ page }: { page: BookingPageContextValue }) {
  return (
    <div className="scheduling-duration-picker" role="tablist" aria-label="Available durations">
      {page.services.map((service) => (
        <Button
          aria-selected={page.selectedServiceId === service.id.value}
          className="min-w-16"
          key={service.id.value}
          onClick={() => page.selectService(service.id.value)}
          role="tab"
          size="sm"
          type="button"
          variant={page.selectedServiceId === service.id.value ? "default" : "outline"}
        >
          {service.durationMinutes}m
        </Button>
      ))}
    </div>
  );
}

function BookingCalendarPanel({
  page,
  title,
  subtitle,
  showDurationPicker = false,
}: {
  page: BookingPageContextValue;
  title?: string;
  subtitle?: string;
  showDurationPicker?: boolean;
}) {
  const selectedDate = page.selectedDateKey ? dateFromDateKey(page.selectedDateKey) : undefined;
  const availableDateSet = new Set(page.availableDateKeys);
  const availableDates = page.availableDateKeys.map(dateFromDateKey);

  return (
    <>
      {title ? (
        <div className="scheduling-booking-card-head">
          <div>
            <h3>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {showDurationPicker ? <BookingDurationPicker page={page} /> : null}
        </div>
      ) : null}
      {availableDates.length ? (
        <Calendar
          className="scheduling-shadcn-calendar"
          classNames={{
            root: "w-full",
            months: "w-full",
            month: "w-full",
            month_grid: "w-full",
          }}
          disabled={(date) => !availableDateSet.has(dateKeyForDate(date))}
          fixedWeeks
          mode="single"
          modifiers={{ available: availableDates }}
          modifiersClassNames={{
            available: "bg-accent/70 text-foreground font-medium",
          }}
          month={page.calendarMonth}
          onMonthChange={page.setCalendarMonth}
          onSelect={(date) => {
            if (date) page.selectDate(dateKeyForDate(date));
          }}
          selected={selectedDate}
          showOutsideDays
          startMonth={page.calendarStartMonth}
          endMonth={page.calendarEndMonth}
        />
      ) : (
        <Alert>
          <AlertTitle>No available dates yet</AlertTitle>
          <AlertDescription>Live slots will appear here when the selected service has availability.</AlertDescription>
        </Alert>
      )}
      <p className="scheduling-booking-timezone-note">Times shown in {page.timezoneLabel}</p>
    </>
  );
}

function BookingSlotButtonList({ page }: { page: BookingPageContextValue }) {
  return (
    <div className="scheduling-booking-slot-list">
      {page.slotGroups.map((entry) => (
        <Button
          className="scheduling-slot-option"
          data-testid={entry.selected ? "public-selected-slot" : "public-slot-option"}
          key={slotKey(entry.slot)}
          onClick={() => page.selectSlot(entry.slot)}
          type="button"
          variant={entry.selected ? "default" : "outline"}
        >
          <span className="scheduling-slot-option-time">{entry.label}</span>
          <span className="scheduling-slot-option-label">{entry.sublabel}</span>
          {entry.selected ? <span aria-hidden="true">✓</span> : null}
        </Button>
      ))}
      {!page.slotGroups.length ? <p>No available times for this day yet.</p> : null}
    </div>
  );
}

function BookingIntakeField({
  label,
  htmlFor,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="scheduling-booking-field">
      <Label htmlFor={htmlFor}>
        {label}
        {optional ? <span className="scheduling-inline-note">(optional)</span> : null}
      </Label>
      {children}
    </div>
  );
}

function BookingIntakeForm({
  page,
  title,
  emptyState,
}: {
  page: BookingPageContextValue;
  title?: string;
  emptyState?: ReactNode;
}) {
  if (!page.selectedSlot) {
    return (
      <article className="scheduling-booking-intake is-empty">
        {title ? <h3>{title}</h3> : null}
        {emptyState ?? <p>Select a time to continue into intake and confirmation.</p>}
      </article>
    );
  }

  return (
    <article className="scheduling-booking-intake">
      {title ? <h3>{title}</h3> : null}
      <BookingIntakeField htmlFor="booking-intake-name" label="Your name">
        <Input
          data-testid="public-intake-name"
          id="booking-intake-name"
          onChange={(event) => page.setCustomerField("name", event.target.value)}
          placeholder="e.g., Alex Johnson"
          value={page.customer.name}
        />
      </BookingIntakeField>
      <BookingIntakeField htmlFor="booking-intake-email" label="Email">
        <Input
          data-testid="public-intake-email"
          id="booking-intake-email"
          onChange={(event) => page.setCustomerField("email", event.target.value)}
          placeholder="e.g., alex@example.com"
          type="email"
          value={page.customer.email}
        />
      </BookingIntakeField>
      <BookingIntakeField htmlFor="booking-intake-phone" label="Phone" optional>
        <Input
          id="booking-intake-phone"
          onChange={(event) => page.setCustomerField("phone", event.target.value)}
          placeholder="Optional"
          value={page.customer.phone}
        />
      </BookingIntakeField>
      <BookingIntakeField htmlFor="booking-intake-notes" label="Notes" optional>
        <Textarea
          id="booking-intake-notes"
          onChange={(event) => page.setCustomerField("notes", event.target.value)}
          placeholder="Anything we should know?"
          value={page.customer.notes}
        />
      </BookingIntakeField>

      {page.hasPaymentAlert ? (
        <Alert data-testid="public-payment-required" variant="destructive">
          <AlertTitle>Payment required</AlertTitle>
          <AlertDescription>{page.paymentAlertText}</AlertDescription>
        </Alert>
      ) : null}

      <div className="scheduling-booking-intake-actions">
        <Button
          data-testid="public-submit-intake"
          disabled={page.live ? !page.hold || !!page.busy : true}
          onClick={() => page.submitIntake()}
          type="button"
        >
          {page.busy === "intake" ? "Saving details…" : "Save details"}
        </Button>
        <Button
          data-testid="public-confirm-booking"
          disabled={page.live ? !page.hold || !!page.busy : true}
          onClick={() => page.confirmBooking()}
          type="button"
        >
          {page.busy === "confirm" ? "Continuing…" : "Continue to confirmation"}
        </Button>
      </div>

      {page.live ? (
        <Button
          data-testid="public-fake-satisfy-payment"
          disabled={!page.hold || !!page.busy}
          onClick={() => page.satisfyPayment()}
          type="button"
          variant="secondary"
        >
          {page.busy === "payment" ? "Marking fake/local payment satisfied…" : "Mark fake/local payment satisfied"}
        </Button>
      ) : null}
    </article>
  );
}

function BookingFooterSummaryCard({
  page,
  compact = false,
}: {
  page: BookingPageContextValue;
  compact?: boolean;
}) {
  return (
    <section className={compact ? "scheduling-booking-footer is-compact" : "scheduling-booking-footer"} data-testid="public-hold-state">
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
      <Button disabled={!page.selectedSlot} onClick={() => page.clearSelection()} type="button" variant="outline">
        Cancel selection
      </Button>
    </section>
  );
}

export function BookingHeaderView(props: SlotProps) {
  void props;
  return <BookingHeaderContent />;
}

export function BookingMobileHeaderView(props: SlotProps) {
  void props;
  return <BookingHeaderContent mobile />;
}

export function BookingSummaryPanelView(props: SlotProps) {
  void props;
  const page = useBookingPage();

  return (
    <section className="scheduling-booking-summary">
      <BookingProviderIdentity page={page} />
      <Separator />
      <BookingServiceSummary page={page} />
      <Separator />
      <BookingMetaRows page={page} />
      <Separator />
      <BookingStepList page={page} />
      <Separator />
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

export function BookingMobileSummaryCardView(props: SlotProps) {
  void props;
  const page = useBookingPage();

  return (
    <section className="scheduling-booking-summary is-mobile-card">
      <BookingProviderIdentity page={page} compact />
      <BookingServiceSummary page={page} compact />
      <BookingMetaRows page={page} compact />
    </section>
  );
}

export function BookingMobileStepStatusView(props: SlotProps) {
  void props;
  const page = useBookingPage();

  return (
    <section className="scheduling-booking-mobile-step-card">
      <BookingStepList page={page} compact />
      <p>{page.selectedSlot ? `Selected ${longDateLabelForSlot(page.selectedSlot)}` : "Choose a day, then a time, then continue into intake."}</p>
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
      <BookingDurationPicker page={page} />
    </section>
  );
}

export function BookingCalendarRegionView(props: SlotProps) {
  void props;
  const page = useBookingPage();

  return (
    <section className="scheduling-booking-calendar">
      <BookingCalendarPanel page={page} />
    </section>
  );
}

export function BookingMobileCalendarCardView(props: SlotProps) {
  void props;
  const page = useBookingPage();

  return (
    <section className="scheduling-booking-calendar is-mobile-card">
      <BookingCalendarPanel page={page} title="Choose a date" subtitle={`Times shown in ${page.timezoneLabel}`} showDurationPicker />
    </section>
  );
}

export function BookingSlotsRegionView(props: SlotProps) {
  void props;
  const page = useBookingPage();

  return (
    <section className="scheduling-booking-slots">
      <h3>{page.dayHeadline}</h3>

      {page.errorMessage && !page.hasPaymentAlert ? (
        <p className="error" role="alert">
          {controlledSchedulingError(page.errorMessage)}
        </p>
      ) : null}

      <BookingSlotButtonList page={page} />
      <BookingIntakeForm page={page} />
    </section>
  );
}

export function BookingMobileSlotsCardView(props: SlotProps) {
  void props;
  const page = useBookingPage();

  return (
    <section className="scheduling-booking-slots is-mobile-card">
      <div className="scheduling-booking-card-head">
        <div>
          <h3>Available times</h3>
          <p>{page.dayHeadline}</p>
        </div>
      </div>

      {page.errorMessage && !page.hasPaymentAlert ? (
        <p className="error" role="alert">
          {controlledSchedulingError(page.errorMessage)}
        </p>
      ) : null}

      <BookingSlotButtonList page={page} />
    </section>
  );
}

export function BookingMobileIntakeCardView(props: SlotProps) {
  void props;
  const page = useBookingPage();

  return (
    <section className="scheduling-booking-mobile-intake-card">
      <BookingIntakeForm
        page={page}
        title="Your details"
        emptyState={
          <>
            <p>Pick an available time first.</p>
            <p>We’ll show the intake form, payment-required notice, and confirmation action here.</p>
          </>
        }
      />
    </section>
  );
}

export function BookingFooterSummaryView(props: SlotProps) {
  void props;
  const page = useBookingPage();

  return <BookingFooterSummaryCard page={page} />;
}

export function BookingMobileConfirmFooterView(props: SlotProps) {
  void props;
  const page = useBookingPage();

  return <BookingFooterSummaryCard page={page} compact />;
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
              {busy === "payment" ? "Marking fake/local payment satisfied…" : "Mark fake/local payment satisfied"}
            </button>
          </div>
          {errorMessage && isPaymentRequiredError(errorMessage) ? (
            <p className="error" data-testid="public-payment-required" role="alert">
              This booking requires controlled local/test payment satisfaction before confirmation.
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

