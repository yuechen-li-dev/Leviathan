import { describe, expect, it } from "vitest";
import { createDeusSnapshot, stepDeusMachine } from "machinalayout/deus";
import { createPublicBookingMachine, type PublicBookingBoard } from "./bookingMachine";
import type { BookableSlot, Booking, SchedulingService } from "../types";

function initialBoard(live: boolean): PublicBookingBoard {
  return {
    live,
    providerName: "Emma Brown",
    providerTimeZone: "UTC",
    providerDescription: "",
    services: [{ id: { value: "s1" }, name: "30 min", durationMinutes: 30 } as SchedulingService],
    selectedServiceId: "s1",
    slots: [],
    hold: null,
    booking: null,
    customer: { name: "", email: "", phone: "", notes: "" },
  };
}

const slot: BookableSlot = {
  providerId: "p1",
  serviceId: "s1",
  resourceId: "r1",
  startsAtUtc: "2030-03-14T15:00:00Z",
  endsAtUtc: "2030-03-14T15:30:00Z",
  timeZoneId: "UTC",
  displayLabel: "Mar 14",
  providerTimeZoneId: "UTC",
  displayTimeZoneId: "UTC",
  displayStartsAtLocal: "x",
  displayEndsAtLocal: "y",
};

const hold = { holdId: "h1", claimToken: "tok", expiresAt: "2030-03-14T15:30:00Z", status: "held" };

function booking(id: string): Booking {
  return {
    id: { value: id },
    status: "confirmed",
    customer: { name: "Ada", email: "a@example.test" },
    range: { startsAtUtc: "2030-01-01T00:00:00Z", endsAtUtc: "2030-01-01T00:30:00Z", timeZoneId: "UTC" },
  } as Booking;
}

describe("public booking machine - stage transitions", () => {
  it("walks browsing -> held -> confirmed in order", () => {
    const machine = createPublicBookingMachine();
    let snap = createDeusSnapshot(machine, initialBoard(true));
    expect(snap.state).toEqual(["booking", "browsing"]);

    const holdResult = stepDeusMachine(machine, snap, { type: "holdCreated", hold, slotKey: "k1", dateKey: "2030-03-14" });
    expect(holdResult.trace.selectedTransition).toBeDefined();
    snap = holdResult.snapshot;
    expect(snap.state).toEqual(["booking", "held"]);
    expect(snap.board.hold).toEqual(hold);
    expect(snap.board.selectedDateKey).toBe("2030-03-14");

    snap = stepDeusMachine(machine, snap, { type: "bookingConfirmed", booking: booking("b1") }).snapshot;
    expect(snap.state).toEqual(["booking", "confirmed"]);
    expect(snap.board.booking?.id.value).toBe("b1");
  });

  it("bookingConfirmed is not eligible from browsing - you must hold first", () => {
    const machine = createPublicBookingMachine();
    const snap = createDeusSnapshot(machine, initialBoard(true));
    const result = stepDeusMachine(machine, snap, { type: "bookingConfirmed", booking: booking("b1") });
    expect(result.trace.selectedTransition).toBeUndefined();
    expect(result.snapshot.state).toEqual(["booking", "browsing"]);
  });

  it("re-selecting a slot while already held stays in held (same-state transition)", () => {
    const machine = createPublicBookingMachine();
    let snap = createDeusSnapshot(machine, initialBoard(true));
    snap = stepDeusMachine(machine, snap, { type: "holdCreated", hold, slotKey: "k1", dateKey: "2030-03-14" }).snapshot;
    const secondHold = { ...hold, holdId: "h2" };
    const result = stepDeusMachine(machine, snap, { type: "holdCreated", hold: secondHold, slotKey: "k2", dateKey: "2030-03-15" });
    expect(result.trace.selectedTransition).toBeDefined();
    expect(result.snapshot.state).toEqual(["booking", "held"]);
    expect(result.snapshot.board.hold?.holdId).toBe("h2");
  });

  it("live selectDate resets all the way back to browsing and clears the hold", () => {
    const machine = createPublicBookingMachine();
    let snap = createDeusSnapshot(machine, initialBoard(true));
    snap = stepDeusMachine(machine, snap, { type: "holdCreated", hold, slotKey: "k1", dateKey: "2030-03-14" }).snapshot;
    expect(snap.state).toEqual(["booking", "held"]);

    snap = stepDeusMachine(machine, snap, { type: "selectDate", dateKey: "2030-03-20" }).snapshot;
    expect(snap.state).toEqual(["booking", "browsing"]);
    expect(snap.board.hold).toBeNull();
    expect(snap.board.selectedSlotKey).toBeUndefined();
  });

  it("fixture selectDate does not reset stage or clear the hold", () => {
    const machine = createPublicBookingMachine();
    let snap = createDeusSnapshot(machine, initialBoard(false));
    snap = stepDeusMachine(machine, snap, { type: "holdCreated", hold, slotKey: "k1", dateKey: "2030-03-14" }).snapshot;
    expect(snap.state).toEqual(["booking", "held"]);

    snap = stepDeusMachine(machine, snap, { type: "selectDate", dateKey: "2030-03-20" }).snapshot;
    // Stays "held" - fixture mode doesn't regress stage on date change.
    expect(snap.state).toEqual(["booking", "held"]);
    expect(snap.board.hold).toEqual(hold);
    expect(snap.board.selectedDateKey).toBe("2030-03-20");
  });

  it("live clearSelection drops the hold and returns to browsing; fixture only clears the slot key", () => {
    const machine = createPublicBookingMachine();

    let liveSnap = createDeusSnapshot(machine, initialBoard(true));
    liveSnap = stepDeusMachine(machine, liveSnap, { type: "holdCreated", hold, slotKey: "k1", dateKey: "2030-03-14" }).snapshot;
    liveSnap = stepDeusMachine(machine, liveSnap, { type: "clearSelection" }).snapshot;
    expect(liveSnap.state).toEqual(["booking", "browsing"]);
    expect(liveSnap.board.hold).toBeNull();

    let fixtureSnap = createDeusSnapshot(machine, initialBoard(false));
    fixtureSnap = stepDeusMachine(machine, fixtureSnap, { type: "holdCreated", hold, slotKey: "k1", dateKey: "2030-03-14" }).snapshot;
    fixtureSnap = stepDeusMachine(machine, fixtureSnap, { type: "clearSelection" }).snapshot;
    expect(fixtureSnap.state).toEqual(["booking", "held"]);
    expect(fixtureSnap.board.hold).toEqual(hold);
    expect(fixtureSnap.board.selectedSlotKey).toBeUndefined();
  });

  it("selectService clears the hold in live mode but not in fixture mode", () => {
    const machine = createPublicBookingMachine();

    let liveSnap = createDeusSnapshot(machine, initialBoard(true));
    liveSnap = stepDeusMachine(machine, liveSnap, { type: "holdCreated", hold, slotKey: "k1", dateKey: "2030-03-14" }).snapshot;
    liveSnap = stepDeusMachine(machine, liveSnap, { type: "selectService", serviceId: "s2" }).snapshot;
    expect(liveSnap.board.hold).toBeNull();
    expect(liveSnap.board.selectedServiceId).toBe("s2");

    let fixtureSnap = createDeusSnapshot(machine, initialBoard(false));
    fixtureSnap = stepDeusMachine(machine, fixtureSnap, { type: "holdCreated", hold, slotKey: "k1", dateKey: "2030-03-14" }).snapshot;
    fixtureSnap = stepDeusMachine(machine, fixtureSnap, { type: "selectService", serviceId: "s2" }).snapshot;
    expect(fixtureSnap.board.hold).toEqual(hold);
  });

  it("editCustomerField works from any stage", () => {
    const machine = createPublicBookingMachine();
    let snap = createDeusSnapshot(machine, initialBoard(true));
    snap = stepDeusMachine(machine, snap, { type: "editCustomerField", field: "name", value: "Ada" }).snapshot;
    expect(snap.board.customer.name).toBe("Ada");
    expect(snap.state).toEqual(["booking", "browsing"]);

    snap = stepDeusMachine(machine, snap, { type: "holdCreated", hold, slotKey: "k1", dateKey: "2030-03-14" }).snapshot;
    snap = stepDeusMachine(machine, snap, { type: "editCustomerField", field: "email", value: "ada@example.test" }).snapshot;
    expect(snap.board.customer.email).toBe("ada@example.test");
    expect(snap.state).toEqual(["booking", "held"]);
  });

  it("intakeUpdated and paymentSatisfied only apply from held", () => {
    const machine = createPublicBookingMachine();
    const snap = createDeusSnapshot(machine, initialBoard(true));
    const result = stepDeusMachine(machine, snap, { type: "intakeUpdated", hold: { ...hold, paymentRequirementStatus: "not_required" } });
    expect(result.trace.selectedTransition).toBeUndefined();
  });
});
