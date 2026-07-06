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
import { matchKind } from "machinalayout/match";
import { Button } from "@/components/ui/button";
import { getLocalDevContext } from "../api";
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
import { createAvailabilityTask, createProviderTask, createResourceTask, createServiceTask } from "./setupTasks";
import { useAsyncTask } from "../../../machina/useAsyncTask";

const setupMachine = createSetupMachine();

function taskErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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

  const createProviderTaskState = useAsyncTask(createProviderTask);
  const createResourceTaskState = useAsyncTask(createResourceTask);
  const createServiceTaskState = useAsyncTask(createServiceTask);
  const createAvailabilityTaskState = useAsyncTask(createAvailabilityTask);

  // TODO(async-adoption): closed - each create* call now runs through its
  // own AsyncTaskController instead of a manual try/catch/finally. The Deus
  // stage machine's *Pending states are unchanged on purpose: they gate
  // which step is eligible next (createResource is only eligible from
  // idle, specifically preventing it from firing while createProvider is
  // still in flight), which is a different job than AsyncTaskController's
  // per-call lifecycle tracking - restructuring the machine itself wasn't
  // part of what this TODO asked for.
  async function runStep(step: "provider" | "resource" | "service" | "availability") {
    const gate = deus.dispatch(createEventForStep[step]);
    // The machine's own guard is the source of truth for "is this step
    // actually runnable right now" - if it didn't select a transition
    // (prerequisite missing, or already created), don't make the network
    // call at all.
    if (!gate.trace.selectedTransition) return;

    const liveContext = loadLiveContext();

    if (step === "provider") {
      const result = await createProviderTaskState.run({
        slug: board.draft.provider.slug,
        displayName: board.draft.provider.displayName,
        timeZoneId: board.draft.provider.timeZoneId,
        contactEmail: board.draft.provider.contactEmail,
        publicDescription: board.draft.provider.publicDescription,
      });
      matchKind(result, {
        ok: (r) => {
          saveLiveContext({
            providerId: r.value.id.value,
            providerSlug: r.value.slug,
            providerName: r.value.displayName,
            providerTimeZone: r.value.timeZoneId,
          });
          dispatch({ type: "providerCreated", provider: r.value });
        },
        err: (r) => dispatch(failedEvent(step, taskErrorMessage(r.error))),
        cancelled: () => {},
        timeout: () => {},
      });
      return;
    }

    const providerId = board.provider?.id.value ?? liveContext.providerId;
    if (!providerId) {
      dispatch(failedEvent(step, "Create provider first."));
      return;
    }

    if (step === "resource") {
      const result = await createResourceTaskState.run({
        providerId,
        displayName: board.draft.resource.displayName,
        resourceType: board.draft.resource.resourceType,
        timeZoneId: board.draft.resource.timeZoneId,
      });
      matchKind(result, {
        ok: (r) => {
          saveLiveContext({ providerId, resourceId: r.value.id.value });
          dispatch({ type: "resourceCreated", resource: r.value });
        },
        err: (r) => dispatch(failedEvent(step, taskErrorMessage(r.error))),
        cancelled: () => {},
        timeout: () => {},
      });
      return;
    }

    const resourceId = board.resource?.id.value ?? liveContext.resourceId;
    if (!resourceId) {
      dispatch(failedEvent(step, "Create resource first."));
      return;
    }

    if (step === "service") {
      const result = await createServiceTaskState.run({
        providerId,
        resourceId,
        name: board.draft.service.name,
        description: board.draft.service.description,
        durationMinutes: board.draft.service.durationMinutes,
        paymentPolicy: livePaymentPolicy,
        notificationPolicy: liveNotificationPolicy,
      });
      matchKind(result, {
        ok: (r) => {
          saveLiveContext({ providerId, resourceId, serviceId: r.value.id.value });
          dispatch({ type: "serviceCreated", service: r.value });
        },
        err: (r) => dispatch(failedEvent(step, taskErrorMessage(r.error))),
        cancelled: () => {},
        timeout: () => {},
      });
      return;
    }

    const result = await createAvailabilityTaskState.run({
      providerId,
      resourceId,
      timeZoneId: board.draft.availability.timeZoneId,
      daysOfWeek: board.draft.availability.daysOfWeek,
      localStartTime: board.draft.availability.localStartTime,
      localEndTime: board.draft.availability.localEndTime,
    });
    matchKind(result, {
      ok: (r) => dispatch({ type: "availabilityCreated", rule: r.value }),
      err: (r) => dispatch(failedEvent(step, taskErrorMessage(r.error))),
      cancelled: () => {},
      timeout: () => {},
    });
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
