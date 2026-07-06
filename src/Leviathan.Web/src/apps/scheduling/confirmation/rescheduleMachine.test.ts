import { describe, expect, it } from "vitest";
import { createDeusSnapshot, stepDeusMachine } from "machinalayout/deus";
import { createRescheduleMachine, type RescheduleBoard } from "./rescheduleMachine";
import type { BookableSlot, Booking } from "../types";

function initialBoard(): RescheduleBoard {
  return {
    slots: [],
    replacementHold: null,
    replacementBooking: null,
    oldBookingAfterReschedule: null,
    replacementLifecycle: undefined,
    customer: { name: "Ada", email: "a@example.test", phone: "", notes: "" },
  };
}

const slot: BookableSlot = {
  providerId: "p",
  serviceId: "s",
  resourceId: "r",
  startsAtUtc: "2030-03-14T15:00:00Z",
  endsAtUtc: "2030-03-14T15:30:00Z",
  timeZoneId: "UTC",
  displayLabel: "Mar 14",
  providerTimeZoneId: "UTC",
  displayTimeZoneId: "UTC",
  displayStartsAtLocal: "2030-03-14 15:00",
  displayEndsAtLocal: "2030-03-14 15:30",
};

const hold = {
  oldBookingId: "b1",
  replacementHoldId: "h1",
  claimToken: "tok",
  targetSlot: slot,
  lifecycle: { status: "active" } as any,
};

function booking(id: string): Booking {
  return {
    id: { value: id },
    status: "confirmed",
    customer: { name: "Ada", email: "a@example.test" },
    range: { startsAtUtc: "2030-01-01T00:00:00Z", endsAtUtc: "2030-01-01T00:30:00Z", timeZoneId: "UTC" },
  } as Booking;
}

describe("reschedule machine - stage transitions", () => {
  it("walks available -> picker -> replacement -> result in order", () => {
    const machine = createRescheduleMachine();
    let snap = createDeusSnapshot(machine, initialBoard());
    expect(snap.state).toEqual(["reschedule", "available"]);

    snap = stepDeusMachine(machine, snap, { type: "openPicker" }).snapshot;
    expect(snap.state).toEqual(["reschedule", "picker"]);

    const holdResult = stepDeusMachine(machine, snap, { type: "holdCreated", hold });
    expect(holdResult.trace.selectedTransition).toBeDefined();
    snap = holdResult.snapshot;
    expect(snap.state).toEqual(["reschedule", "replacement"]);
    expect(snap.board.replacementHold).toEqual(hold);

    snap = stepDeusMachine(machine, snap, {
      type: "replacementConfirmed",
      replacementBooking: booking("new"),
      oldBooking: booking("old"),
    }).snapshot;
    expect(snap.state).toEqual(["reschedule", "result"]);
    expect(snap.board.replacementBooking?.id.value).toBe("new");
    expect(snap.board.oldBookingAfterReschedule?.id.value).toBe("old");
  });

  it("keepCurrentTime returns from picker to available", () => {
    const machine = createRescheduleMachine();
    let snap = createDeusSnapshot(machine, initialBoard());
    snap = stepDeusMachine(machine, snap, { type: "openPicker" }).snapshot;
    snap = stepDeusMachine(machine, snap, { type: "keepCurrentTime" }).snapshot;
    expect(snap.state).toEqual(["reschedule", "available"]);
  });

  it("holdCreated is not eligible from available - you must open the picker first", () => {
    const machine = createRescheduleMachine();
    const snap = createDeusSnapshot(machine, initialBoard());
    const result = stepDeusMachine(machine, snap, { type: "holdCreated", hold });
    expect(result.trace.selectedTransition).toBeUndefined();
    expect(result.snapshot.state).toEqual(["reschedule", "available"]);
  });

  it("editCustomerField works from any stage (available, picker, replacement, result)", () => {
    const machine = createRescheduleMachine();
    let snap = createDeusSnapshot(machine, initialBoard());

    snap = stepDeusMachine(machine, snap, { type: "editCustomerField", field: "name", value: "at available" }).snapshot;
    expect(snap.board.customer.name).toBe("at available");
    expect(snap.state).toEqual(["reschedule", "available"]);

    snap = stepDeusMachine(machine, snap, { type: "openPicker" }).snapshot;
    snap = stepDeusMachine(machine, snap, { type: "editCustomerField", field: "name", value: "at picker" }).snapshot;
    expect(snap.board.customer.name).toBe("at picker");
    expect(snap.state).toEqual(["reschedule", "picker"]);
  });

  it("slot/date/month selection only mutates data, never changes stage", () => {
    const machine = createRescheduleMachine();
    let snap = createDeusSnapshot(machine, initialBoard());
    snap = stepDeusMachine(machine, snap, { type: "openPicker" }).snapshot;
    snap = stepDeusMachine(machine, snap, { type: "slotsLoaded", slots: [slot] }).snapshot;
    expect(snap.board.slots).toEqual([slot]);
    snap = stepDeusMachine(machine, snap, { type: "selectDate", dateKey: "2030-03-14" }).snapshot;
    expect(snap.board.selectedDateKey).toBe("2030-03-14");
    snap = stepDeusMachine(machine, snap, { type: "selectSlot", slotKey: "r:s:2030-03-14T15:00:00Z" }).snapshot;
    expect(snap.board.selectedSlotKey).toBe("r:s:2030-03-14T15:00:00Z");
    expect(snap.state).toEqual(["reschedule", "picker"]);
  });

  it("selecting a new date clears any previously selected slot", () => {
    const machine = createRescheduleMachine();
    let snap = createDeusSnapshot(machine, initialBoard());
    snap = stepDeusMachine(machine, snap, { type: "openPicker" }).snapshot;
    snap = stepDeusMachine(machine, snap, { type: "selectSlot", slotKey: "some-slot" }).snapshot;
    expect(snap.board.selectedSlotKey).toBe("some-slot");
    snap = stepDeusMachine(machine, snap, { type: "selectDate", dateKey: "2030-04-01" }).snapshot;
    expect(snap.board.selectedSlotKey).toBeUndefined();
  });

  it("intakeUpdated and paymentSatisfied merge into replacementLifecycle without dropping the other's fields", () => {
    const machine = createRescheduleMachine();
    let snap = createDeusSnapshot(machine, initialBoard());
    snap = stepDeusMachine(machine, snap, { type: "openPicker" }).snapshot;
    snap = stepDeusMachine(machine, snap, { type: "holdCreated", hold }).snapshot;

    snap = stepDeusMachine(machine, snap, { type: "intakeUpdated", paymentRequirementStatus: "payment_required" }).snapshot;
    expect(snap.board.replacementLifecycle?.paymentRequirementStatus).toBe("payment_required");

    snap = stepDeusMachine(machine, snap, { type: "paymentSatisfied", paymentRequirementStatus: "payment_satisfied_fake", paymentReference: "ref-1" }).snapshot;
    expect(snap.board.replacementLifecycle?.paymentRequirementStatus).toBe("payment_satisfied_fake");
    expect(snap.board.replacementLifecycle?.paymentReference).toBe("ref-1");
    // status field from the original hold's lifecycle should still be there.
    expect(snap.board.replacementLifecycle?.status).toBe("active");
  });

  it("applyFixtureState jumps directly to the fixture's declared stage, from any current stage", () => {
    const machine = createRescheduleMachine();
    const snap = createDeusSnapshot(machine, initialBoard());
    const result = stepDeusMachine(machine, snap, {
      type: "applyFixtureState",
      fixtureState: { stage: "replacement", replacementHold: hold, selectedSlot: slot },
    });
    expect(result.snapshot.state).toEqual(["reschedule", "replacement"]);
    expect(result.snapshot.board.replacementHold).toEqual(hold);
    expect(result.snapshot.board.selectedSlotKey).toBe("r:s:2030-03-14T15:00:00Z");
  });

  it("applyFixtureState can jump straight to result, skipping picker/replacement entirely", () => {
    const machine = createRescheduleMachine();
    const snap = createDeusSnapshot(machine, initialBoard());
    const result = stepDeusMachine(machine, snap, {
      type: "applyFixtureState",
      fixtureState: { stage: "result", replacementBooking: booking("new"), oldBooking: booking("old") },
    });
    expect(result.snapshot.state).toEqual(["reschedule", "result"]);
    expect(result.snapshot.board.replacementBooking?.id.value).toBe("new");
  });
});
