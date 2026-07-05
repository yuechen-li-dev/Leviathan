// Provider setup wizard - shared shapes. Extracted from views.tsx (M0
// setup-wizard rewrite). Zero behavior change from the original types.

import type { SchedulingService } from "../types";

export type SetupDraft = {
  provider: {
    slug: string;
    displayName: string;
    timeZoneId: string;
    contactEmail: string;
    publicDescription: string;
  };
  resource: {
    displayName: string;
    resourceType: string;
    timeZoneId: string;
  };
  service: {
    name: string;
    durationMinutes: number;
    description: string;
  };
  availability: {
    daysOfWeek: string[];
    timeZoneId: string;
    localStartTime: string;
    localEndTime: string;
  };
};

export type SetupEntities = {
  provider?: {
    id: string;
    slug: string;
    displayName: string;
    timeZoneId: string;
    contactEmail?: string;
    publicDescription?: string;
  } | null;
  resource?: {
    id: string;
    displayName: string;
    resourceType: string;
    timeZoneId: string;
  } | null;
  service?: {
    id: string;
    name: string;
    durationMinutes: number;
    description?: string;
    paymentPolicy?: SchedulingService["paymentPolicy"];
  } | null;
  availabilityRule?: {
    id: string;
    daysOfWeek: string[];
    timeZoneId: string;
    localStartTime: string;
    localEndTime: string;
  } | null;
};

export type SetupStepKey = "provider" | "resource" | "service" | "availability" | "public-link";

export const setupStepLabels: Array<{ key: SetupStepKey; title: string; body: string }> = [
  { key: "provider", title: "Provider", body: "Create the public-facing provider identity and timezone." },
  { key: "resource", title: "Resource", body: "Add what can actually be booked so the model stays resource-first." },
  { key: "service", title: "Service", body: "Create the customer-facing service and attach the local/test policy defaults." },
  { key: "availability", title: "Availability", body: "Define the simple weekly rule that produces public slots." },
  { key: "public-link", title: "Public booking link", body: "Open the generated booking page and run a real booking test." },
];

export const weekdayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
