// Provider setup wizard - presentational tree. Extracted from views.tsx
// (M0 setup-wizard rewrite). Zero visual/behavior change: this already used
// bare ShadCN components with the default theme before the rewrite, so
// there was nothing to "modernize" here - the rewrite is architectural
// (real files, a real DeusMachina port for the live orchestration in
// LiveProviderSetupView.tsx), not visual.
//
// Fixture mode (ProviderSetupView) and live mode (LiveProviderSetupView)
// render this exact same component tree, driven by different data sources -
// that sharing is the thing that makes the eventual fixture/live
// unification (flagged in the DeusMachina port audit) tractable later.

import type { ReactNode } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Form, type FormFieldRecord } from "machinalayout/form";
import { Table } from "machinalayout/table";
import { AdminModeBanner, OwnershipSummary } from "../shared/AdminGateBanner";
import { browserTimeZone } from "../shared/format";
import { controlledSchedulingError, isUnsafeAdminError } from "../shared/liveContext";
import type { AvailabilityRule, BookableResource, LocalDevPlatformContext, Provider, SchedulingService } from "../types";
import { availabilitySummary, createDefaultSetupDraft, setupEntitiesFromValues, setupLinkState, setupStepState } from "./derive";
import { setupStepLabels, weekdayOrder, type SetupDraft, type SetupEntities } from "./types";

/**
 * M3.5: renders a Form.fieldsFromTable() result. Used for provider and
 * resource's sections, which are fully uniform (plain text inputs/
 * textareas, one shared disabled formula per section) - exactly the shape
 * machinalayout/form's field table targets. Service's duration field
 * (numeric coercion, type="number") and availability's start/end
 * (type="time") have real HTML-attribute variation the generic
 * FormFieldRecord shape doesn't model, so those two sections stay
 * hand-written rather than force a table abstraction onto fields that
 * genuinely aren't uniform.
 */
function renderFormField(field: FormFieldRecord, onChange: ((key: string, value: string) => void) | undefined) {
  return (
    <>
      <Label htmlFor={field.inputId}>{field.label}</Label>
      {field.control === "textarea" ? (
        <Textarea disabled={field.disabled} id={field.inputId} onChange={(event) => onChange?.(field.changeKey, event.target.value)} value={String(field.value ?? "")} />
      ) : (
        <Input disabled={field.disabled} id={field.inputId} onChange={(event) => onChange?.(field.changeKey, event.target.value)} value={String(field.value ?? "")} />
      )}
    </>
  );
}

function ProviderFieldsSection(props: {
  draft: SetupDraft;
  entities: SetupEntities;
  onProviderFieldChange?: (field: keyof SetupDraft["provider"], value: string) => void;
}) {
  const disabled = !props.onProviderFieldChange || !!props.entities.provider;
  const providerFieldsTable = Table.defineWithSchema({
    id: "providerFields",
    schema: Form.fieldSchema(),
    columns: {
      field: ["displayName", "slug", "timeZoneId", "contactEmail", "publicDescription"],
      label: ["Provider name", "Public slug", "Timezone", "Contact email", "Short public description"],
      control: ["input", "input", "input", "input", "textarea"],
      inputId: ["setup-provider-name", "setup-provider-slug", "setup-provider-timezone", "setup-provider-email", "setup-provider-description"],
      value: [props.draft.provider.displayName, props.draft.provider.slug, props.draft.provider.timeZoneId, props.draft.provider.contactEmail, props.draft.provider.publicDescription],
      changeKey: ["displayName", "slug", "timeZoneId", "contactEmail", "publicDescription"],
      disabled: [disabled, disabled, disabled, disabled, disabled],
      placeholder: [undefined, undefined, undefined, undefined, undefined],
      description: [undefined, undefined, undefined, undefined, undefined],
      required: [true, true, true, false, false],
      testId: ["setup-provider-name", "setup-provider-slug", "setup-provider-timezone", "setup-provider-email", "setup-provider-description"],
    },
  });
  const fields = Form.fieldsFromTable(providerFieldsTable);
  const onChange = (key: string, value: string) => props.onProviderFieldChange?.(key as keyof SetupDraft["provider"], value);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.slice(0, 4).map((field) => (
          <div className="space-y-2" key={field.field}>
            {renderFormField(field, onChange)}
          </div>
        ))}
      </div>
      {fields.slice(4).map((field) => (
        <div className="space-y-2" key={field.field}>
          {renderFormField(field, onChange)}
        </div>
      ))}
    </>
  );
}

function ResourceFieldsSection(props: {
  draft: SetupDraft;
  entities: SetupEntities;
  onResourceFieldChange?: (field: keyof SetupDraft["resource"], value: string) => void;
}) {
  const disabled = !props.onResourceFieldChange || !props.entities.provider || !!props.entities.resource;
  const resourceFieldsTable = Table.defineWithSchema({
    id: "resourceFields",
    schema: Form.fieldSchema(),
    columns: {
      field: ["displayName", "resourceType", "timeZoneId"],
      label: ["Resource name", "Resource type", "Timezone"],
      control: ["input", "input", "input"],
      inputId: ["setup-resource-name", "setup-resource-type", "setup-resource-timezone"],
      value: [props.draft.resource.displayName, props.draft.resource.resourceType, props.draft.resource.timeZoneId],
      changeKey: ["displayName", "resourceType", "timeZoneId"],
      disabled: [disabled, disabled, disabled],
      placeholder: [undefined, undefined, undefined],
      description: [undefined, undefined, undefined],
      required: [true, true, true],
      testId: ["setup-resource-name", "setup-resource-type", "setup-resource-timezone"],
    },
  });
  const fields = Form.fieldsFromTable(resourceFieldsTable);
  const onChange = (key: string, value: string) => props.onResourceFieldChange?.(key as keyof SetupDraft["resource"], value);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">{renderFormField(fields[0], onChange)}</div>
      <div className="space-y-2">{renderFormField(fields[1], onChange)}</div>
      <div className="space-y-2 sm:col-span-2">{renderFormField(fields[2], onChange)}</div>
    </div>
  );
}

function SetupProgressBadge({ state }: { state: "complete" | "current" | "upcoming" }) {
  return (
    <Badge variant={state === "complete" ? "default" : state === "current" ? "secondary" : "outline"}>
      {state === "complete" ? "Done" : state === "current" ? "Next" : "Pending"}
    </Badge>
  );
}

function SetupChecklist({ entities }: { entities: SetupEntities }) {
  return (
    <Card data-testid="provider-setup-steps">
      <CardHeader>
        <CardTitle>Setup checklist</CardTitle>
        <CardDescription>Follow these five steps in order. The next required action stays highlighted.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {setupStepLabels.map((step, index) => {
          const state = setupStepState(step.key, entities);
          return (
            <div className="flex items-start justify-between gap-4 rounded-lg border p-3" key={step.key}>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{index + 1}</Badge>
                  <p className="font-medium">{step.title}</p>
                </div>
                <p className="text-sm text-muted-foreground">{step.body}</p>
              </div>
              <SetupProgressBadge state={state} />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function SetupEntitySummary({ entities }: { entities: SetupEntities }) {
  return (
    <Card data-testid="provider-setup-result">
      <CardHeader>
        <CardTitle>Current setup summary</CardTitle>
        <CardDescription>These are the exact backend entities currently driving the booking surface.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border p-3">
          {entities.provider ? (
            <p data-testid="setup-provider-entity">Provider: {entities.provider.id}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Provider not created yet.</p>
          )}
          {entities.provider ? <p className="text-sm text-muted-foreground">{entities.provider.displayName} · {entities.provider.slug} · {entities.provider.timeZoneId}</p> : null}
        </div>
        <div className="rounded-lg border p-3">
          {entities.resource ? (
            <p data-testid="setup-resource-entity">Resource: {entities.resource.id}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Resource not created yet.</p>
          )}
          {entities.resource ? <p className="text-sm text-muted-foreground">{entities.resource.displayName} · {entities.resource.resourceType} · {entities.resource.timeZoneId}</p> : null}
        </div>
        <div className="rounded-lg border p-3">
          {entities.service ? (
            <p data-testid="setup-service-entity">Service: {entities.service.id}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Service not created yet.</p>
          )}
          {entities.service ? <p className="text-sm text-muted-foreground">{entities.service.name} · {entities.service.durationMinutes} min</p> : null}
        </div>
        <div className="rounded-lg border p-3">
          {entities.availabilityRule ? (
            <p data-testid="setup-availability-entity">Availability rule: {entities.availabilityRule.id}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Availability rule not created yet.</p>
          )}
          {entities.availabilityRule ? <p className="text-sm text-muted-foreground">{availabilitySummary(entities.availabilityRule)}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function SetupResultCard({
  providerSlug,
  entities,
  publicLink,
  copyStatus,
  onCopyLink,
}: {
  providerSlug: string;
  entities: SetupEntities;
  publicLink?: string | null;
  copyStatus?: string | null;
  onCopyLink?: (() => void) | undefined;
}) {
  const ready = !!(entities.provider && entities.resource && entities.service && entities.availabilityRule && publicLink);
  const linkState = setupLinkState(providerSlug, ready);
  const servicePaymentLabel =
    entities.service?.paymentPolicy?.requiresPrepay || entities.service?.paymentPolicy?.requiresDeposit
      ? "Payment required by local/test policy"
      : "No payment required";

  return (
    <Card data-testid="provider-setup-preview">
      <CardHeader>
        <CardTitle>{linkState.heading}</CardTitle>
        <CardDescription>{linkState.body}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border p-3">
          <p className="text-sm font-medium">Public booking link</p>
          {publicLink ? (
            <a className="scheduling-inline-link break-all" data-testid="setup-public-link" href={publicLink}>
              {publicLink}
            </a>
          ) : (
            <code>{linkState.previewPath}</code>
          )}
        </div>

        <div className="rounded-lg border p-3">
          <p className="text-sm font-medium">What customers will see</p>
          <ul className="scheduling-checklist scheduling-checklist-tight">
            <li>Provider: {entities.provider?.displayName ?? "Pending provider"}</li>
            <li>Resource: {entities.resource?.displayName ?? "Pending resource"}</li>
            <li>Service: {entities.service ? `${entities.service.name} (${entities.service.durationMinutes} min)` : "Pending service"}</li>
            <li>Availability: {availabilitySummary(entities.availabilityRule)}</li>
            <li>{servicePaymentLabel}</li>
          </ul>
        </div>

        <div className="flex flex-wrap gap-3">
          {publicLink ? (
            <Button asChild data-testid="setup-open-booking-page">
              <a href={publicLink}>Open booking page</a>
            </Button>
          ) : (
            <Button disabled type="button">
              Open booking page
            </Button>
          )}
          {publicLink ? (
            <Button asChild data-testid="setup-preview-booking-flow" variant="secondary">
              <a href={publicLink}>Preview booking flow</a>
            </Button>
          ) : (
            <Button disabled type="button" variant="secondary">
              Preview booking flow
            </Button>
          )}
          <Button data-testid="setup-copy-link" disabled={!publicLink || !onCopyLink} onClick={onCopyLink} type="button" variant="outline">
            {copyStatus ?? "Copy link"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SetupSectionCard(props: {
  title: string;
  description: string;
  stepNumber: number;
  status: "complete" | "current" | "upcoming";
  testId: string;
  children: ReactNode;
  action?: ReactNode;
  helper?: ReactNode;
}) {
  return (
    <Card data-testid={props.testId}>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{props.stepNumber}</Badge>
              <CardTitle>{props.title}</CardTitle>
            </div>
            <CardDescription>{props.description}</CardDescription>
          </div>
          <SetupProgressBadge state={props.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {props.helper}
        {props.children}
      </CardContent>
      {props.action ? <CardFooter>{props.action}</CardFooter> : null}
    </Card>
  );
}

export function ProviderSetupFlow(props: {
  errorMessage?: string;
  localDevContext?: LocalDevPlatformContext;
  draft: SetupDraft;
  entities: SetupEntities;
  publicLink?: string | null;
  modeLabel: string;
  copyStatus?: string | null;
  onCopyLink?: () => void;
  onProviderFieldChange?: (field: keyof SetupDraft["provider"], value: string) => void;
  onResourceFieldChange?: (field: keyof SetupDraft["resource"], value: string) => void;
  onServiceFieldChange?: (field: keyof SetupDraft["service"], value: string | number) => void;
  onAvailabilityFieldChange?: (field: keyof SetupDraft["availability"], value: string | string[]) => void;
  onToggleAvailabilityDay?: (day: string) => void;
  actionButtons?: {
    provider?: ReactNode;
    resource?: ReactNode;
    service?: ReactNode;
    availability?: ReactNode;
  };
}) {
  const providerState = setupStepState("provider", props.entities);
  const resourceState = setupStepState("resource", props.entities);
  const serviceState = setupStepState("service", props.entities);
  const availabilityState = setupStepState("availability", props.entities);

  return (
    <div className="scheduling-stack" data-testid="provider-setup-root">
      <Card data-testid="provider-setup-hero">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{props.modeLabel}</Badge>
            <Badge variant="secondary">Guided setup</Badge>
            <Badge variant="outline">Resource-first</Badge>
          </div>
          <CardTitle>Set up bookable availability</CardTitle>
          <CardDescription>Create a provider, resource, service, and availability rule, then open the public booking page and test the flow.</CardDescription>
        </CardHeader>
      </Card>

      <div data-testid="provider-setup-warning">
        <AdminModeBanner errorMessage={props.errorMessage} />
      </div>

      {props.localDevContext ? (
        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="mb-2 text-sm font-medium">Unsafe local-dev ownership context</p>
          <p className="mb-3 text-sm text-muted-foreground">Ownership still comes from the backend. This keeps the setup path honest without asking providers to learn internal ids.</p>
          <OwnershipSummary localDevContext={props.localDevContext} />
        </div>
      ) : null}

      {props.errorMessage && !isUnsafeAdminError(props.errorMessage) ? (
        <Alert variant="destructive">
          <AlertTitle>Setup error</AlertTitle>
          <AlertDescription>{controlledSchedulingError(props.errorMessage)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]" data-testid="provider-setup-form">
        <div className="space-y-6">
          <SetupChecklist entities={props.entities} />

          <SetupSectionCard
            action={props.actionButtons?.provider}
            description="Give the public booking page a human-readable provider identity and timezone."
            status={providerState}
            stepNumber={1}
            testId="provider-form-card"
            title="Provider"
          >
            <ProviderFieldsSection entities={props.entities} draft={props.draft} onProviderFieldChange={props.onProviderFieldChange} />
          </SetupSectionCard>

          <SetupSectionCard
            action={props.actionButtons?.resource}
            description="Explain the resource-first model in product language instead of backend jargon."
            helper={
              <Alert>
                <AlertTitle>Resources are what can be booked</AlertTitle>
                <AlertDescription>A resource can be a person, room, device, or service capacity. Services become bookable after they are attached to a resource.</AlertDescription>
              </Alert>
            }
            status={resourceState}
            stepNumber={2}
            testId="resource-form-card"
            title="Resource"
          >
            <ResourceFieldsSection entities={props.entities} draft={props.draft} onResourceFieldChange={props.onResourceFieldChange} />
          </SetupSectionCard>

          <SetupSectionCard
            action={props.actionButtons?.service}
            description="Keep the service customer-facing and honest about local/test policy behavior."
            helper={
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Google Meet placeholder</Badge>
                <Badge variant="outline">Payment required by local/test policy</Badge>
                <Badge variant="outline">Notification policy only</Badge>
              </div>
            }
            status={serviceState}
            stepNumber={3}
            testId="service-form-card"
            title="Service"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="setup-service-name">Service name</Label>
                <Input
                  disabled={!props.onServiceFieldChange || !props.entities.resource || !!props.entities.service}
                  id="setup-service-name"
                  onChange={(event) => props.onServiceFieldChange?.("name", event.target.value)}
                  value={props.draft.service.name}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="setup-service-duration">Duration (minutes)</Label>
                <Input
                  disabled={!props.onServiceFieldChange || !props.entities.resource || !!props.entities.service}
                  id="setup-service-duration"
                  min={5}
                  onChange={(event) => props.onServiceFieldChange?.("durationMinutes", Number(event.target.value) || 0)}
                  type="number"
                  value={props.draft.service.durationMinutes}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="setup-service-description">Description</Label>
              <Textarea
                disabled={!props.onServiceFieldChange || !props.entities.resource || !!props.entities.service}
                id="setup-service-description"
                onChange={(event) => props.onServiceFieldChange?.("description", event.target.value)}
                value={props.draft.service.description}
              />
            </div>
            <div className="rounded-lg border p-3 text-sm text-muted-foreground">
              No payment required is not enabled in this default smoke path. This setup uses a local/test payment requirement so the public booking flow still exercises the controlled payment-required state.
            </div>
          </SetupSectionCard>

          <SetupSectionCard
            action={props.actionButtons?.availability}
            description="Expose only the simple weekly rule the backend already supports."
            status={availabilityState}
            stepNumber={4}
            testId="availability-form-card"
            title="Availability"
          >
            <div className="space-y-2">
              <Label>Days of week</Label>
              <div className="flex flex-wrap gap-2">
                {weekdayOrder.map((day) => {
                  const selected = props.draft.availability.daysOfWeek.includes(day);
                  return (
                    <Button
                      disabled={!props.onToggleAvailabilityDay || !props.entities.service || !!props.entities.availabilityRule}
                      key={day}
                      onClick={() => props.onToggleAvailabilityDay?.(day)}
                      type="button"
                      variant={selected ? "default" : "outline"}
                    >
                      {day.slice(0, 3)}
                    </Button>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="setup-availability-start">Start time</Label>
                <Input
                  disabled={!props.onAvailabilityFieldChange || !props.entities.service || !!props.entities.availabilityRule}
                  id="setup-availability-start"
                  onChange={(event) => props.onAvailabilityFieldChange?.("localStartTime", event.target.value)}
                  type="time"
                  value={props.draft.availability.localStartTime}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="setup-availability-end">End time</Label>
                <Input
                  disabled={!props.onAvailabilityFieldChange || !props.entities.service || !!props.entities.availabilityRule}
                  id="setup-availability-end"
                  onChange={(event) => props.onAvailabilityFieldChange?.("localEndTime", event.target.value)}
                  type="time"
                  value={props.draft.availability.localEndTime}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="setup-availability-timezone">Timezone</Label>
                <Input
                  disabled={!props.onAvailabilityFieldChange || !props.entities.service || !!props.entities.availabilityRule}
                  id="setup-availability-timezone"
                  onChange={(event) => props.onAvailabilityFieldChange?.("timeZoneId", event.target.value)}
                  value={props.draft.availability.timeZoneId}
                />
              </div>
            </div>
          </SetupSectionCard>
        </div>

        <div className="space-y-6">
          <SetupResultCard
            copyStatus={props.copyStatus}
            entities={props.entities}
            onCopyLink={props.onCopyLink}
            providerSlug={props.draft.provider.slug}
            publicLink={props.publicLink}
          />
          <SetupEntitySummary entities={props.entities} />
        </div>
      </div>
    </div>
  );
}

export function ProviderSetupView({
  errorMessage,
  providerSlug = "demo-provider",
  providerTimeZone = browserTimeZone(),
  localDevContext,
  provider,
  resource,
  service,
  availabilityRule,
}: {
  errorMessage?: string;
  providerSlug?: string;
  providerTimeZone?: string;
  localDevContext?: LocalDevPlatformContext;
  provider?: Provider | null;
  resource?: BookableResource | null;
  service?: SchedulingService | null;
  availabilityRule?: AvailabilityRule | null;
}) {
  const draft = createDefaultSetupDraft(providerSlug, providerTimeZone);

  return (
    <ProviderSetupFlow
      draft={draft}
      entities={setupEntitiesFromValues({ provider, resource, service, availabilityRule })}
      errorMessage={errorMessage}
      localDevContext={localDevContext}
      modeLabel="Fixture preview"
      publicLink={`/book/${providerSlug}`}
    />
  );
}

