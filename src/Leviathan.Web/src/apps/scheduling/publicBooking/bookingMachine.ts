// Real DeusMachina port of the public booking flow (M3). Three macro
// stages - browsing, held, confirmed - each network step gets its own
// machinalayout/async AsyncTaskController (bookingTasks.ts), same split of
// responsibility as M2's reschedule machine. Fixture mode is genuinely
// interactive (selecting a slot synthesizes a fixture hold synchronously,
// no network call), so fixture and live share the same event vocabulary -
// `holdCreated` fires either way, just produced by different sources
// (a synthesized object vs an async task result).
//
// `live` lives on the board itself, not just as a closure flag, because a
// couple of transitions (selectDate, clearSelection) genuinely behave
// differently in live vs fixture mode (live resets to browsing and clears
// the hold; fixture leaves the current stage alone) and Deus transitions
// only see (board, event), not surrounding component state.

import { M } from "machinalayout/machina";
import type { DeusMachine } from "machinalayout/deus";
import type { BookableSlot, Booking, HoldResponse, SchedulingService } from "../types";

export type PublicBookingCustomer = { name: string; email: string; phone: string; notes: string };

export type PublicBookingBoard = {
  live: boolean;
  providerName: string;
  providerSlug?: string;
  providerTimeZone: string;
  providerDescription: string;
  services: SchedulingService[];
  selectedServiceId?: string;
  slots: BookableSlot[];
  selectedDateKey?: string;
  selectedSlotKey?: string;
  activeMonthKey?: string;
  hold: HoldResponse | null;
  booking: Booking | null;
  customer: PublicBookingCustomer;
  /** Fixture-mode-only error passthrough - live-mode errors live on the relevant AsyncTaskController's own snapshot instead. */
  fixtureErrorMessage?: string;
};

export type PublicBookingEvent =
  | { type: "providerLoaded"; providerName: string; providerSlug: string; providerTimeZone: string; providerDescription: string; services: SchedulingService[] }
  | { type: "selectService"; serviceId: string }
  | { type: "slotsLoaded"; slots: BookableSlot[] }
  | { type: "selectDate"; dateKey: string }
  | { type: "selectMonth"; monthKey: string }
  | { type: "holdCreated"; hold: HoldResponse; slotKey: string; dateKey: string }
  | { type: "intakeUpdated"; hold: HoldResponse }
  | { type: "paymentSatisfied"; hold: HoldResponse }
  | { type: "bookingConfirmed"; booking: Booking }
  | { type: "editCustomerField"; field: keyof PublicBookingCustomer; value: string }
  | { type: "clearSelection" };

const browsing = ["booking", "browsing"] as const;
const held = ["booking", "held"] as const;
const confirmed = ["booking", "confirmed"] as const;

export function createPublicBookingMachine(): DeusMachine<PublicBookingBoard, PublicBookingEvent> {
  return M.machine<PublicBookingBoard, PublicBookingEvent>({
    initial: browsing,
    states: [
      // Shared parent for transitions that apply regardless of stage - same
      // "declare the bare prefix explicitly" requirement every machine in
      // this app has needed since M0: `from` must exactly match a declared
      // state, the parent-prefix walk only happens later during matching.
      M.state(["booking"]),
      M.state(browsing),
      M.state(held),
      M.state(confirmed),
    ],
    transitions: [
      {
        key: "booking.providerLoaded",
        from: ["booking"],
        event: "providerLoaded",
        do: (b, e) => {
          if (e.type !== "providerLoaded") return;
          b.providerName = e.providerName;
          b.providerSlug = e.providerSlug;
          b.providerTimeZone = e.providerTimeZone;
          b.providerDescription = e.providerDescription;
          b.services = e.services;
          if (!e.services.some((service) => service.id.value === b.selectedServiceId)) {
            b.selectedServiceId = e.services[0]?.id.value;
          }
        },
      },
      {
        key: "booking.selectService",
        from: ["booking"],
        event: "selectService",
        do: (b, e) => {
          if (e.type !== "selectService") return;
          b.selectedServiceId = e.serviceId;
          b.selectedSlotKey = undefined;
          b.selectedDateKey = undefined;
          // Matches the original exactly: live mode clears the hold when
          // switching services (a hold is tied to a specific service/slot);
          // fixture mode leaves whatever fixture hold was already there.
          if (b.live) b.hold = null;
          b.fixtureErrorMessage = undefined;
        },
      },
      {
        key: "booking.slotsLoaded",
        from: ["booking"],
        event: "slotsLoaded",
        do: (b, e) => {
          if (e.type !== "slotsLoaded") return;
          b.slots = e.slots;
        },
      },
      {
        key: "booking.selectMonth",
        from: ["booking"],
        event: "selectMonth",
        do: (b, e) => {
          if (e.type !== "selectMonth") return;
          b.activeMonthKey = e.monthKey;
        },
      },
      // selectDate: live resets all the way back to browsing (a date change
      // invalidates any hold on the old slot); fixture just updates the
      // date and leaves the current stage alone. Same event, mutually
      // exclusive `when` on `b.live` decides which shape applies - a single
      // transition can't conditionally have a `to` or not.
      {
        key: "booking.selectDate.live",
        from: ["booking"],
        event: "selectDate",
        to: browsing,
        when: (b) => b.live,
        do: (b, e) => {
          if (e.type !== "selectDate") return;
          b.selectedDateKey = e.dateKey;
          b.selectedSlotKey = undefined;
          b.hold = null;
          b.booking = null;
        },
      },
      {
        key: "booking.selectDate.fixture",
        from: ["booking"],
        event: "selectDate",
        when: (b) => !b.live,
        do: (b, e) => {
          if (e.type !== "selectDate") return;
          b.selectedDateKey = e.dateKey;
          b.selectedSlotKey = undefined;
        },
      },
      M.on("holdCreated", browsing, held, (b, e) => {
        if (e.type !== "holdCreated") return;
        b.hold = e.hold;
        b.selectedSlotKey = e.slotKey;
        b.selectedDateKey = e.dateKey;
        b.fixtureErrorMessage = undefined;
      }),
      // Re-selecting a slot while a hold already exists (live: rebinds to a
      // new hold; fixture: `selectSlot`'s `board.hold ?? {...}` keeps the
      // existing fixture hold and just updates which slot looks selected) -
      // same event, same-state transition since there's no stage change.
      {
        key: "held.holdCreated",
        from: held,
        event: "holdCreated",
        do: (b, e) => {
          if (e.type !== "holdCreated") return;
          b.hold = e.hold;
          b.selectedSlotKey = e.slotKey;
          b.selectedDateKey = e.dateKey;
          b.fixtureErrorMessage = undefined;
        },
      },
      {
        key: "held.intakeUpdated",
        from: held,
        event: "intakeUpdated",
        do: (b, e) => {
          if (e.type !== "intakeUpdated") return;
          b.hold = e.hold;
        },
      },
      {
        key: "held.paymentSatisfied",
        from: held,
        event: "paymentSatisfied",
        do: (b, e) => {
          if (e.type !== "paymentSatisfied") return;
          b.hold = e.hold;
        },
      },
      M.on("bookingConfirmed", held, confirmed, (b, e) => {
        if (e.type !== "bookingConfirmed") return;
        b.booking = e.booking;
      }),
      {
        key: "booking.editCustomerField",
        from: ["booking"],
        event: "editCustomerField",
        do: (b, e) => {
          if (e.type !== "editCustomerField") return;
          b.customer = { ...b.customer, [e.field]: e.value };
        },
      },
      // clearSelection: live drops the hold and returns to browsing;
      // fixture only clears the selected slot key. Same
      // mutually-exclusive-when trick as selectDate.
      {
        key: "booking.clearSelection.live",
        from: ["booking"],
        event: "clearSelection",
        to: browsing,
        when: (b) => b.live,
        do: (b) => {
          b.selectedSlotKey = undefined;
          b.hold = null;
          b.booking = null;
        },
      },
      {
        key: "booking.clearSelection.fixture",
        from: ["booking"],
        event: "clearSelection",
        when: (b) => !b.live,
        do: (b) => {
          b.selectedSlotKey = undefined;
        },
      },
    ],
  });
}
