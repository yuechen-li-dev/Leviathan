// Real DeusMachina port of the reschedule flow's stage (M2) - the
// "cleanest named-but-unbuilt machine" case from the original DeusMachina
// port audit: fixtures.ts already typed this as
// `stage: "available" | "picker" | "replacement" | "result"`, the old
// component just never built the machine that type implied.
//
// Split of responsibility, now that machinalayout/async exists: this
// machine governs macro STAGE only (available -> picker -> replacement ->
// result). Each individual network call's micro lifecycle (pending/failed/
// succeeded) lives in its own AsyncTaskController (see rescheduleTasks.ts +
// BookingReschedulePanel.tsx), not in this board. That's a cleaner split
// than M0's setup port, which had to fold pending/failed into the stage
// machine itself because AsyncTaskController didn't exist yet when M0 was
// built.

import { M } from "machinalayout/machina";
import type { DeusMachine } from "machinalayout/deus";
import { dateFromDateKey, dateKeyForSlot, monthKeyForDate, slotKey } from "../shared/format";
import type { BookableSlot, Booking, SchedulingLifecycleSummary } from "../types";
import type { ReplacementHoldResponse } from "./rescheduleTasks";

export type RescheduleStage = "available" | "picker" | "replacement" | "result";

export type RescheduleCustomer = { name: string; email: string; phone: string; notes: string };

export type RescheduleBoard = {
  slots: BookableSlot[];
  selectedSlotKey?: string;
  selectedDateKey?: string;
  calendarMonthKey?: string;
  replacementHold: ReplacementHoldResponse | null;
  replacementBooking: Booking | null;
  oldBookingAfterReschedule: Booking | null;
  replacementLifecycle: SchedulingLifecycleSummary | null | undefined;
  customer: RescheduleCustomer;
  /** Fixture-mode-only error passthrough - live-mode errors live on the relevant AsyncTaskController's own snapshot instead. */
  fixtureErrorMessage?: string;
};

export type RescheduleFixtureState = {
  stage: RescheduleStage;
  slots?: BookableSlot[];
  selectedSlot?: BookableSlot;
  replacementHold?: ReplacementHoldResponse | null;
  replacementBooking?: Booking | null;
  oldBooking?: Booking | null;
  lifecycle?: SchedulingLifecycleSummary | null;
  errorMessage?: string;
};

export type RescheduleEvent =
  | { type: "openPicker" }
  | { type: "keepCurrentTime" }
  | { type: "slotsLoaded"; slots: BookableSlot[] }
  | { type: "selectDate"; dateKey: string }
  | { type: "selectMonth"; monthKey: string }
  | { type: "selectSlot"; slotKey: string }
  | { type: "holdCreated"; hold: ReplacementHoldResponse }
  | { type: "intakeUpdated"; paymentRequirementStatus?: string; paymentReference?: string | null }
  | { type: "paymentSatisfied"; paymentRequirementStatus?: string; paymentReference?: string | null }
  | { type: "replacementConfirmed"; replacementBooking: Booking; oldBooking: Booking }
  | { type: "editCustomerField"; field: keyof RescheduleCustomer; value: string }
  | { type: "applyFixtureState"; fixtureState: RescheduleFixtureState };

const available = ["reschedule", "available"] as const;
const picker = ["reschedule", "picker"] as const;
const replacement = ["reschedule", "replacement"] as const;
const result = ["reschedule", "result"] as const;

function stageToPath(stage: RescheduleStage) {
  switch (stage) {
    case "available":
      return available;
    case "picker":
      return picker;
    case "replacement":
      return replacement;
    case "result":
      return result;
  }
}

export function createRescheduleMachine(): DeusMachine<RescheduleBoard, RescheduleEvent> {
  return M.machine<RescheduleBoard, RescheduleEvent>({
    initial: available,
    states: [
      // Shared parent for the two transitions that apply regardless of
      // stage (editing the customer form, and fixture-state sync) - same
      // "declare the bare prefix explicitly" requirement M0 found: from
      // paths must exactly match a declared state, the parent-prefix walk
      // only happens later during matching, not at definition time.
      M.state(["reschedule"]),
      M.state(available),
      M.state(picker),
      M.state(replacement),
      M.state(result),
    ],
    transitions: [
      M.on("openPicker", available, picker),
      M.on("keepCurrentTime", picker, available),

      {
        key: "picker.slotsLoaded",
        from: picker,
        event: "slotsLoaded",
        do: (b, e) => {
          if (e.type !== "slotsLoaded") return;
          b.slots = e.slots;
        },
      },
      {
        key: "picker.selectDate",
        from: picker,
        event: "selectDate",
        do: (b, e) => {
          if (e.type !== "selectDate") return;
          b.selectedDateKey = e.dateKey;
          b.selectedSlotKey = undefined;
        },
      },
      {
        key: "picker.selectMonth",
        from: picker,
        event: "selectMonth",
        do: (b, e) => {
          if (e.type !== "selectMonth") return;
          b.calendarMonthKey = e.monthKey;
        },
      },
      {
        key: "picker.selectSlot",
        from: picker,
        event: "selectSlot",
        do: (b, e) => {
          if (e.type !== "selectSlot") return;
          b.selectedSlotKey = e.slotKey;
        },
      },

      M.on("holdCreated", picker, replacement, (b, e) => {
        if (e.type !== "holdCreated") return;
        b.replacementHold = e.hold;
        b.replacementLifecycle = e.hold.lifecycle ?? null;
      }),

      {
        key: "replacement.intakeUpdated",
        from: replacement,
        event: "intakeUpdated",
        do: (b, e) => {
          if (e.type !== "intakeUpdated") return;
          b.replacementLifecycle = {
            status: b.replacementLifecycle?.status ?? b.replacementHold?.lifecycle?.status ?? "active",
            ...(b.replacementLifecycle ?? {}),
            paymentRequirementStatus: e.paymentRequirementStatus ?? b.replacementLifecycle?.paymentRequirementStatus,
            paymentReference: e.paymentReference ?? b.replacementLifecycle?.paymentReference,
          } as SchedulingLifecycleSummary;
        },
      },
      {
        key: "replacement.paymentSatisfied",
        from: replacement,
        event: "paymentSatisfied",
        do: (b, e) => {
          if (e.type !== "paymentSatisfied") return;
          b.replacementLifecycle = {
            status: b.replacementLifecycle?.status ?? b.replacementHold?.lifecycle?.status ?? "active",
            ...(b.replacementLifecycle ?? {}),
            paymentRequirementStatus: e.paymentRequirementStatus,
            paymentReference: e.paymentReference,
          } as SchedulingLifecycleSummary;
        },
      },
      M.on("replacementConfirmed", replacement, result, (b, e) => {
        if (e.type !== "replacementConfirmed") return;
        b.replacementBooking = e.replacementBooking;
        b.oldBookingAfterReschedule = e.oldBooking;
      }),

      {
        key: "reschedule.editCustomerField",
        from: ["reschedule"],
        event: "editCustomerField",
        do: (b, e) => {
          if (e.type !== "editCustomerField") return;
          b.customer = { ...b.customer, [e.field]: e.value };
        },
      },
      {
        key: "reschedule.applyFixtureState",
        from: ["reschedule"],
        event: "applyFixtureState",
        to: (_b, e) => (e.type === "applyFixtureState" ? stageToPath(e.fixtureState.stage) : available),
        do: (b, e) => {
          if (e.type !== "applyFixtureState") return;
          const fixtureState = e.fixtureState;
          b.slots = fixtureState.slots ?? [];
          // Matches the original useEffect exactly: selectedSlotKey does
          // get resynced on every fixtureState update, but
          // selectedDateKey/calendarMonthKey deliberately don't (the
          // original only derived those once, from the initial useState
          // call) - preserved here rather than "fixed", since fixture
          // scenarios are chosen once at mount via URL params in practice,
          // never swapped live.
          b.selectedSlotKey = fixtureState.selectedSlot ? slotKey(fixtureState.selectedSlot) : undefined;
          b.replacementHold = fixtureState.replacementHold ?? null;
          b.replacementBooking = fixtureState.replacementBooking ?? null;
          b.oldBookingAfterReschedule = fixtureState.oldBooking ?? null;
          b.replacementLifecycle = fixtureState.lifecycle;
          b.fixtureErrorMessage = fixtureState.errorMessage;
        },
      },
    ],
  });
}

/**
 * Board seed for the INITIAL render, fixture mode only. Needs to be
 * correct on the very first paint without any dispatch running first -
 * `renderToStaticMarkup` (what the fixture-mode tests use) never runs
 * effects, so a component that only got fixture data via a `useEffect`
 * dispatch would render the wrong thing in every static-rendered test.
 * This is the same class of problem M0 hit with `createDeusSnapshot`
 * always starting at `machine.initial` - the fix here is the same idea:
 * feed the real data in as the board's initial value directly, rather than
 * relying on a dispatch to arrive first.
 */
export function boardFromFixtureState(fixtureState: RescheduleFixtureState, customer: RescheduleCustomer): RescheduleBoard {
  const selectedDateKey = fixtureState.selectedSlot ? dateKeyForSlot(fixtureState.selectedSlot) : undefined;
  return {
    slots: fixtureState.slots ?? [],
    selectedSlotKey: fixtureState.selectedSlot ? slotKey(fixtureState.selectedSlot) : undefined,
    selectedDateKey,
    calendarMonthKey: selectedDateKey ? monthKeyForDate(dateFromDateKey(selectedDateKey)) : undefined,
    replacementHold: fixtureState.replacementHold ?? null,
    replacementBooking: fixtureState.replacementBooking ?? null,
    oldBookingAfterReschedule: fixtureState.oldBooking ?? null,
    replacementLifecycle: fixtureState.lifecycle,
    customer,
    fixtureErrorMessage: fixtureState.errorMessage,
  };
}

/**
 * Reads the RescheduleStage leaf off a Deus state path. Used for live mode
 * only - fixture mode reads `stage` directly from `props.fixtureState.stage`
 * instead (see the SSR note on `boardFromFixtureState` above), since the
 * machine's own graph state isn't guaranteed correct until after the first
 * effect runs, and static rendering never runs effects at all.
 */
export function phaseFromRescheduleState(path: readonly string[]): RescheduleStage {
  const leaf = path[path.length - 1];
  if (leaf === "available" || leaf === "picker" || leaf === "replacement" || leaf === "result") {
    return leaf;
  }
  return "available";
}
