// Public booking flow orchestrator (M3). SchedulingBookingPageProvider used
// to hold ~15 useState calls plus a `busy: string | null` shared across
// four async operations, branching on a `live` boolean at nearly every
// mutation point. Now driven by a real M.machine (bookingMachine.ts,
// browsing -> held -> confirmed) plus one AsyncTaskController per network
// step (bookingTasks.ts). BookingPageContextValue's field shape is
// deliberately kept identical to before - the ~20 presentational
// components downstream (BookingHeaderContent, BookingProviderIdentity,
// etc.) read `page.X` directly and don't need to change at all; only this
// provider's internals changed.
//
// Fixture mode is genuinely interactive here (unlike reschedule's fixture
// mode, which is a static preview driven entirely by props) - selecting a
// slot in fixture mode synthesizes a fixture hold synchronously, no
// network call. Both modes dispatch the same `holdCreated` event; only the
// hold's origin differs.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useDeusMachine } from "machinalayout/react";
import { matchKind } from "machinalayout/match";
import type { SchedulingFixtureScenario } from "../fixtures";
import { resolveSchedulingFixtureScenario } from "../fixtures";
import {
  browserTimeZone,
  buildAvailableDates,
  buildMonthOptions,
  dateFromDateKey,
  dateKeyForSlot,
  isPaymentRequiredError,
  longDateLabelForDateKey,
  longDateLabelForSlot,
  monthDateFromMonthKey,
  monthKeyForDate,
  servicePriceLabel as servicePriceLabelFor,
  slotKey,
  timeLabelForSlot,
} from "../shared/format";
import { defaultCustomer, fixtureCustomer, isFixtureMode, linkWithCurrentQuery, loadLiveContext, providerSlugFromPath, saveLiveContext } from "../shared/liveContext";
import { useAsyncTask } from "../../../machina/useAsyncTask";
import type { BookableSlot, Booking, HoldResponse, SchedulingService } from "../types";
import { createPublicBookingMachine, type PublicBookingBoard } from "./bookingMachine";
import {
  confirmPublicBookingTask,
  createPublicHoldTask,
  listPublicSlotsTask,
  loadProviderAndServicesTask,
  satisfyPublicPaymentTask,
  submitPublicIntakeTask,
} from "./bookingTasks";

type SlotPresentation = { slot: BookableSlot; label: string; sublabel: string; selected: boolean };

export type BookingPageContextValue = {
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

const BookingPageContext = createContext<BookingPageContextValue | null>(null);

export function useBookingPage() {
  const value = useContext(BookingPageContext);
  if (!value) throw new Error("Scheduling booking page context is unavailable.");
  return value;
}

function taskErrorMessage(error: unknown): string | undefined {
  if (error === undefined) return undefined;
  return error instanceof Error ? error.message : String(error);
}

const publicBookingMachine = createPublicBookingMachine();

function initialBoard(live: boolean, scenario: SchedulingFixtureScenario): PublicBookingBoard {
  const liveContext = loadLiveContext();
  const fixturePreferredSlot =
    scenario.slots?.find((slot) => slot.displayLabel.includes("Fri May 16, 10:00 AM")) ??
    scenario.slots?.find((slot) => slot.displayLabel.includes("10:00 AM")) ??
    scenario.slots?.[0];

  return {
    live,
    providerName: scenario.providerName ?? liveContext.providerName ?? "Emma Brown",
    providerSlug: scenario.providerSlug ?? liveContext.providerSlug,
    providerTimeZone: scenario.providerTimeZone ?? liveContext.providerTimeZone ?? browserTimeZone(),
    providerDescription: live ? "Public booking with the existing Leviathan local-dev backend flow." : "Office Hours",
    services: live ? [] : scenario.services ?? [],
    selectedServiceId: live
      ? undefined
      : scenario.services?.find((service) => service.durationMinutes === 30)?.id.value ?? scenario.services?.[0]?.id.value,
    slots: live ? [] : scenario.slots ?? [],
    selectedDateKey: live ? undefined : fixturePreferredSlot ? dateKeyForSlot(fixturePreferredSlot) : undefined,
    selectedSlotKey: live ? undefined : fixturePreferredSlot ? slotKey(fixturePreferredSlot) : undefined,
    activeMonthKey: undefined,
    hold: live
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
    booking: live ? null : scenario.booking ?? null,
    customer: live ? defaultCustomer : fixtureCustomer,
    fixtureErrorMessage: live ? undefined : scenario.errorMessage,
  };
}

export function SchedulingBookingPageProvider(props: { scenario?: SchedulingFixtureScenario | null; children: ReactNode }) {
  const scenario =
    props.scenario ??
    resolveSchedulingFixtureScenario({
      pathname: typeof window === "undefined" ? "/book/demo-provider" : window.location.pathname,
      search: typeof window === "undefined" ? "?fixture=public-booking" : window.location.search,
    } as Location);
  const live = !isFixtureMode();

  const deus = useDeusMachine(publicBookingMachine, () => initialBoard(live, scenario));
  const board = deus.board;

  const providerTask = useAsyncTask(loadProviderAndServicesTask);
  const slotsTask = useAsyncTask(listPublicSlotsTask);
  const holdTask = useAsyncTask(createPublicHoldTask);
  const intakeTask = useAsyncTask(submitPublicIntakeTask);
  const paymentTask = useAsyncTask(satisfyPublicPaymentTask);
  const confirmTask = useAsyncTask(confirmPublicBookingTask);

  // Load provider + services once, live mode only.
  useEffect(() => {
    if (!live) return;
    const slug = providerSlugFromPath();
    if (!slug) return;
    void providerTask.run({ providerSlug: slug }).then((result) =>
      matchKind(result, {
        ok: (r) => {
          deus.dispatch({
            type: "providerLoaded",
            providerName: r.value.provider.displayName,
            providerSlug: r.value.provider.slug,
            providerTimeZone: r.value.provider.timeZoneId,
            providerDescription: r.value.provider.publicDescription?.trim() || "Public booking with the existing Leviathan local-dev backend flow.",
            services: r.value.services,
          });
          saveLiveContext({
            providerId: r.value.provider.id.value,
            providerSlug: r.value.provider.slug,
            providerName: r.value.provider.displayName,
            providerTimeZone: r.value.provider.timeZoneId,
            serviceId: r.value.services[0]?.id.value,
          });
        },
        err: () => {},
        cancelled: () => {},
        timeout: () => {},
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  // Reload slots whenever the selected service changes, live mode only.
  useEffect(() => {
    if (!live || !board.selectedServiceId) return;
    const slug = providerSlugFromPath();
    if (!slug) return;
    const from = new Date();
    const to = new Date(from.getTime() + 21 * 24 * 60 * 60 * 1000);
    void slotsTask
      .run({ providerSlug: slug, serviceId: board.selectedServiceId, from: from.toISOString(), to: to.toISOString(), timeZone: browserTimeZone() })
      .then((result) => matchKind(result, {
        ok: (r) => deus.dispatch({ type: "slotsLoaded", slots: r.value }),
        err: () => {},
        cancelled: () => {},
        timeout: () => {},
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, board.selectedServiceId]);

  const selectedService = board.services.find((service) => service.id.value === board.selectedServiceId) ?? board.services[0];
  const serviceSlots = board.slots
    .filter((slot) => !board.selectedServiceId || slot.serviceId === board.selectedServiceId)
    .sort((left, right) => left.startsAtUtc.localeCompare(right.startsAtUtc));
  const availableDates = buildAvailableDates(serviceSlots);
  const selectedDate =
    board.selectedDateKey && availableDates.some((entry) => entry.dateKey === board.selectedDateKey)
      ? board.selectedDateKey
      : availableDates[0]?.dateKey;
  const months = buildMonthOptions(availableDates);
  const resolvedMonthKey =
    board.activeMonthKey && months.some((entry) => entry.monthKey === board.activeMonthKey)
      ? board.activeMonthKey
      : selectedDate
        ? selectedDate.slice(0, 7)
        : months[0]?.monthKey;
  const calendarMonth = monthDateFromMonthKey(resolvedMonthKey);
  const calendarStartMonth = monthDateFromMonthKey(months[0]?.monthKey);
  const calendarEndMonth = monthDateFromMonthKey(months.at(-1)?.monthKey);
  const slotGroups: SlotPresentation[] = serviceSlots
    .filter((slot) => !selectedDate || dateKeyForSlot(slot) === selectedDate)
    .map((slot) => ({
      slot,
      label: timeLabelForSlot(slot),
      sublabel: slot.displayStartsAtLocal,
      selected: board.selectedSlotKey === slotKey(slot),
    }));
  const selectedSlot = serviceSlots.find((slot) => slotKey(slot) === board.selectedSlotKey);
  const dayHeadline = selectedSlot ? longDateLabelForSlot(selectedSlot) : selectedDate ? longDateLabelForDateKey(selectedDate) : "Choose a day";
  const timezoneLabel = selectedSlot?.displayTimeZoneId ?? serviceSlots[0]?.displayTimeZoneId ?? board.providerTimeZone;

  const busy =
    providerTask.snapshot.board.status === "running"
      ? "provider"
      : slotsTask.snapshot.board.status === "running"
        ? "slots"
        : holdTask.snapshot.board.status === "running"
          ? "hold"
          : intakeTask.snapshot.board.status === "running"
            ? "intake"
            : paymentTask.snapshot.board.status === "running"
              ? "payment"
              : confirmTask.snapshot.board.status === "running"
                ? "confirm"
                : null;
  const errorMessage =
    board.fixtureErrorMessage ??
    taskErrorMessage(providerTask.snapshot.board.error) ??
    taskErrorMessage(slotsTask.snapshot.board.error) ??
    taskErrorMessage(holdTask.snapshot.board.error) ??
    taskErrorMessage(intakeTask.snapshot.board.error) ??
    taskErrorMessage(paymentTask.snapshot.board.error) ??
    taskErrorMessage(confirmTask.snapshot.board.error);

  const paymentAlertText = isPaymentRequiredError(errorMessage)
    ? "This booking requires controlled local/test payment satisfaction before confirmation."
    : board.hold?.paymentRequirementStatus === "payment_required"
      ? "This booking still needs controlled local/test payment satisfaction before confirmation."
      : undefined;
  const stepIndex: 0 | 1 | 2 = selectedSlot ? 1 : 0;

  async function selectLiveSlot(slot: BookableSlot, dateKey: string) {
    const result = await holdTask.run({ slot });
    matchKind(result, {
      ok: (r) => {
        deus.dispatch({ type: "holdCreated", hold: r.value, slotKey: slotKey(slot), dateKey });
        saveLiveContext({ providerId: slot.providerId, serviceId: slot.serviceId });
      },
      err: () => {},
      cancelled: () => {},
      timeout: () => {},
    });
  }

  async function submitLiveIntake() {
    if (!board.hold) return;
    const result = await intakeTask.run({ holdId: board.hold.holdId, claimToken: board.hold.claimToken, customer: board.customer });
    matchKind(result, {
      ok: (r) => deus.dispatch({ type: "intakeUpdated", hold: r.value }),
      err: () => {},
      cancelled: () => {},
      timeout: () => {},
    });
  }

  async function confirmLiveBooking() {
    if (!board.hold) return;
    const result = await confirmTask.run({ holdId: board.hold.holdId, claimToken: board.hold.claimToken, customer: board.customer });
    matchKind(result, {
      ok: (r) => {
        deus.dispatch({ type: "bookingConfirmed", booking: r.value });
        saveLiveContext({ bookingId: r.value.id.value });
        if (typeof window !== "undefined") {
          window.location.assign(linkWithCurrentQuery(`/book/${providerSlugFromPath()}/confirmed/${r.value.id.value}`));
        }
      },
      err: () => {},
      cancelled: () => {},
      timeout: () => {},
    });
  }

  async function satisfyLivePayment() {
    if (!board.hold) return;
    const result = await paymentTask.run({ holdId: board.hold.holdId, claimToken: board.hold.claimToken });
    matchKind(result, {
      ok: (r) => deus.dispatch({ type: "paymentSatisfied", hold: { ...board.hold!, ...r.value } }),
      err: () => {},
      cancelled: () => {},
      timeout: () => {},
    });
  }

  const value: BookingPageContextValue = useMemo(
    () => ({
      live,
      scenario,
      providerName: board.providerName,
      providerRole: live ? "Public booking" : "Office Hours",
      providerDescription: board.providerDescription,
      providerSlug: board.providerSlug,
      providerTimeZone: board.providerTimeZone,
      providerAvailabilityLabel: live ? "Available through local-dev availability" : "Available this week",
      services: board.services,
      selectedService,
      selectedServiceId: board.selectedServiceId,
      selectedServiceDurationLabel: selectedService ? `${selectedService.durationMinutes} min` : "Duration unavailable",
      serviceLocationLabel: "Google Meet",
      servicePriceLabel: servicePriceLabelFor(selectedService, board.hold),
      selectedDateKey: selectedDate,
      selectedSlot,
      hold: board.hold,
      booking: board.booking,
      busy,
      errorMessage,
      customer: board.customer,
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
      selectService: (serviceId) => deus.dispatch({ type: "selectService", serviceId }),
      selectDate: (dateKey) => deus.dispatch({ type: "selectDate", dateKey }),
      setCalendarMonth: (month) => {
        const monthKey = monthKeyForDate(month);
        if (months.some((entry) => entry.monthKey === monthKey)) {
          deus.dispatch({ type: "selectMonth", monthKey });
        }
      },
      selectSlot: (slot) => {
        const dateKey = dateKeyForSlot(slot);
        if (live) {
          void selectLiveSlot(slot, dateKey);
          return;
        }
        // Fixture mode: synthesize a fixture hold synchronously, same shape
        // the original component's local-state branch produced. No network
        // call - the intake/confirm/payment buttons stay disabled in
        // fixture mode regardless (see BookingIntakeForm's `page.live`
        // checks), so this only needs to support the slot-selection preview.
        // Matches the original's `current ?? {...}` exactly: re-selecting a
        // different slot while already held keeps the existing fixture
        // hold object, just moves which slot looks selected.
        deus.dispatch({
          type: "holdCreated",
          slotKey: slotKey(slot),
          dateKey,
          hold: board.hold ?? {
            holdId: "fixture-hold",
            claimToken: "fixture-claim",
            expiresAt: slot.endsAtUtc,
            status: "held",
            paymentRequirementStatus: scenario.errorMessage === "payment_required" ? "payment_required" : "not_required",
          },
        });
      },
      clearSelection: () => deus.dispatch({ type: "clearSelection" }),
      setCustomerField: (field, value) => deus.dispatch({ type: "editCustomerField", field, value }),
      submitIntake: () => {
        if (live) void submitLiveIntake();
      },
      confirmBooking: () => {
        if (live) void confirmLiveBooking();
      },
      satisfyPayment: () => {
        if (live) void satisfyLivePayment();
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }),
    [live, scenario, board, selectedService, selectedDate, selectedSlot, availableDates, calendarMonth, calendarStartMonth, calendarEndMonth, dayHeadline, slotGroups, timezoneLabel, busy, errorMessage, paymentAlertText, months],
  );

  return <BookingPageContext.Provider value={value}>{props.children}</BookingPageContext.Provider>;
}
