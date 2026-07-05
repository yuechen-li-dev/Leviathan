// Real DeusMachina port of the provider setup wizard's live-mode
// orchestration (M0, Candidate 1 from the DeusMachina port audit). Replaces
// the old LiveProviderSetupView's five `useState` calls plus a
// `busyStep: string | null` sentinel and a four-branch `if` chain in
// `runStep`, with an explicit, traceable state graph.
//
// This machine is synchronous and pure, per DeusMachina's own contract -
// `do`/`onEnter`/`onExit` never await anything. The actual network calls
// live in the actuator layer (LiveProviderSetupView.tsx), which dispatches
// a `create*` event, inspects whether stepDeusMachine actually selected a
// transition (i.e. whether the guard on that step was satisfied), and only
// then performs the real API call - the result re-enters as a
// `*Created`/`*Failed` event. The machine decides; the actuator acts.

import { M } from "machinalayout/machina";
import type { DeusMachine, DeusStatePath } from "machinalayout/deus";
import type { AvailabilityRule, BookableResource, Provider, SchedulingService } from "../types";
import type { SetupDraft } from "./types";
import { weekdayOrder } from "./types";

export type SetupPhase = "idle" | "providerPending" | "resourcePending" | "servicePending" | "availabilityPending";

export type SetupBoard = {
  draft: SetupDraft;
  provider: Provider | null;
  resource: BookableResource | null;
  service: SchedulingService | null;
  availabilityRule: AvailabilityRule | null;
  errorMessage?: string;
};

export type SetupEvent =
  | { type: "editProviderField"; field: keyof SetupDraft["provider"]; value: string }
  | { type: "editResourceField"; field: keyof SetupDraft["resource"]; value: string }
  | { type: "editServiceField"; field: keyof SetupDraft["service"]; value: string | number }
  | { type: "editAvailabilityField"; field: keyof SetupDraft["availability"]; value: string | string[] }
  | { type: "toggleAvailabilityDay"; day: string }
  | { type: "createProvider" }
  | { type: "providerCreated"; provider: Provider }
  | { type: "providerFailed"; message: string }
  | { type: "createResource" }
  | { type: "resourceCreated"; resource: BookableResource }
  | { type: "resourceFailed"; message: string }
  | { type: "createService" }
  | { type: "serviceCreated"; service: SchedulingService }
  | { type: "serviceFailed"; message: string }
  | { type: "createAvailability" }
  | { type: "availabilityCreated"; rule: AvailabilityRule }
  | { type: "availabilityFailed"; message: string };

const idle = ["setup", "idle"] as const;
const providerPending = ["setup", "providerPending"] as const;
const resourcePending = ["setup", "resourcePending"] as const;
const servicePending = ["setup", "servicePending"] as const;
const availabilityPending = ["setup", "availabilityPending"] as const;

export function createSetupMachine(): DeusMachine<SetupBoard, SetupEvent> {
  return M.machine<SetupBoard, SetupEvent>({
    initial: idle,
    states: [
      // The bare ["setup"] prefix needs its own declared state - not just
      // a conceptual ancestor - because defineDeusMachine validates that
      // every transition's `from` exactly matches a declared state path.
      // The hierarchical "walk up to parent prefixes" behavior documented
      // for stepDeusMachine's candidate gathering only kicks in once the
      // prefix itself is a real state; it isn't inferred from the leaves
      // alone. Found this the hard way via DeusMachinaError at definition
      // time - a good, sharp failure, just earlier than expected.
      M.state(["setup"]),
      M.state(idle),
      M.state(providerPending),
      M.state(resourcePending),
      M.state(servicePending),
      M.state(availabilityPending),
    ],
    transitions: [
      // Field edits and the day-of-week toggle are allowed from any setup
      // phase, matching the old component's behavior (it never disabled
      // text inputs while a create call was in flight - only the create
      // buttons themselves and, separately, fields whose entity already
      // exists). `from: ["setup"]` is the shared parent prefix of every
      // leaf above, and no `to` means "stay wherever you currently are" -
      // this can't be expressed through the `M.on` sugar, which requires an
      // explicit `to`, so these five are raw transition rows instead.
      {
        key: "setup.editProviderField",
        from: ["setup"],
        event: "editProviderField",
        do: (b, e) => {
          if (e.type !== "editProviderField") return;
          b.draft = { ...b.draft, provider: { ...b.draft.provider, [e.field]: e.value } };
        },
      },
      {
        key: "setup.editResourceField",
        from: ["setup"],
        event: "editResourceField",
        do: (b, e) => {
          if (e.type !== "editResourceField") return;
          b.draft = { ...b.draft, resource: { ...b.draft.resource, [e.field]: e.value } };
        },
      },
      {
        key: "setup.editServiceField",
        from: ["setup"],
        event: "editServiceField",
        do: (b, e) => {
          if (e.type !== "editServiceField") return;
          b.draft = { ...b.draft, service: { ...b.draft.service, [e.field]: e.value } };
        },
      },
      {
        key: "setup.editAvailabilityField",
        from: ["setup"],
        event: "editAvailabilityField",
        do: (b, e) => {
          if (e.type !== "editAvailabilityField") return;
          b.draft = { ...b.draft, availability: { ...b.draft.availability, [e.field]: e.value } };
        },
      },
      {
        key: "setup.toggleAvailabilityDay",
        from: ["setup"],
        event: "toggleAvailabilityDay",
        do: (b, e) => {
          if (e.type !== "toggleAvailabilityDay") return;
          const days = b.draft.availability.daysOfWeek;
          const next = days.includes(e.day)
            ? days.filter((d) => d !== e.day)
            : [...days, e.day].sort(
                (left, right) =>
                  weekdayOrder.indexOf(left as (typeof weekdayOrder)[number]) - weekdayOrder.indexOf(right as (typeof weekdayOrder)[number]),
              );
          b.draft = { ...b.draft, availability: { ...b.draft.availability, daysOfWeek: next } };
        },
      },

      // Each create step is only eligible from idle, and only once its
      // prerequisite entity exists (mirrors the old runStep's `if (!x)
      // throw` guards, but as a real, inspectable transition guard instead
      // of an exception thrown from inside a try/catch). If the guard
      // fails, stepDeusMachine simply selects no transition - the actuator
      // layer checks for that and skips the network call entirely.
      M.on("createProvider", idle, providerPending, undefined, { when: (b) => !b.provider }),
      M.on("createResource", idle, resourcePending, undefined, { when: (b) => !!b.provider && !b.resource }),
      M.on("createService", idle, servicePending, undefined, { when: (b) => !!b.resource && !b.service }),
      M.on("createAvailability", idle, availabilityPending, undefined, {
        when: (b) => !!b.service && !b.availabilityRule,
      }),

      // Every pending state resolves back to idle on both success and
      // failure - matching the old `finally { setBusyStep(null) }`.
      M.on("providerCreated", providerPending, idle, (b, e) => {
        if (e.type !== "providerCreated") return;
        b.provider = e.provider;
        b.errorMessage = undefined;
        b.draft = {
          ...b.draft,
          resource: { ...b.draft.resource, timeZoneId: e.provider.timeZoneId },
          availability: { ...b.draft.availability, timeZoneId: e.provider.timeZoneId },
        };
      }),
      M.on("providerFailed", providerPending, idle, (b, e) => {
        if (e.type !== "providerFailed") return;
        b.errorMessage = e.message;
      }),
      M.on("resourceCreated", resourcePending, idle, (b, e) => {
        if (e.type !== "resourceCreated") return;
        b.resource = e.resource;
        b.errorMessage = undefined;
      }),
      M.on("resourceFailed", resourcePending, idle, (b, e) => {
        if (e.type !== "resourceFailed") return;
        b.errorMessage = e.message;
      }),
      M.on("serviceCreated", servicePending, idle, (b, e) => {
        if (e.type !== "serviceCreated") return;
        b.service = e.service;
        b.errorMessage = undefined;
      }),
      M.on("serviceFailed", servicePending, idle, (b, e) => {
        if (e.type !== "serviceFailed") return;
        b.errorMessage = e.message;
      }),
      M.on("availabilityCreated", availabilityPending, idle, (b, e) => {
        if (e.type !== "availabilityCreated") return;
        b.availabilityRule = e.rule;
        b.errorMessage = undefined;
      }),
      M.on("availabilityFailed", availabilityPending, idle, (b, e) => {
        if (e.type !== "availabilityFailed") return;
        b.errorMessage = e.message;
      }),
    ],
  });
}

/** Reads the SetupPhase leaf off a DeusStatePath - the machine's own state is the source of truth. */
export function phaseFromStatePath(path: DeusStatePath): SetupPhase {
  const leaf = path[path.length - 1];
  if (leaf === "providerPending" || leaf === "resourcePending" || leaf === "servicePending" || leaf === "availabilityPending") {
    return leaf;
  }
  return "idle";
}

/** Which step a given phase corresponds to, for actuator dispatch and button copy. */
export function stepForPhase(phase: SetupPhase): "provider" | "resource" | "service" | "availability" | null {
  // Note: would use matchEnum here (machinalayout/match) for a compile-time
  // exhaustiveness guarantee, matching the DeusMachina port audit's original
  // recommendation - but the installed `machinalayout@0.4.0` from npm
  // predates the "Expose match subpath" commit, which landed on GitHub's
  // main branch after the 0.4.0 tag was published. `match`, `style`, and
  // `static` all exist on main but are not in the published package this
  // project actually depends on. Plain switch + `never` check gets the same
  // exhaustiveness guarantee without the missing dependency; worth
  // revisiting once a 0.4.x patch (or 0.5.0) actually ships it to npm.
  switch (phase) {
    case "idle":
      return null;
    case "providerPending":
      return "provider";
    case "resourcePending":
      return "resource";
    case "servicePending":
      return "service";
    case "availabilityPending":
      return "availability";
    default: {
      const exhaustive: never = phase;
      return exhaustive;
    }
  }
}

/** Busy-button copy per phase - replaces the old `busyStep === "x" ? "Creating x…" : ...` ternary chain. */
export function busyLabel(phase: SetupPhase): string | null {
  switch (phase) {
    case "idle":
      return null;
    case "providerPending":
      return "Creating provider…";
    case "resourcePending":
      return "Creating resource…";
    case "servicePending":
      return "Creating service…";
    case "availabilityPending":
      return "Creating availability…";
    default: {
      const exhaustive: never = phase;
      return exhaustive;
    }
  }
}
