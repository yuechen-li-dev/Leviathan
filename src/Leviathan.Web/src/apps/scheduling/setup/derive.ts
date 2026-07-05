// Pure derivation helpers for the provider setup wizard - checklist state,
// draft defaults, and the public-link preview copy. Extracted from
// views.tsx (M0 setup-wizard rewrite). Zero behavior change from the
// original functions; no React, no DeusMachina, testable standalone.

import { browserTimeZone } from "../shared/format";
import type { AvailabilityRule, BookableResource, Provider, SchedulingService } from "../types";
import type { SetupDraft, SetupEntities, SetupStepKey } from "./types";

export function createDefaultSetupDraft(providerSlug = "demo-provider", providerTimeZone = browserTimeZone()): SetupDraft {
  return {
    provider: {
      slug: providerSlug,
      displayName: "Emma Brown",
      timeZoneId: providerTimeZone,
      contactEmail: "emma@example.test",
      publicDescription: "Intro calls and working sessions for local scheduling demos.",
    },
    resource: {
      displayName: "Emma Brown",
      resourceType: "person",
      timeZoneId: providerTimeZone,
    },
    service: {
      name: "30 min Intro Call",
      durationMinutes: 30,
      description: "A focused introductory meeting to discuss goals, constraints, and next steps.",
    },
    availability: {
      daysOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      timeZoneId: providerTimeZone,
      localStartTime: "09:00",
      localEndTime: "17:00",
    },
  };
}

export function setupEntitiesFromValues(values: {
  provider?: Provider | null;
  resource?: BookableResource | null;
  service?: SchedulingService | null;
  availabilityRule?: AvailabilityRule | null;
}): SetupEntities {
  return {
    provider: values.provider
      ? {
          id: values.provider.id.value,
          slug: values.provider.slug,
          displayName: values.provider.displayName,
          timeZoneId: values.provider.timeZoneId,
          contactEmail: values.provider.contactEmail,
          publicDescription: values.provider.publicDescription,
        }
      : null,
    resource: values.resource
      ? {
          id: values.resource.id.value,
          displayName: values.resource.displayName,
          resourceType: values.resource.resourceType,
          timeZoneId: values.resource.timeZoneId,
        }
      : null,
    service: values.service
      ? {
          id: values.service.id.value,
          name: values.service.name,
          durationMinutes: values.service.durationMinutes,
          description: values.service.description,
          paymentPolicy: values.service.paymentPolicy,
        }
      : null,
    availabilityRule: values.availabilityRule
      ? {
          id: values.availabilityRule.id.value,
          daysOfWeek: values.availabilityRule.daysOfWeek,
          timeZoneId: values.availabilityRule.timeZoneId,
          localStartTime: values.availabilityRule.localStartTime,
          localEndTime: values.availabilityRule.localEndTime,
        }
      : null,
  };
}

export function setupStepState(step: SetupStepKey, entities: SetupEntities) {
  if (step === "provider") return entities.provider ? "complete" : "current";
  if (step === "resource") return entities.resource ? "complete" : entities.provider ? "current" : "upcoming";
  if (step === "service") return entities.service ? "complete" : entities.resource ? "current" : "upcoming";
  if (step === "availability") return entities.availabilityRule ? "complete" : entities.service ? "current" : "upcoming";
  return entities.availabilityRule && entities.provider ? "current" : "upcoming";
}

export function availabilitySummary(rule: SetupEntities["availabilityRule"]) {
  if (!rule) return "Pending";
  return `${rule.daysOfWeek.join(", ")} · ${rule.localStartTime}-${rule.localEndTime} · ${rule.timeZoneId}`;
}

export function setupLinkState(providerSlug: string, ready: boolean) {
  return {
    previewPath: `/book/${providerSlug}`,
    heading: ready ? "Your public booking page is ready" : "Your public booking page will appear here",
    body: ready
      ? "Open the generated booking page and test the same public flow customers will use."
      : "Create the provider, resource, service, and availability rule first. The preview path below shows where the booking page will live.",
  };
}
