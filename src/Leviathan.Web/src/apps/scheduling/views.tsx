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

export function SchedulingHomeView({ scenario }: { scenario: SchedulingFixtureScenario }) {
  return (
    <div className="scheduling-stack">
      <Card>
        <CardHeader>
          <CardTitle>Scheduling landing</CardTitle>
          <CardDescription>Start with provider setup, then move into the public booking demo, provider bookings, and lifecycle verification without adding auth, real payments, or external providers.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AdminModeBanner />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Setup provider</CardTitle>
                <CardDescription>Create a bookable provider, resource, service, and availability rule.</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button asChild>
                  <a href="/apps/scheduling/setup?debug=1&fixture=provider-setup">Open setup demo</a>
                </Button>
              </CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Public booking demo</CardTitle>
                <CardDescription>Preview the customer-facing booking page that the generated link will open.</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button asChild variant="secondary">
                  <a href="/book/demo-provider?debug=1&fixture=public-booking">Open booking demo</a>
                </Button>
              </CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Provider bookings</CardTitle>
                <CardDescription>Inspect confirmation, cancellation, notification summary, and audit/lifecycle detail.</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button asChild variant="secondary">
                  <a href="/apps/scheduling/bookings?debug=1&fixture=cancelled-rescheduled">Open bookings demo</a>
                </Button>
              </CardFooter>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Action cards</CardTitle>
          <CardDescription>Secondary entry points stay available for the other milestone surfaces.</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current proof points</CardTitle>
          <CardDescription>These remain the boundaries for the Scheduling UX passes.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="scheduling-proof-grid">
            {scenario.proofPoints.map((point) => (
              <article className="card scheduling-proof-card" key={point}>
                <p>{point}</p>
              </article>
            ))}
          </div>
        </CardContent>
      </Card>

      {scenario.localDevContext ? (
        <Card>
          <CardHeader>
            <CardTitle>Unsafe local-dev ownership context</CardTitle>
            <CardDescription>The backend still owns installation identity; the UI should not make providers think they need internal ids.</CardDescription>
          </CardHeader>
          <CardContent>
            <OwnershipSummary localDevContext={scenario.localDevContext} />
          </CardContent>
        </Card>
      ) : null}
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
  actions,
  reschedulePanel,
  lifecycle,
  auditEvents,
}: {
  booking: Booking;
  serviceName?: string;
  resourceName?: string;
  actions?: ReactNode;
  reschedulePanel?: ReactNode;
  lifecycle?: SchedulingLifecycleSummary;
  auditEvents?: BookingAuditEvent[];
}) {
  const bookingId = booking.id.value;
  const tz = booking.range?.timeZoneId ?? "Timezone unavailable";
  const actionState = bookingActionLabels(booking);

  return (
    <section className="scheduling-stack" data-testid="booking-status-root">
      <Card data-testid="booking-status-hero">
        <CardHeader>
          <CardTitle>
            <div className="scheduling-section-head">
              <div>
                <h2>{bookingPrimaryStatusHeading(booking)}</h2>
                <p>{bookingPrimaryStatusBody(booking)}</p>
              </div>
              <div className="scheduling-chip-row">
                <StatusChip tone={chipToneForValue(booking.status)} label={statusLabel(booking.status)} />
                {paymentSummaryLabel(booking) ? <StatusChip tone={chipToneForValue(paymentToneValue(booking))} label={paymentSummaryLabel(booking)!} /> : null}
                {notificationSummaryLabel(lifecycle?.notificationSummary ?? booking.notificationSummary) ? (
                  <StatusChip tone="info" label={notificationSummaryLabel(lifecycle?.notificationSummary ?? booking.notificationSummary)!} />
                ) : null}
              </div>
            </div>
          </CardTitle>
          <CardDescription>
            {booking.customer.name} booked {serviceName}.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card data-testid="booking-status-details">
        <CardHeader>
          <CardTitle>Booking details</CardTitle>
          <CardDescription>Everything needed to understand what was booked at a glance.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="scheduling-definition-list">
            <dt>Provider/resource</dt>
            <dd>{resourceName}</dd>
            <dt>Service</dt>
            <dd>{serviceName}</dd>
            <dt>Date and time</dt>
            <dd>{formatDateTimeRange(booking.range)}</dd>
            <dt>Timezone</dt>
            <dd>{tz}</dd>
            <dt>Duration</dt>
            <dd>{formatDurationMinutes(booking.range)}</dd>
            <dt>Location</dt>
            <dd>Google Meet</dd>
            <dt>Reference</dt>
            <dd>{bookingId}</dd>
            {booking.rescheduledToBookingId ? (
              <>
                <dt>Rescheduled to</dt>
                <dd>{booking.rescheduledToBookingId}</dd>
              </>
            ) : null}
            {booking.rescheduledFromBookingId ? (
              <>
                <dt>Rescheduled from</dt>
                <dd>{booking.rescheduledFromBookingId}</dd>
              </>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <Card data-testid="booking-status-next-steps">
        <CardHeader>
          <CardTitle>What happens next</CardTitle>
          <CardDescription>Short, honest guidance without implying provider integrations that do not exist.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="scheduling-checklist">
            {nextStepLinesForBooking(booking).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card data-testid="booking-status-actions">
        <CardHeader>
          <CardTitle>Actions</CardTitle>
          <CardDescription>Primary actions stay obvious. Debug and lifecycle details stay secondary.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="scheduling-chip-row">
            {actionState.allowIcs ? (
              <Button asChild variant="default">
                <a href={schedulingEndpoints.bookingIcs(bookingId)}>Download ICS</a>
              </Button>
            ) : null}
            {actions}
            {actionState.allowBookAnother ? (
              <Button asChild variant="outline">
                <a href={linkWithCurrentQuery("/apps/scheduling")}>Book another time</a>
              </Button>
            ) : null}
            {!actionState.allowCancel ? <StatusChip tone="neutral" label="Confirmed-only actions disabled" /> : null}
          </div>
          {actionState.allowCancel ? <p className="text-sm text-muted-foreground">Cancellation is available from the provider bookings surface in this local flow.</p> : null}
        </CardContent>
      </Card>

      {reschedulePanel}

      <BookingMetaPanels booking={booking} notificationSummary={lifecycle?.notificationSummary ?? booking.notificationSummary} />

      {lifecycle || auditEvents?.length ? (
        <BookingDebugPanel booking={booking} auditEvents={auditEvents ?? []} lifecycle={lifecycle} />
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
  reschedulePanel,
}: {
  bookings?: Booking[];
  selectedBooking?: Booking;
  auditEvents?: BookingAuditEvent[];
  lifecycle?: SchedulingLifecycleSummary;
  errorMessage?: string;
  reschedulePanel?: ReactNode;
}) {
  return (
    <div className="scheduling-stack" data-testid="provider-bookings-root">
      <section className="scheduling-subpanel" data-testid="provider-bookings-list">
        <div className="scheduling-section-head">
          <div>
            <h2>Provider bookings</h2>
            <p>Readable booking status, payment, notifications, and lifecycle access for provider-side follow-up.</p>
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
          <div className="scheduling-stack scheduling-stack-tight">
            {bookings.map((booking) => (
              <Card key={booking.id.value}>
                <CardHeader>
                  <div className="scheduling-section-head">
                    <div>
                      <CardTitle>{booking.customer.name}</CardTitle>
                      <CardDescription>{formatDateTimeRange(booking.range)}</CardDescription>
                    </div>
                    <div className="scheduling-chip-row">
                      <StatusChip tone={chipToneForValue(booking.status)} label={statusLabel(booking.status)} />
                      {paymentSummaryLabel(booking) ? (
                        <StatusChip tone={chipToneForValue(paymentToneValue(booking))} label={paymentSummaryLabel(booking)!} />
                      ) : (
                        <StatusChip tone="neutral" label="No payment required" />
                      )}
                      {notificationSummaryLabel(booking.notificationSummary) ? (
                        <StatusChip tone="info" label={notificationSummaryLabel(booking.notificationSummary)!} />
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <dl className="scheduling-definition-list">
                    <dt>Email</dt>
                    <dd>{booking.customer.email}</dd>
                    <dt>Timezone</dt>
                    <dd>{booking.range?.timeZoneId ?? "Not recorded"}</dd>
                    <dt>Reference</dt>
                    <dd>{booking.id.value}</dd>
                    {booking.status === "cancelled" && booking.cancellationMessage ? (
                      <>
                        <dt>Cancellation message</dt>
                        <dd>{booking.cancellationMessage}</dd>
                      </>
                    ) : null}
                    {booking.rescheduledToBookingId ? (
                      <>
                        <dt>Rescheduled to</dt>
                        <dd>{booking.rescheduledToBookingId}</dd>
                      </>
                    ) : null}
                  </dl>
                </CardContent>
                <CardFooter className="gap-3">
                  {booking.status === "confirmed" ? <Button type="button" variant="destructive">Cancel booking</Button> : null}
                  {booking.status === "confirmed" ? (
                    <Button asChild variant="outline">
                      <a className="scheduling-inline-link" href={schedulingEndpoints.bookingIcs(booking.id.value)}>
                        Download ICS
                      </a>
                    </Button>
                  ) : null}
                  <Button type="button" variant="secondary">Inspect lifecycle</Button>
                  {booking.status !== "confirmed" ? <StatusChip tone="neutral" label="Confirmed-only actions disabled" /> : null}
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {reschedulePanel}

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
    <aside className="scheduling-subpanel scheduling-debug" data-testid="provider-booking-detail">
      <div className="scheduling-section-head">
        <div>
          <h3>Audit and lifecycle</h3>
          <p>Lifecycle and audit stay available, but secondary to the primary status and actions.</p>
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
          <dl className="scheduling-definition-list">
            <dt>Current state</dt>
            <dd>{lifecycleStateLabel(lifecycle)}</dd>
            <dt>Decision/policy result</dt>
            <dd>{lifecycle?.lastDecisionCode ?? booking.cancellationPolicyResult ?? "unknown"}</dd>
            <dt>Created</dt>
            <dd>{formatTimestamp(booking.createdAt ?? lifecycle?.createdAt, booking.range?.timeZoneId ?? "UTC")}</dd>
            <dt>Confirmed</dt>
            <dd>{formatTimestamp(booking.confirmedAt ?? lifecycle?.confirmedAt, booking.range?.timeZoneId ?? "UTC")}</dd>
            <dt>Cancelled</dt>
            <dd>{formatTimestamp(booking.cancelledAt ?? lifecycle?.cancelledAt, booking.range?.timeZoneId ?? "UTC")}</dd>
            <dt>Last audit event id</dt>
            <dd>{lifecycle?.lastAuditEventId ?? "none"}</dd>
            <dt>Checkpoint exists</dt>
            <dd>{String(hasLifecycleCheckpoint(lifecycle) || !!lifecycle?.checkpointPath)}</dd>
            {booking.cancellationReasonCode ? (
              <>
                <dt>Cancellation reason</dt>
                <dd>{booking.cancellationReasonCode}</dd>
              </>
            ) : null}
            {booking.cancellationMessage ? (
              <>
                <dt>Cancellation message</dt>
                <dd>{booking.cancellationMessage}</dd>
              </>
            ) : null}
            {booking.rescheduledToBookingId ? (
              <>
                <dt>Rescheduled to</dt>
                <dd>{booking.rescheduledToBookingId}</dd>
              </>
            ) : null}
            {booking.rescheduledFromBookingId ? (
              <>
                <dt>Rescheduled from</dt>
                <dd>{booking.rescheduledFromBookingId}</dd>
              </>
            ) : null}
            {booking.replacementHoldId ?? lifecycle?.replacementHoldId ? (
              <>
                <dt>Replacement hold</dt>
                <dd>{booking.replacementHoldId ?? lifecycle?.replacementHoldId}</dd>
              </>
            ) : null}
          </dl>
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
              <strong>{event.eventType}</strong> · {formatTimestamp(event.occurredAt, booking.range?.timeZoneId ?? "UTC")} · {event.data?.decision ?? event.data?.policyResult ?? event.message}
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

type BookingRescheduleFixtureState = {
  stage: "available" | "picker" | "replacement" | "result";
  slots?: BookableSlot[];
  selectedSlot?: BookableSlot;
  replacementHold?: ReplacementHoldResponse | null;
  replacementBooking?: Booking | null;
  oldBooking?: Booking | null;
  lifecycle?: SchedulingLifecycleSummary | null;
  errorMessage?: string;
};

export function BookingReschedulePanel(props: {
  booking: Booking;
  providerSlug?: string;
  serviceName?: string;
  actor?: string;
  fixtureState?: BookingRescheduleFixtureState;
  onOriginalBookingUpdated?: (booking: Booking) => void;
  onReplacementConfirmed?: (nextBooking: Booking, oldBooking: Booking) => void;
}) {
  const live = !props.fixtureState;
  const eligible = isBookingReschedulable(props.booking);
  const [expanded, setExpanded] = useState(Boolean(props.fixtureState && props.fixtureState.stage !== "available"));
  const [slots, setSlots] = useState<BookableSlot[]>(props.fixtureState?.slots ?? []);
  const [selectedSlotKey, setSelectedSlotKey] = useState<string | undefined>(props.fixtureState?.selectedSlot ? slotKey(props.fixtureState.selectedSlot) : undefined);
  const [replacementHold, setReplacementHold] = useState<ReplacementHoldResponse | null>(props.fixtureState?.replacementHold ?? null);
  const [replacementBooking, setReplacementBooking] = useState<Booking | null>(props.fixtureState?.replacementBooking ?? null);
  const [oldBookingAfterReschedule, setOldBookingAfterReschedule] = useState<Booking | null>(props.fixtureState?.oldBooking ?? null);
  const [replacementLifecycle, setReplacementLifecycle] = useState<SchedulingLifecycleSummary | null | undefined>(props.fixtureState?.lifecycle);
  const [selectedDateKey, setSelectedDateKey] = useState<string | undefined>(props.fixtureState?.selectedSlot ? dateKeyForSlot(props.fixtureState.selectedSlot) : undefined);
  const [calendarMonthKey, setCalendarMonthKey] = useState<string | undefined>(props.fixtureState?.selectedSlot ? monthKeyForDate(dateFromDateKey(dateKeyForSlot(props.fixtureState.selectedSlot))) : undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(props.fixtureState?.errorMessage);
  const [customer, setCustomer] = useState({
    name: props.booking.customer.name,
    email: props.booking.customer.email,
    phone: props.booking.customer.phone ?? "",
    notes: props.booking.customer.notes ?? "",
  });
  const replacementProviderSlug = props.providerSlug;
  const replacementServiceId = props.booking.serviceId?.value;

  useEffect(() => {
    if (!props.fixtureState) return;
    setExpanded(props.fixtureState.stage !== "available");
    setSlots(props.fixtureState.slots ?? []);
    setSelectedSlotKey(props.fixtureState.selectedSlot ? slotKey(props.fixtureState.selectedSlot) : undefined);
    setReplacementHold(props.fixtureState.replacementHold ?? null);
    setReplacementBooking(props.fixtureState.replacementBooking ?? null);
    setOldBookingAfterReschedule(props.fixtureState.oldBooking ?? null);
    setReplacementLifecycle(props.fixtureState.lifecycle);
    setErrorMessage(props.fixtureState.errorMessage);
  }, [props.fixtureState]);

  useEffect(() => {
    if (!live || !expanded || replacementHold || replacementBooking || !eligible) return;
    if (!replacementProviderSlug || !replacementServiceId) return;
    if (slots.length > 0 || busy === "slots") return;

    void (async () => {
      try {
        setBusy("slots");
        setErrorMessage(undefined);
        const from = new Date();
        const to = new Date(from.getTime() + 21 * 24 * 60 * 60 * 1000);
        const listed = await listSlots(
          replacementProviderSlug,
          replacementServiceId,
          from.toISOString(),
          to.toISOString(),
          browserTimeZone(),
        );
        setSlots(listed);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(null);
      }
    })();
  }, [busy, eligible, expanded, live, replacementBooking, replacementHold, replacementProviderSlug, replacementServiceId, slots.length]);

  const replacementSlots = slots.filter((slot) => !slotMatchesBooking(slot, props.booking));
  const availableDates = buildAvailableDates(replacementSlots);
  const resolvedSelectedDateKey =
    selectedDateKey && availableDates.some((entry) => entry.dateKey === selectedDateKey)
      ? selectedDateKey
      : availableDates[0]?.dateKey;
  const months = buildMonthOptions(availableDates);
  const resolvedMonthKey =
    calendarMonthKey && months.some((entry) => entry.monthKey === calendarMonthKey)
      ? calendarMonthKey
      : resolvedSelectedDateKey
        ? resolvedSelectedDateKey.slice(0, 7)
        : months[0]?.monthKey;
  const calendarMonth = monthDateFromMonthKey(resolvedMonthKey);
  const calendarStartMonth = monthDateFromMonthKey(months[0]?.monthKey);
  const calendarEndMonth = monthDateFromMonthKey(months.at(-1)?.monthKey);
  const visibleSlots = replacementSlots.filter((slot) => !resolvedSelectedDateKey || dateKeyForSlot(slot) === resolvedSelectedDateKey);
  const selectedSlot = replacementSlots.find((slot) => slotKey(slot) === selectedSlotKey) ?? props.fixtureState?.selectedSlot;
  const currentBooking = oldBookingAfterReschedule ?? props.booking;
  const showResult = Boolean(replacementBooking && oldBookingAfterReschedule);
  const showReplacementFlow = expanded || Boolean(replacementHold) || showResult;
  const paymentRequired =
    replacementHold?.lifecycle?.paymentRequirementStatus === "payment_required" ||
    replacementLifecycle?.paymentRequirementStatus === "payment_required" ||
    isPaymentRequiredError(errorMessage);

  async function createLiveReplacementHold() {
    if (!live || !selectedSlot) return;
    try {
      setBusy("replacement-hold");
      setErrorMessage(undefined);
      const created = await createReplacementHold(props.booking.id.value, {
        serviceId: selectedSlot.serviceId,
        resourceId: selectedSlot.resourceId,
        startUtc: selectedSlot.startsAtUtc,
        endUtc: selectedSlot.endsAtUtc,
        timeZoneId: selectedSlot.timeZoneId,
        displayTimeZoneId: selectedSlot.displayTimeZoneId,
        reason: "customer_requested",
        actor: props.actor ?? "local-dev-admin",
      });
      setReplacementHold(created);
      setReplacementLifecycle(created.lifecycle ?? null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function submitReplacementIntake() {
    if (!live || !replacementHold) return;
    try {
      setBusy("replacement-intake");
      setErrorMessage(undefined);
      const updated = await submitIntake(replacementHold.replacementHoldId, replacementHold.claimToken, customer);
      setReplacementLifecycle((current) => ({
        status: current?.status ?? replacementHold.lifecycle?.status ?? "active",
        ...(current ?? {}),
        paymentRequirementStatus: updated.paymentRequirementStatus ?? current?.paymentRequirementStatus,
        paymentReference: updated.paymentReference ?? current?.paymentReference,
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function satisfyReplacementPayment() {
    if (!live || !replacementHold) return;
    try {
      setBusy("replacement-payment");
      setErrorMessage(undefined);
      const payment = await fakeSatisfyPayment(replacementHold.replacementHoldId, replacementHold.claimToken, props.actor ?? "local-dev-admin");
      setReplacementLifecycle((current) => ({
        status: current?.status ?? replacementHold.lifecycle?.status ?? "active",
        ...(current ?? {}),
        paymentRequirementStatus: payment.paymentRequirementStatus,
        paymentReference: payment.paymentReference,
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function confirmReplacement() {
    if (!live || !replacementHold) return;
    try {
      setBusy("replacement-confirm");
      setErrorMessage(undefined);
      const confirmed = await confirmBooking(replacementHold.replacementHoldId, replacementHold.claimToken, customer);
      const oldBooking = await getBooking(props.booking.id.value);
      setReplacementBooking(confirmed);
      setOldBookingAfterReschedule(oldBooking);
      props.onOriginalBookingUpdated?.(oldBooking);
      props.onReplacementConfirmed?.(confirmed, oldBooking);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  if (!eligible && !hasRescheduleRelation(props.booking)) return null;

  return (
    <Card data-testid="booking-reschedule-root">
      <CardHeader>
        <CardTitle>Reschedule</CardTitle>
        <CardDescription>Your current booking stays confirmed until the new time is confirmed.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!eligible ? (
          <Alert>
            <AlertTitle>{currentBooking.status === "rescheduled" ? "Replacement already confirmed" : "Reschedule unavailable"}</AlertTitle>
            <AlertDescription>{bookingRescheduleStateCopy(currentBooking)}</AlertDescription>
          </Alert>
        ) : null}

        <div className="rounded-lg border p-4" data-testid="booking-reschedule-current">
          <div className="scheduling-section-head">
            <div>
              <h4 className="font-semibold">Current booking</h4>
              <p className="text-sm text-muted-foreground">{formatDateTimeRange(currentBooking.range)}</p>
            </div>
            <StatusChip tone={chipToneForValue(currentBooking.status)} label={statusLabel(currentBooking.status)} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">This stays active until a replacement booking is successfully confirmed.</p>
          {renderRescheduleRelationBlock(currentBooking)}
        </div>

        {eligible && !showReplacementFlow ? (
          <div className="flex flex-wrap gap-3" data-testid="booking-reschedule-actions">
            <Button data-testid="booking-reschedule-open" onClick={() => setExpanded(true)} type="button">
              Reschedule
            </Button>
            <p className="text-sm text-muted-foreground">Choose a replacement time without turning this into cancel-then-book.</p>
          </div>
        ) : null}

        {showReplacementFlow ? (
          <>
            <Separator />
            <section className="space-y-4" data-testid="booking-reschedule-picker">
              <div className="scheduling-section-head">
                <div>
                  <h4 className="font-semibold">Choose a replacement time</h4>
                  <p className="text-sm text-muted-foreground">Compare the current booking with a new available slot before you create the replacement hold.</p>
                </div>
                {busy === "slots" ? <StatusChip tone="warning" label="Loading slots" /> : null}
              </div>
              {replacementSlots.length ? (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
                  <Card>
                    <CardContent className="pt-4">
                      <Calendar
                        disabled={(date) => !availableDates.some((entry) => entry.dateKey === dateKeyForDate(date))}
                        mode="single"
                        month={calendarMonth}
                        onMonthChange={(month) => setCalendarMonthKey(monthKeyForDate(month))}
                        onSelect={(date) => {
                          if (!date) return;
                          setSelectedDateKey(dateKeyForDate(date));
                          setSelectedSlotKey(undefined);
                        }}
                        selected={resolvedSelectedDateKey ? dateFromDateKey(resolvedSelectedDateKey) : undefined}
                        startMonth={calendarStartMonth}
                        endMonth={calendarEndMonth}
                      />
                    </CardContent>
                  </Card>
                  <div className="space-y-3">
                    <div className="rounded-lg border p-4">
                      <p className="text-sm font-medium">Current time</p>
                      <p className="text-sm text-muted-foreground">{formatDateTimeRange(currentBooking.range)}</p>
                    </div>
                    {visibleSlots.length ? (
                      <div className="grid gap-2">
                        {visibleSlots.map((slot) => {
                          const selected = slotKey(slot) === selectedSlotKey;
                          return (
                            <Button
                              data-testid="booking-reschedule-slot-option"
                              key={slotKey(slot)}
                              onClick={() => setSelectedSlotKey(slotKey(slot))}
                              type="button"
                              variant={selected ? "default" : "outline"}
                            >
                              {timeLabelForSlot(slot)} · {slot.displayTimeZoneId}
                            </Button>
                          );
                        })}
                      </div>
                    ) : (
                      <Alert>
                        <AlertTitle>No replacement slots available</AlertTitle>
                        <AlertDescription>The backend still keeps the current booking confirmed. Pick another date if you need a replacement time.</AlertDescription>
                      </Alert>
                    )}
                  </div>
                </div>
              ) : (
                <Alert>
                  <AlertTitle>No replacement slots available</AlertTitle>
                  <AlertDescription>No alternative slots are available for this service right now. The current booking remains active.</AlertDescription>
                </Alert>
              )}
            </section>

            {selectedSlot ? (
              <section className="space-y-3" data-testid="booking-reschedule-replacement">
                <div className="rounded-lg border p-4">
                  <p className="text-sm font-medium">Selected replacement</p>
                  <p className="text-sm text-muted-foreground">{selectedSlot.displayStartsAtLocal} to {selectedSlot.displayEndsAtLocal}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{props.serviceName ?? "Service"} on resource {selectedSlot.resourceId}.</p>
                </div>
                {!replacementHold ? (
                  <div className="flex flex-wrap gap-3" data-testid="booking-reschedule-actions">
                    <Button data-testid="booking-reschedule-create-hold" disabled={!live || busy !== null} onClick={() => void createLiveReplacementHold()} type="button">
                      {busy === "replacement-hold" ? "Creating replacement hold…" : "Create replacement hold"}
                    </Button>
                    <Button onClick={() => setExpanded(false)} type="button" variant="outline">
                      Keep current time
                    </Button>
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}

        {replacementHold ? (
          <section className="space-y-4" data-testid="booking-reschedule-replacement">
            <Alert>
              <AlertTitle>Replacement hold created</AlertTitle>
              <AlertDescription>
                The original booking is still confirmed while this replacement hold is active.
              </AlertDescription>
            </Alert>
            <div className="rounded-lg border p-4">
              <dl className="scheduling-definition-list">
                <dt>Old booking</dt>
                <dd>{replacementHold.oldBookingId}</dd>
                <dt>Replacement hold</dt>
                <dd>{replacementHold.replacementHoldId}</dd>
                <dt>Target slot</dt>
                <dd>{formatSlotSummary(replacementHold.targetSlot)}</dd>
                <dt>Lifecycle state</dt>
                <dd>{lifecycleStateLabel(replacementHold.lifecycle ?? replacementLifecycle)}</dd>
              </dl>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="replacement-name">Name</Label>
                <Input id="replacement-name" onChange={(event) => setCustomer((current) => ({ ...current, name: event.target.value }))} value={customer.name} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="replacement-email">Email</Label>
                <Input id="replacement-email" onChange={(event) => setCustomer((current) => ({ ...current, email: event.target.value }))} value={customer.email} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="replacement-phone">Phone</Label>
                <Input id="replacement-phone" onChange={(event) => setCustomer((current) => ({ ...current, phone: event.target.value }))} value={customer.phone} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="replacement-notes">Notes</Label>
                <Textarea id="replacement-notes" onChange={(event) => setCustomer((current) => ({ ...current, notes: event.target.value }))} value={customer.notes} />
              </div>
            </div>
            <div className="flex flex-wrap gap-3" data-testid="booking-reschedule-actions">
              <Button data-testid="booking-reschedule-submit-intake" disabled={!live || busy !== null} onClick={() => void submitReplacementIntake()} type="button" variant="secondary">
                {busy === "replacement-intake" ? "Saving details…" : "Save replacement details"}
              </Button>
              {paymentRequired ? (
                <Button data-testid="booking-reschedule-fake-satisfy-payment" disabled={!live || busy !== null} onClick={() => void satisfyReplacementPayment()} type="button" variant="outline">
                  {busy === "replacement-payment" ? "Satisfying payment…" : "Satisfy fake/local payment"}
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">No payment required for this replacement.</p>
              )}
              <Button data-testid="booking-reschedule-confirm" disabled={!live || busy !== null || paymentRequired} onClick={() => void confirmReplacement()} type="button">
                {busy === "replacement-confirm" ? "Confirming replacement…" : "Confirm replacement"}
              </Button>
            </div>
            {paymentRequired ? <p className="text-sm text-muted-foreground">Payment-required state stays honest here. No real checkout provider is connected.</p> : null}
          </section>
        ) : null}

        {showResult ? (
          <section className="space-y-4" data-testid="booking-reschedule-result">
            <Alert>
              <AlertTitle>Replacement confirmed</AlertTitle>
              <AlertDescription>The original booking is now rescheduled, and the replacement booking is confirmed.</AlertDescription>
            </Alert>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border p-4">
                <div className="scheduling-section-head">
                  <div>
                    <h4 className="font-semibold">Original booking</h4>
                    <p className="text-sm text-muted-foreground">{formatDateTimeRange(oldBookingAfterReschedule?.range)}</p>
                  </div>
                  <StatusChip tone="info" label="Rescheduled" />
                </div>
                {oldBookingAfterReschedule ? renderRescheduleRelationBlock(oldBookingAfterReschedule) : null}
              </div>
              <div className="rounded-lg border p-4">
                <div className="scheduling-section-head">
                  <div>
                    <h4 className="font-semibold">Replacement booking</h4>
                    <p className="text-sm text-muted-foreground">{formatDateTimeRange(replacementBooking?.range)}</p>
                  </div>
                  <StatusChip tone="confirmed" label="Confirmed" />
                </div>
                {replacementBooking ? renderRescheduleRelationBlock(replacementBooking) : null}
              </div>
            </div>
            {replacementBooking && props.providerSlug ? (
              <div className="flex flex-wrap gap-3">
                <Button asChild type="button" variant="outline">
                  <a href={linkWithCurrentQuery(`/book/${props.providerSlug}/confirmed/${replacementBooking.id.value}`)}>Open replacement booking</a>
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}

        {errorMessage ? (
          <Alert variant="destructive">
            <AlertTitle>Reschedule could not continue</AlertTitle>
            <AlertDescription>{controlledSchedulingError(errorMessage)}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
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
      <ConfirmationView
        actions={
          <Button asChild variant="secondary">
            <a
              className="scheduling-inline-link"
              data-testid="confirmation-open-bookings"
              href={linkWithCurrentQuery(`/apps/scheduling/bookings?fixture=notification-summary&bookingId=${encodeURIComponent(booking.id.value)}`)}
            >
              Open provider bookings
            </a>
          </Button>
        }
        auditEvents={scenario.auditEvents}
        booking={booking}
        lifecycle={scenario.lifecycle}
        reschedulePanel={
          <BookingReschedulePanel
            booking={scenario.rescheduleState?.oldBooking ?? booking}
            fixtureState={scenario.rescheduleState}
            providerSlug={scenario.providerSlug}
            serviceName={serviceName}
          />
        }
        resourceName="Ada Demo Practice"
        serviceName={serviceName}
      />
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
  const paymentLabel = paymentSummaryLabel(booking) ?? "No payment required";

  return (
    <div className={compact ? "scheduling-stack scheduling-stack-tight" : "scheduling-two-column"}>
      <article className={compact ? "" : "card"}>
        <h4>Payment</h4>
        <div className="scheduling-chip-row">
          <StatusChip tone={chipToneForValue(paymentToneValue(booking))} label={paymentLabel} />
        </div>
        {booking.paymentPolicyLabel ? <p>{booking.paymentPolicyLabel}</p> : null}
        {booking.paymentRequirementStatus === "payment_required" ? (
          <p>This booking requires controlled local/test payment satisfaction before confirmation.</p>
        ) : null}
        {!booking.paymentPolicyLabel && !booking.paymentReference && paymentLabel === "No payment required" ? (
          <p>No payment step is required for this booking.</p>
        ) : null}
        {booking.paymentReference ? <p>Reference: {booking.paymentReference}</p> : null}
        {booking.paymentSatisfiedAt ? <p>Satisfied at: {formatTimestamp(booking.paymentSatisfiedAt, booking.range?.timeZoneId ?? "UTC")}</p> : null}
      </article>

      <article className={compact ? "" : "card"}>
        <h4>Notifications</h4>
        {booking.notificationPolicyLabel ? <p>{booking.notificationPolicyLabel}</p> : null}
        <p>Notification policy only — no real email/SMS provider connected.</p>
        {notificationSummary ? <NotificationSummaryList summary={notificationSummary} /> : <p>No notification records were captured for this booking.</p>}
      </article>
    </div>
  );
}

function NotificationSummaryList({ summary }: { summary: NotificationSummary }) {
  return (
    <ul className="scheduling-checklist scheduling-checklist-tight">
      <li>Pending: {summary.pending}</li>
      <li>Sent fake/local: {summary.sentFake}</li>
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
  const liveContext = loadLiveContext();
  const publicLink = liveContext.providerSlug ? linkWithCurrentQuery(`/book/${liveContext.providerSlug}`) : null;
  const bookingsLink = liveContext.providerId
    ? linkWithCurrentQuery(`/apps/scheduling/bookings?providerId=${encodeURIComponent(liveContext.providerId)}`)
    : linkWithCurrentQuery("/apps/scheduling/bookings");

  return (
    <div className="scheduling-stack">
      <Card>
        <CardHeader>
          <CardTitle>Scheduling real-backend smoke</CardTitle>
          <CardDescription>Use this local/dev admin surface to create a real bookable setup, open the generated public link, and walk the live booking journey end to end.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AdminModeBanner />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Setup provider</CardTitle>
                <CardDescription>Create the provider, resource, service, and availability rule first.</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button asChild data-testid="live-open-setup">
                  <a href={linkWithCurrentQuery("/apps/scheduling/setup")}>Open provider setup</a>
                </Button>
              </CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Public booking demo</CardTitle>
                <CardDescription>{publicLink ? "Open the generated live booking page." : "Available after provider creation."}</CardDescription>
              </CardHeader>
              <CardFooter>
                {publicLink ? (
                  <Button asChild variant="secondary">
                    <a href={publicLink}>Open public booking</a>
                  </Button>
                ) : (
                  <Button disabled type="button" variant="secondary">
                    Open public booking
                  </Button>
                )}
              </CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Provider bookings</CardTitle>
                <CardDescription>Review confirmation, lifecycle, notification summary, and cancellation on live backend data.</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button asChild variant="secondary">
                  <a href={bookingsLink}>Open provider bookings</a>
                </Button>
              </CardFooter>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Policy skeleton status</CardTitle>
          <CardDescription>These reminders stay intentionally honest in local/dev mode.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">No auth/login</Badge>
            <Badge variant="outline">No real payment provider</Badge>
            <Badge variant="outline">No real email or SMS provider</Badge>
            <Badge variant="outline">No calendar sync</Badge>
          </div>
        </CardContent>
      </Card>
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
      <ConfirmationView
        actions={
          <Button asChild data-testid="confirmation-open-bookings" variant="secondary">
            <a href={linkWithCurrentQuery(`/apps/scheduling/bookings?providerId=${encodeURIComponent(booking.providerId?.value ?? liveContext.providerId ?? "")}&bookingId=${encodeURIComponent(booking.id.value)}`)}>
              Open provider bookings
            </a>
          </Button>
        }
        booking={booking}
        reschedulePanel={
          <BookingReschedulePanel
            actor="local-dev-admin"
            booking={booking}
            onOriginalBookingUpdated={setBooking}
            onReplacementConfirmed={(nextBooking) => {
              saveLiveContext({
                providerId: nextBooking.providerId?.value ?? booking.providerId?.value ?? liveContext.providerId,
                bookingId: nextBooking.id.value,
              });
            }}
            providerSlug={loadLiveContext().providerSlug ?? providerSlugFromPath()}
            serviceName="30 minute consult"
          />
        }
        resourceName="M24 Smoke Resource"
        serviceName="30 minute consult"
      />
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
    <div className="scheduling-stack" data-testid="provider-bookings-root">
      <section className="scheduling-subpanel" data-testid="provider-bookings-list">
        <div className="scheduling-section-head">
          <div>
            <h2>Provider bookings</h2>
            <p>Live admin surface for readable booking status, notification summary, and controlled cancellation.</p>
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
          <div className="scheduling-stack scheduling-stack-tight">
            {bookings.map((booking) => {
              const isSelected = selectedBooking?.id.value === booking.id.value;
              return (
                <Card data-testid={`booking-row-${booking.id.value}`} key={booking.id.value}>
                  <CardHeader>
                    <div className="scheduling-section-head">
                      <div>
                        <CardTitle>{booking.customer.name}</CardTitle>
                        <CardDescription>{formatDateTimeRange(booking.range)}</CardDescription>
                      </div>
                      <div className="scheduling-chip-row">
                        <StatusChip tone={chipToneForValue(booking.status)} label={statusLabel(booking.status)} />
                        {paymentSummaryLabel(booking) ? <StatusChip tone={chipToneForValue(paymentToneValue(booking))} label={paymentSummaryLabel(booking)!} /> : <StatusChip tone="neutral" label="No payment required" />}
                        {notificationSummaryLabel(booking.notificationSummary) ? <StatusChip tone="info" label={notificationSummaryLabel(booking.notificationSummary)!} /> : null}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <dl className="scheduling-definition-list">
                      <dt>Email</dt>
                      <dd>{booking.customer.email}</dd>
                      <dt>Timezone</dt>
                      <dd>{booking.range?.timeZoneId ?? "Not recorded"}</dd>
                      <dt>Reference</dt>
                      <dd>{booking.id.value}</dd>
                      {booking.status === "cancelled" && booking.cancellationMessage ? (
                        <>
                          <dt>Cancellation message</dt>
                          <dd>{booking.cancellationMessage}</dd>
                        </>
                      ) : null}
                    </dl>
                  </CardContent>
                  <CardFooter className="gap-3">
                    <Button
                      data-testid={`booking-select-${booking.id.value}`}
                      onClick={() => {
                        setSelectedBooking(booking);
                        if (providerId) void loadBookingDetail(providerId, booking.id.value);
                      }}
                      type="button"
                      variant={isSelected ? "default" : "secondary"}
                    >
                      Inspect
                    </Button>
                    {booking.status === "confirmed" ? (
                      <Button data-testid="booking-cancel" disabled={busy || !isSelected} onClick={() => void cancelSelectedBooking()} type="button" variant="destructive">
                        Cancel booking
                      </Button>
                    ) : null}
                    {booking.status !== "confirmed" ? <StatusChip tone="neutral" label="Confirmed-only actions disabled" /> : null}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {selectedBooking ? (
        <BookingReschedulePanel
          actor="local-dev-admin"
          booking={selectedBooking}
          onOriginalBookingUpdated={(updatedBooking) => {
            setSelectedBooking(updatedBooking);
            setBookings((current) => current.map((entry) => (entry.id.value === updatedBooking.id.value ? updatedBooking : entry)));
          }}
          onReplacementConfirmed={(nextBooking) => {
            if (providerId) void refreshBookings(providerId, nextBooking.id.value);
          }}
          providerSlug={liveContext.providerSlug}
        />
      ) : null}

      {selectedBooking ? <BookingDebugPanel booking={selectedBooking} auditEvents={auditEvents} lifecycle={lifecycle} /> : null}

      {selectedBooking ? (
        <section className="scheduling-subpanel" data-testid="booking-notifications">
          <h3>Notifications</h3>
          <p>Notification policy only — no real email/SMS provider connected.</p>
          {notifications.length ? (
            <ul className="scheduling-audit-list">
              {notifications.map((notification) => (
                <li key={notification.id.value}>
                  <strong>{notification.trigger}</strong> · {notification.status} · {notification.channel} · {formatTimestamp(notification.scheduledForUtc, selectedBooking.range?.timeZoneId ?? "UTC")}
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
  const variant =
    tone === "danger"
      ? "destructive"
      : tone === "neutral"
        ? "outline"
        : tone === "warning"
          ? "secondary"
          : "default";

  return (
    <Badge className={`status-chip status-chip-${tone}`} variant={variant}>
      {label}
    </Badge>
  );
}


function renderRescheduleRelationBlock(booking: Booking) {
  if (!hasRescheduleRelation(booking)) return null;

  return (
    <div className="mt-3 text-sm text-muted-foreground">
      {booking.rescheduledToBookingId ? <p>Rescheduled to {booking.rescheduledToBookingId}.</p> : null}
      {booking.rescheduledFromBookingId ? <p>Rescheduled from {booking.rescheduledFromBookingId}.</p> : null}
      {booking.replacementHoldId ? <p>Replacement hold {booking.replacementHoldId} linked this safe replacement flow.</p> : null}
    </div>
  );
}
