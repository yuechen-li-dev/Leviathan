// Live-mode provider setup orchestrator - M0's real DeusMachina port
// (Candidate 1 from the DeusMachina port audit). Replaces the old
// component's five `useState` calls plus a `busyStep: string | null`
// sentinel and a four-branch `if` chain in `runStep`.
//
// Actuator-boundary pattern: the machine decides synchronously (dispatch a
// `create*` event, get back a DeusStepResult), the actuator here inspects
// whether a transition actually fired (the guard was satisfied) and only
// then performs the real network call. The result re-enters as a
// `*Created`/`*Failed` event. The machine never awaits anything itself.

import { useEffect, useState } from "react";
import { useDeusMachine } from "machinalayout/react";
import { Button } from "@/components/ui/button";
import {
  assignResourceToService,
  createAvailabilityRule,
  createProvider,
  createResource,
  createService,
  getLocalDevContext,
} from "../api";
import {
  defaultProviderSlug,
  linkWithCurrentQuery,
  liveNotificationPolicy,
  livePaymentPolicy,
  loadLiveContext,
  saveLiveContext,
} from "../shared/liveContext";
import { browserTimeZone } from "../shared/format";
import type { LocalDevPlatformContext } from "../types";
import { createDefaultSetupDraft, setupEntitiesFromValues } from "./derive";
import { ProviderSetupFlow } from "./ProviderSetupFlow";
import { busyLabel, createSetupMachine, phaseFromStatePath, stepForPhase, type SetupBoard, type SetupEvent } from "./setupMachine";

const setupMachine = createSetupMachine();

function initialSetupBoard(): SetupBoard {
  const liveContext = loadLiveContext();
  const draft = createDefaultSetupDraft(liveContext.providerSlug ?? defaultProviderSlug, liveContext.providerTimeZone ?? browserTimeZone());
  draft.provider.displayName = liveContext.providerName ?? "M24 Smoke Provider";
  draft.provider.contactEmail = "provider-smoke@example.test";
  draft.provider.publicDescription = "Local-dev provider for the Leviathan Scheduling smoke flow.";
  draft.resource.displayName = "M24 Smoke Resource";
  draft.service.name = "30 minute consult";
  draft.service.description = "Live backend smoke service with fake/local payment and notification policy.";

  return {
    draft,
    provider: liveContext.providerId
      ? {
          id: { value: liveContext.providerId },
          slug: liveContext.providerSlug ?? defaultProviderSlug,
          displayName: liveContext.providerName ?? "M24 Smoke Provider",
          timeZoneId: liveContext.providerTimeZone ?? browserTimeZone(),
        }
      : null,
    resource: null,
    service: null,
    availabilityRule: null,
  };
}

export function LiveProviderSetupView() {
  const [context, setContext] = useState<LocalDevPlatformContext | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const deus = useDeusMachine(setupMachine, initialSetupBoard);
  const { board } = deus;
  const phase = phaseFromStatePath(deus.state);
  const publicLink = board.provider?.slug ? linkWithCurrentQuery(`/book/${board.provider.slug}`) : null;

  useEffect(() => {
    void getLocalDevContext()
      .then((value) => setContext(value))
      .catch(() => setContext(null));
  }, []);

  function dispatch(event: SetupEvent) {
    deus.dispatch(event);
  }

  const createEventForStep = {
    provider: { type: "createProvider" },
    resource: { type: "createResource" },
    service: { type: "createService" },
    availability: { type: "createAvailability" },
  } as const satisfies Record<"provider" | "resource" | "service" | "availability", SetupEvent>;

  function failedEvent(step: "provider" | "resource" | "service" | "availability", message: string): SetupEvent {
    switch (step) {
      case "provider":
        return { type: "providerFailed", message };
      case "resource":
        return { type: "resourceFailed", message };
      case "service":
        return { type: "serviceFailed", message };
      case "availability":
        return { type: "availabilityFailed", message };
    }
  }

  // TODO(async-adoption): each create* call inside runStep does its own
  // manual try/catch/finally around a direct api.ts call, dispatching a
  // *Created/*Failed event by hand. Built before machinalayout/async and
  // useAsyncTask existed (M0 predates M2); would now be four
  // AsyncTaskControllers instead, each result handled via matchKind - same
  // pattern M2 used for the reschedule steps. Not fixed here since the
  // current pattern is tested and working; a real cleanup opportunity, not
  // a correctness problem the way bookings-list's staleness gap is (see
  // M2.5).
  async function runStep(step: "provider" | "resource" | "service" | "availability") {
    const gate = deus.dispatch(createEventForStep[step]);
    // The machine's own guard is the source of truth for "is this step
    // actually runnable right now" - if it didn't select a transition
    // (prerequisite missing, or already created), don't make the network
    // call at all. This is the same check the old code expressed as
    // `if (!providerId) throw new Error(...)` deep inside the try/catch,
    // just moved to before the request fires instead of after.
    if (!gate.trace.selectedTransition) return;

    const liveContext = loadLiveContext();
    try {
      if (step === "provider") {
        const created = await createProvider({
          slug: board.draft.provider.slug,
          displayName: board.draft.provider.displayName,
          timeZoneId: board.draft.provider.timeZoneId,
          contactEmail: board.draft.provider.contactEmail,
          publicDescription: board.draft.provider.publicDescription,
        });
        saveLiveContext({
          providerId: created.id.value,
          providerSlug: created.slug,
          providerName: created.displayName,
          providerTimeZone: created.timeZoneId,
        });
        dispatch({ type: "providerCreated", provider: created });
        return;
      }

      const providerId = board.provider?.id.value ?? liveContext.providerId;
      if (!providerId) throw new Error("Create provider first.");

      if (step === "resource") {
        const created = await createResource({
          providerId,
          displayName: board.draft.resource.displayName,
          resourceType: board.draft.resource.resourceType,
          timeZoneId: board.draft.resource.timeZoneId,
        });
        saveLiveContext({ providerId, resourceId: created.id.value });
        dispatch({ type: "resourceCreated", resource: created });
        return;
      }

      const resourceId = board.resource?.id.value ?? liveContext.resourceId;
      if (!resourceId) throw new Error("Create resource first.");

      if (step === "service") {
        const created = await createService({
          providerId,
          name: board.draft.service.name,
          description: board.draft.service.description,
          durationMinutes: board.draft.service.durationMinutes,
          paymentPolicy: livePaymentPolicy,
          notificationPolicy: liveNotificationPolicy,
        });
        const assigned = await assignResourceToService(created.id.value, providerId, resourceId);
        saveLiveContext({ providerId, resourceId, serviceId: assigned.id.value });
        dispatch({ type: "serviceCreated", service: assigned });
        return;
      }

      const created = await createAvailabilityRule({
        providerId,
        resourceId,
        timeZoneId: board.draft.availability.timeZoneId,
        daysOfWeek: board.draft.availability.daysOfWeek,
        localStartTime: board.draft.availability.localStartTime,
        localEndTime: board.draft.availability.localEndTime,
      });
      dispatch({ type: "availabilityCreated", rule: created });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dispatch(failedEvent(step, message));
    }
  }

  async function copyPublicLink() {
    if (!publicLink || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(publicLink);
      setCopyStatus("Copied");
      window.setTimeout(() => setCopyStatus(null), 1500);
    } catch {
      setCopyStatus("Copy failed");
      window.setTimeout(() => setCopyStatus(null), 1500);
    }
  }

  const busyStepLabel = busyLabel(phase);
  const currentBusyStep = stepForPhase(phase);

  return (
    <ProviderSetupFlow
      actionButtons={{
        provider: (
          <Button data-testid="setup-create-provider" disabled={!!currentBusyStep || !!board.provider} onClick={() => void runStep("provider")} type="button">
            {currentBusyStep === "provider" ? busyStepLabel : board.provider ? "Provider created" : "Create provider"}
          </Button>
        ),
        resource: (
          <Button data-testid="setup-create-resource" disabled={!!currentBusyStep || !board.provider || !!board.resource} onClick={() => void runStep("resource")} type="button">
            {currentBusyStep === "resource" ? busyStepLabel : board.resource ? "Resource created" : "Create resource"}
          </Button>
        ),
        service: (
          <Button data-testid="setup-create-service" disabled={!!currentBusyStep || !board.resource || !!board.service} onClick={() => void runStep("service")} type="button">
            {currentBusyStep === "service" ? busyStepLabel : board.service ? "Service created" : "Create service"}
          </Button>
        ),
        availability: (
          <Button data-testid="setup-create-availability" disabled={!!currentBusyStep || !board.service || !!board.availabilityRule} onClick={() => void runStep("availability")} type="button">
            {currentBusyStep === "availability" ? busyStepLabel : board.availabilityRule ? "Availability created" : "Create availability"}
          </Button>
        ),
      }}
      copyStatus={copyStatus}
      draft={board.draft}
      entities={setupEntitiesFromValues({
        provider: board.provider,
        resource: board.resource,
        service: board.service,
        availabilityRule: board.availabilityRule,
      })}
      errorMessage={board.errorMessage}
      localDevContext={context ?? undefined}
      modeLabel="Live backend"
      onAvailabilityFieldChange={(field, value) => dispatch({ type: "editAvailabilityField", field, value })}
      onCopyLink={() => void copyPublicLink()}
      onProviderFieldChange={(field, value) => dispatch({ type: "editProviderField", field, value })}
      onResourceFieldChange={(field, value) => dispatch({ type: "editResourceField", field, value })}
      onServiceFieldChange={(field, value) => dispatch({ type: "editServiceField", field, value })}
      onToggleAvailabilityDay={(day) => dispatch({ type: "toggleAvailabilityDay", day })}
      publicLink={publicLink}
    />
  );
}
