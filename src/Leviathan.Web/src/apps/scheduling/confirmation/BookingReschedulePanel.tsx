// Reschedule panel - M2's real DeusMachina port. Extracted and rebuilt from
// views.tsx. One component still serves both fixture and live mode (that
// was already the right shape in the original code, kept as-is), now
// driven by a real M.machine for stage (available/picker/replacement/
// result) plus five independent AsyncTaskControllers for the network
// steps, instead of five useState calls and a `busy: string | null`.
//
// Fixture-mode rendering reads `stage` directly from `props.fixtureState`
// rather than from the machine's own graph state - see the SSR note on
// `boardFromFixtureState` in rescheduleMachine.ts for why.

import { useEffect } from "react";
import { useDeusMachine } from "machinalayout/react";
import { matchKind } from "machinalayout/match";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { controlledSchedulingError } from "../shared/liveContext";
import { StatusChip } from "../shared/StatusChip";
import {
  bookingRescheduleStateCopy,
  browserTimeZone,
  buildAvailableDates,
  buildMonthOptions,
  chipToneForValue,
  dateFromDateKey,
  dateKeyForDate,
  dateKeyForSlot,
  formatDateTimeRange,
  formatSlotSummary,
  hasRescheduleRelation,
  isBookingReschedulable,
  isPaymentRequiredError,
  lifecycleStateLabel,
  monthDateFromMonthKey,
  monthKeyForDate,
  slotKey,
  slotMatchesBooking,
  statusLabel,
  timeLabelForSlot,
} from "../shared/format";
import { linkWithCurrentQuery } from "../shared/liveContext";
import type { Booking, BookableSlot } from "../types";
import {
  boardFromFixtureState,
  createRescheduleMachine,
  phaseFromRescheduleState,
  type RescheduleFixtureState,
} from "./rescheduleMachine";
import {
  confirmReplacementTask,
  createReplacementHoldTask,
  listReplacementSlotsTask,
  satisfyReplacementPaymentTask,
  submitReplacementIntakeTask,
} from "./rescheduleTasks";
import { useAsyncTask } from "../../../machina/useAsyncTask";

const rescheduleMachine = createRescheduleMachine();

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

export function BookingReschedulePanel(props: {
  booking: Booking;
  providerSlug?: string;
  serviceName?: string;
  actor?: string;
  fixtureState?: RescheduleFixtureState;
  onOriginalBookingUpdated?: (booking: Booking) => void;
  onReplacementConfirmed?: (nextBooking: Booking, oldBooking: Booking) => void;
}) {
  const live = !props.fixtureState;
  const eligible = isBookingReschedulable(props.booking);
  const defaultCustomer = {
    name: props.booking.customer.name,
    email: props.booking.customer.email,
    phone: props.booking.customer.phone ?? "",
    notes: props.booking.customer.notes ?? "",
  };

  const deus = useDeusMachine(rescheduleMachine, () =>
    props.fixtureState
      ? boardFromFixtureState(props.fixtureState, defaultCustomer)
      : {
          slots: [],
          replacementHold: null,
          replacementBooking: null,
          oldBookingAfterReschedule: null,
          replacementLifecycle: undefined,
          customer: defaultCustomer,
        },
  );
  const board = deus.board;

  // Fixture-mode resync on every prop update, matching the original
  // useEffect. See the SSR note in rescheduleMachine.ts for why rendering
  // below reads `props.fixtureState.stage` directly rather than
  // `deus.state` - this dispatch keeps the machine's own graph state (and
  // therefore its inspector trace) honest for interactive/live-preview use,
  // it just isn't load-bearing for what actually renders in fixture mode.
  useEffect(() => {
    if (!props.fixtureState) return;
    deus.dispatch({ type: "applyFixtureState", fixtureState: props.fixtureState });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fixtureState]);

  const stage = props.fixtureState ? props.fixtureState.stage : phaseFromRescheduleState(deus.state);

  const slotsTask = useAsyncTask(listReplacementSlotsTask);
  const holdTask = useAsyncTask(createReplacementHoldTask);
  const intakeTask = useAsyncTask(submitReplacementIntakeTask);
  const paymentTask = useAsyncTask(satisfyReplacementPaymentTask);
  const confirmTask = useAsyncTask(confirmReplacementTask);

  const replacementProviderSlug = props.providerSlug;
  const replacementServiceId = props.booking.serviceId?.value;
  const liveExpanded = stage !== "available";

  // Auto-fetch replacement slots once the picker opens in live mode - same
  // trigger conditions as the original effect, now gated on the slots
  // task's own status instead of a shared `busy` string.
  useEffect(() => {
    if (!live || !liveExpanded || board.replacementHold || board.replacementBooking || !eligible) return;
    if (!replacementProviderSlug || !replacementServiceId) return;
    if (board.slots.length > 0 || slotsTask.snapshot.board.status === "running") return;

    const from = new Date();
    const to = new Date(from.getTime() + 21 * 24 * 60 * 60 * 1000);
    void slotsTask
      .run({ providerSlug: replacementProviderSlug, serviceId: replacementServiceId, from: from.toISOString(), to: to.toISOString(), timeZone: browserTimeZone() })
      .then((result) => matchKind(result, {
        ok: (r) => deus.dispatch({ type: "slotsLoaded", slots: r.value }),
        err: () => {},
        cancelled: () => {},
        timeout: () => {},
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, liveExpanded, board.replacementHold, board.replacementBooking, eligible, replacementProviderSlug, replacementServiceId, board.slots.length]);

  const replacementSlots = board.slots.filter((slot) => !slotMatchesBooking(slot, props.booking));
  const availableDates = buildAvailableDates(replacementSlots);
  const resolvedSelectedDateKey =
    board.selectedDateKey && availableDates.some((entry) => entry.dateKey === board.selectedDateKey)
      ? board.selectedDateKey
      : availableDates[0]?.dateKey;
  const months = buildMonthOptions(availableDates);
  const resolvedMonthKey =
    board.calendarMonthKey && months.some((entry) => entry.monthKey === board.calendarMonthKey)
      ? board.calendarMonthKey
      : resolvedSelectedDateKey
        ? resolvedSelectedDateKey.slice(0, 7)
        : months[0]?.monthKey;
  const calendarMonth = monthDateFromMonthKey(resolvedMonthKey);
  const calendarStartMonth = monthDateFromMonthKey(months[0]?.monthKey);
  const calendarEndMonth = monthDateFromMonthKey(months.at(-1)?.monthKey);
  const visibleSlots = replacementSlots.filter((slot) => !resolvedSelectedDateKey || dateKeyForSlot(slot) === resolvedSelectedDateKey);
  const selectedSlot: BookableSlot | undefined = replacementSlots.find((slot) => slotKey(slot) === board.selectedSlotKey) ?? props.fixtureState?.selectedSlot;
  const currentBooking = board.oldBookingAfterReschedule ?? props.booking;
  const showResult = Boolean(board.replacementBooking && board.oldBookingAfterReschedule);
  const showReplacementFlow = liveExpanded || Boolean(board.replacementHold) || showResult;
  const paymentRequired =
    board.replacementHold?.lifecycle?.paymentRequirementStatus === "payment_required" ||
    board.replacementLifecycle?.paymentRequirementStatus === "payment_required" ||
    isPaymentRequiredError(taskErrorMessage(holdTask.snapshot.board.error) ?? taskErrorMessage(confirmTask.snapshot.board.error));

  const anyTaskRunning = [holdTask, intakeTask, paymentTask, confirmTask].some((t) => t.snapshot.board.status === "running");
  const errorMessage =
    board.fixtureErrorMessage ??
    taskErrorMessage(holdTask.snapshot.board.error) ??
    taskErrorMessage(intakeTask.snapshot.board.error) ??
    taskErrorMessage(paymentTask.snapshot.board.error) ??
    taskErrorMessage(confirmTask.snapshot.board.error);

  async function createLiveReplacementHold() {
    if (!live || !selectedSlot) return;
    const result = await holdTask.run({
      bookingId: props.booking.id.value,
      serviceId: selectedSlot.serviceId,
      resourceId: selectedSlot.resourceId,
      startUtc: selectedSlot.startsAtUtc,
      endUtc: selectedSlot.endsAtUtc,
      timeZoneId: selectedSlot.timeZoneId,
      displayTimeZoneId: selectedSlot.displayTimeZoneId,
      actor: props.actor ?? "local-dev-admin",
    });
    matchKind(result, {
      ok: (r) => deus.dispatch({ type: "holdCreated", hold: r.value }),
      err: () => {},
      cancelled: () => {},
      timeout: () => {},
    });
  }

  async function submitReplacementIntake() {
    if (!live || !board.replacementHold) return;
    const result = await intakeTask.run({ holdId: board.replacementHold.replacementHoldId, claimToken: board.replacementHold.claimToken, customer: board.customer });
    matchKind(result, {
      ok: (r) => deus.dispatch({ type: "intakeUpdated", paymentRequirementStatus: r.value.paymentRequirementStatus, paymentReference: r.value.paymentReference }),
      err: () => {},
      cancelled: () => {},
      timeout: () => {},
    });
  }

  async function satisfyReplacementPayment() {
    if (!live || !board.replacementHold) return;
    const result = await paymentTask.run({ holdId: board.replacementHold.replacementHoldId, claimToken: board.replacementHold.claimToken, actor: props.actor ?? "local-dev-admin" });
    matchKind(result, {
      ok: (r) => deus.dispatch({ type: "paymentSatisfied", paymentRequirementStatus: r.value.paymentRequirementStatus, paymentReference: r.value.paymentReference }),
      err: () => {},
      cancelled: () => {},
      timeout: () => {},
    });
  }

  async function confirmReplacement() {
    if (!live || !board.replacementHold) return;
    const result = await confirmTask.run({
      holdId: board.replacementHold.replacementHoldId,
      claimToken: board.replacementHold.claimToken,
      customer: board.customer,
      originalBookingId: props.booking.id.value,
    });
    matchKind(result, {
      ok: (r) => {
        deus.dispatch({ type: "replacementConfirmed", replacementBooking: r.value.replacementBooking, oldBooking: r.value.oldBooking });
        props.onOriginalBookingUpdated?.(r.value.oldBooking);
        props.onReplacementConfirmed?.(r.value.replacementBooking, r.value.oldBooking);
      },
      err: () => {},
      cancelled: () => {},
      timeout: () => {},
    });
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
            <Button data-testid="booking-reschedule-open" onClick={() => deus.dispatch({ type: "openPicker" })} type="button">
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
                {slotsTask.snapshot.board.status === "running" ? <StatusChip tone="warning" label="Loading slots" /> : null}
              </div>
              {replacementSlots.length ? (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
                  <Card>
                    <CardContent className="pt-4">
                      <Calendar
                        disabled={(date) => !availableDates.some((entry) => entry.dateKey === dateKeyForDate(date))}
                        mode="single"
                        month={calendarMonth}
                        onMonthChange={(month) => deus.dispatch({ type: "selectMonth", monthKey: monthKeyForDate(month) })}
                        onSelect={(date) => {
                          if (!date) return;
                          deus.dispatch({ type: "selectDate", dateKey: dateKeyForDate(date) });
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
                          const selected = slotKey(slot) === board.selectedSlotKey;
                          return (
                            <Button
                              data-testid="booking-reschedule-slot-option"
                              key={slotKey(slot)}
                              onClick={() => deus.dispatch({ type: "selectSlot", slotKey: slotKey(slot) })}
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
                {!board.replacementHold ? (
                  <div className="flex flex-wrap gap-3" data-testid="booking-reschedule-actions">
                    <Button data-testid="booking-reschedule-create-hold" disabled={!live || anyTaskRunning} onClick={() => void createLiveReplacementHold()} type="button">
                      {holdTask.snapshot.board.status === "running" ? "Creating replacement hold…" : "Create replacement hold"}
                    </Button>
                    <Button onClick={() => deus.dispatch({ type: "keepCurrentTime" })} type="button" variant="outline">
                      Keep current time
                    </Button>
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}

        {board.replacementHold ? (
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
                <dd>{board.replacementHold.oldBookingId}</dd>
                <dt>Replacement hold</dt>
                <dd>{board.replacementHold.replacementHoldId}</dd>
                <dt>Target slot</dt>
                <dd>{formatSlotSummary(board.replacementHold.targetSlot)}</dd>
                <dt>Lifecycle state</dt>
                <dd>{lifecycleStateLabel(board.replacementHold.lifecycle ?? board.replacementLifecycle)}</dd>
              </dl>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="replacement-name">Name</Label>
                <Input id="replacement-name" onChange={(event) => deus.dispatch({ type: "editCustomerField", field: "name", value: event.target.value })} value={board.customer.name} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="replacement-email">Email</Label>
                <Input id="replacement-email" onChange={(event) => deus.dispatch({ type: "editCustomerField", field: "email", value: event.target.value })} value={board.customer.email} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="replacement-phone">Phone</Label>
                <Input id="replacement-phone" onChange={(event) => deus.dispatch({ type: "editCustomerField", field: "phone", value: event.target.value })} value={board.customer.phone} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="replacement-notes">Notes</Label>
                <Textarea id="replacement-notes" onChange={(event) => deus.dispatch({ type: "editCustomerField", field: "notes", value: event.target.value })} value={board.customer.notes} />
              </div>
            </div>
            <div className="flex flex-wrap gap-3" data-testid="booking-reschedule-actions">
              <Button data-testid="booking-reschedule-submit-intake" disabled={!live || anyTaskRunning} onClick={() => void submitReplacementIntake()} type="button" variant="secondary">
                {intakeTask.snapshot.board.status === "running" ? "Saving details…" : "Save replacement details"}
              </Button>
              {paymentRequired ? (
                <Button data-testid="booking-reschedule-fake-satisfy-payment" disabled={!live || anyTaskRunning} onClick={() => void satisfyReplacementPayment()} type="button" variant="outline">
                  {paymentTask.snapshot.board.status === "running" ? "Satisfying payment…" : "Satisfy fake/local payment"}
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">No payment required for this replacement.</p>
              )}
              <Button data-testid="booking-reschedule-confirm" disabled={!live || anyTaskRunning || paymentRequired} onClick={() => void confirmReplacement()} type="button">
                {confirmTask.snapshot.board.status === "running" ? "Confirming replacement…" : "Confirm replacement"}
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
                    <p className="text-sm text-muted-foreground">{formatDateTimeRange(board.oldBookingAfterReschedule?.range)}</p>
                  </div>
                  <StatusChip tone="info" label="Rescheduled" />
                </div>
                {board.oldBookingAfterReschedule ? renderRescheduleRelationBlock(board.oldBookingAfterReschedule) : null}
              </div>
              <div className="rounded-lg border p-4">
                <div className="scheduling-section-head">
                  <div>
                    <h4 className="font-semibold">Replacement booking</h4>
                    <p className="text-sm text-muted-foreground">{formatDateTimeRange(board.replacementBooking?.range)}</p>
                  </div>
                  <StatusChip tone="confirmed" label="Confirmed" />
                </div>
                {board.replacementBooking ? renderRescheduleRelationBlock(board.replacementBooking) : null}
              </div>
            </div>
            {board.replacementBooking && props.providerSlug ? (
              <div className="flex flex-wrap gap-3">
                <Button asChild type="button" variant="outline">
                  <a href={linkWithCurrentQuery(`/book/${props.providerSlug}/confirmed/${board.replacementBooking.id.value}`)}>Open replacement booking</a>
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

function taskErrorMessage(error: unknown): string | undefined {
  if (error === undefined) return undefined;
  return error instanceof Error ? error.message : String(error);
}
