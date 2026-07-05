import { describe, expect, it } from "vitest";
import { createDeusSnapshot, stepDeusMachine } from "machinalayout/deus";
import { createDefaultSetupDraft } from "./derive";
import { busyLabel, createSetupMachine, phaseFromStatePath, stepForPhase, type SetupBoard, type SetupEvent } from "./setupMachine";
import type { AvailabilityRule, BookableResource, Provider, SchedulingService } from "../types";

function initialBoard(): SetupBoard {
  return {
    draft: createDefaultSetupDraft("demo-provider", "UTC"),
    provider: null,
    resource: null,
    service: null,
    availabilityRule: null,
  };
}

const provider: Provider = { id: { value: "p1" }, slug: "demo-provider", displayName: "Emma Brown", timeZoneId: "UTC" };
const resource: BookableResource = { id: { value: "r1" }, providerId: { value: "p1" }, displayName: "Emma Brown", resourceType: "person", timeZoneId: "UTC" };
const service: SchedulingService = { id: { value: "s1" }, name: "30 min", durationMinutes: 30 } as SchedulingService;
const availabilityRule: AvailabilityRule = {
  id: { value: "a1" },
  providerId: { value: "p1" },
  resourceId: { value: "r1" },
  timeZoneId: "UTC",
  daysOfWeek: ["Monday"],
  localStartTime: "09:00",
  localEndTime: "17:00",
};

describe("setup machine - field edits work from any phase", () => {
  it("editProviderField mutates the draft and stays in idle", () => {
    const machine = createSetupMachine();
    const snap = createDeusSnapshot(machine, initialBoard());
    const result = stepDeusMachine(machine, snap, { type: "editProviderField", field: "displayName", value: "New Name" });
    expect(result.snapshot.board.draft.provider.displayName).toBe("New Name");
    expect(result.snapshot.state).toEqual(["setup", "idle"]);
  });

  it("toggleAvailabilityDay adds and removes a day, keeping canonical Mon-Sun order", () => {
    const machine = createSetupMachine();
    let snap = createDeusSnapshot(machine, initialBoard());
    const before = snap.board.draft.availability.daysOfWeek;
    expect(before).toContain("Monday");

    let result = stepDeusMachine(machine, snap, { type: "toggleAvailabilityDay", day: "Monday" });
    expect(result.snapshot.board.draft.availability.daysOfWeek).not.toContain("Monday");

    snap = result.snapshot;
    // Add Sunday and Wednesday out of order - the old component always
    // re-sorted into Mon-Sun order after a toggle; the machine's `do`
    // handler needs to do the same, not just append.
    result = stepDeusMachine(machine, snap, { type: "toggleAvailabilityDay", day: "Sunday" });
    snap = result.snapshot;
    expect(snap.board.draft.availability.daysOfWeek).toEqual(["Tuesday", "Wednesday", "Thursday", "Friday", "Sunday"]);
  });

  it("field edits still work while a create call is pending", () => {
    const machine = createSetupMachine();
    let snap = createDeusSnapshot(machine, initialBoard());
    snap = stepDeusMachine(machine, snap, { type: "createProvider" }).snapshot;
    expect(phaseFromStatePath(snap.state)).toBe("providerPending");

    const result = stepDeusMachine(machine, snap, { type: "editServiceField", field: "durationMinutes", value: 45 });
    expect(result.snapshot.board.draft.service.durationMinutes).toBe(45);
    // Still pending - editing doesn't kick you out of the pending phase.
    expect(phaseFromStatePath(result.snapshot.state)).toBe("providerPending");
  });
});

describe("setup machine - sequential creation gating", () => {
  it("createProvider is eligible from idle with no provider yet", () => {
    const machine = createSetupMachine();
    const snap = createDeusSnapshot(machine, initialBoard());
    const result = stepDeusMachine(machine, snap, { type: "createProvider" });
    expect(result.trace.selectedTransition).not.toBeNull();
    expect(phaseFromStatePath(result.snapshot.state)).toBe("providerPending");
  });

  it("createResource is NOT eligible before a provider exists - the guard actually blocks it", () => {
    const machine = createSetupMachine();
    const snap = createDeusSnapshot(machine, initialBoard());
    const result = stepDeusMachine(machine, snap, { type: "createResource" });
    // No matching transition: guard `!!b.provider` failed. This is the
    // real regression this port is meant to catch - the old code only
    // caught this with a thrown Error deep inside an async try/catch.
    expect(result.trace.selectedTransition).toBeUndefined();
    expect(phaseFromStatePath(result.snapshot.state)).toBe("idle");
  });

  it("full happy path walks idle -> each *Pending -> idle in order, gated correctly at each step", () => {
    const machine = createSetupMachine();
    let snap = createDeusSnapshot(machine, initialBoard());

    snap = stepDeusMachine(machine, snap, { type: "createProvider" }).snapshot;
    expect(phaseFromStatePath(snap.state)).toBe("providerPending");
    snap = stepDeusMachine(machine, snap, { type: "providerCreated", provider }).snapshot;
    expect(phaseFromStatePath(snap.state)).toBe("idle");
    expect(snap.board.provider).toEqual(provider);
    // Provider's timezone propagates into resource/availability drafts.
    expect(snap.board.draft.resource.timeZoneId).toBe("UTC");

    snap = stepDeusMachine(machine, snap, { type: "createResource" }).snapshot;
    expect(phaseFromStatePath(snap.state)).toBe("resourcePending");
    snap = stepDeusMachine(machine, snap, { type: "resourceCreated", resource }).snapshot;
    expect(snap.board.resource).toEqual(resource);

    snap = stepDeusMachine(machine, snap, { type: "createService" }).snapshot;
    expect(phaseFromStatePath(snap.state)).toBe("servicePending");
    snap = stepDeusMachine(machine, snap, { type: "serviceCreated", service }).snapshot;
    expect(snap.board.service).toEqual(service);

    snap = stepDeusMachine(machine, snap, { type: "createAvailability" }).snapshot;
    expect(phaseFromStatePath(snap.state)).toBe("availabilityPending");
    snap = stepDeusMachine(machine, snap, { type: "availabilityCreated", rule: availabilityRule }).snapshot;
    expect(snap.board.availabilityRule).toEqual(availabilityRule);
    expect(phaseFromStatePath(snap.state)).toBe("idle");
  });

  it("a failed create returns to idle with an error message, not stuck pending", () => {
    const machine = createSetupMachine();
    let snap = createDeusSnapshot(machine, initialBoard());
    snap = stepDeusMachine(machine, snap, { type: "createProvider" }).snapshot;
    snap = stepDeusMachine(machine, snap, { type: "providerFailed", message: "slug_taken" }).snapshot;
    expect(phaseFromStatePath(snap.state)).toBe("idle");
    expect(snap.board.errorMessage).toBe("slug_taken");
    expect(snap.board.provider).toBeNull();
  });

  it("createProvider is not re-eligible once a provider already exists", () => {
    const machine = createSetupMachine();
    let snap = createDeusSnapshot(machine, initialBoard());
    snap = stepDeusMachine(machine, snap, { type: "createProvider" }).snapshot;
    snap = stepDeusMachine(machine, snap, { type: "providerCreated", provider }).snapshot;
    const result = stepDeusMachine(machine, snap, { type: "createProvider" });
    expect(result.trace.selectedTransition).toBeUndefined();
  });
});

describe("stepForPhase / busyLabel", () => {
  it("map every phase to its step key and busy copy", () => {
    expect(stepForPhase("idle")).toBeNull();
    expect(stepForPhase("providerPending")).toBe("provider");
    expect(busyLabel("idle")).toBeNull();
    expect(busyLabel("resourcePending")).toBe("Creating resource…");
  });
});
