// Public booking flow - presentational tree + registered slot views (M3).
// Extracted from views.tsx. Zero visual change: these already read a flat
// `page` object from useBookingPage(), and BookingPageContext.tsx's
// rewritten provider deliberately keeps that same shape, so nothing here
// needed to change beyond the import paths.
//
// The ~20 exported *View functions below are each independently registered
// against a Machina layout slot (bookingHeader, bookingSummaryPanel,
// bookingCalendarRegion, etc. - see layouts.ts's buildPublicBookingHorizontal/
// VerticalLayout, and machina/views.tsx's viewRegistry). None of them are
// gated by isFixtureMode() internally - they render unconditionally in both
// fixture and live mode, which is exactly why deleting the old
// PublicBookingFlowView/LivePublicBookingView/SlotPickerView dead code (M3)
// was safe: those three were never actually reachable from this surface's
// real layout, which never assigns a "schedulingMain" view.

import type { ReactNode } from "react";
import type { MachinaSlotProps } from "machinalayout/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ModeToggle } from "@/components/mode-toggle";
import { controlledSchedulingError, linkWithCurrentQuery } from "../shared/liveContext";
import { dateFromDateKey, dateKeyForDate, initialsOf, longDateLabelForSlot, slotKey } from "../shared/format";
import { useBookingPage, type BookingPageContextValue } from "./BookingPageContext";

type SlotProps = MachinaSlotProps<unknown, { dispatch?: (event: unknown) => void }>;

function BookingHeaderContent({ mobile = false }: { mobile?: boolean }) {
  const headerClassName = mobile ? "scheduling-booking-header is-mobile" : "scheduling-booking-header";

  return (
    <header className={headerClassName}>
      <a className="scheduling-booking-brand" href={linkWithCurrentQuery("/apps/scheduling")}>
        <span className="scheduling-booking-brand-mark" aria-hidden="true">
          L
        </span>
        <span>Leviathan Scheduling</span>
      </a>
      <div className="scheduling-booking-header-actions">
        <a className="scheduling-booking-header-button" href={linkWithCurrentQuery("/apps/scheduling")}>
          Help
        </a>
        <a className="scheduling-booking-header-button" href={linkWithCurrentQuery("/apps")}>
          Back to apps
        </a>
        <ModeToggle />
      </div>
    </header>
  );
}

function BookingProviderIdentity({
  page,
  compact = false,
}: {
  page: BookingPageContextValue;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "scheduling-provider-head is-compact" : "scheduling-provider-head"}>
      <div className="scheduling-provider-avatar" aria-hidden="true">
        {initialsOf(page.providerName)}
      </div>
      <div>
        <h2>{page.providerName}</h2>
        <p>{page.providerRole}</p>
        <Badge className="mt-2" variant="secondary">{page.providerAvailabilityLabel}</Badge>
      </div>
    </div>
  );
}

function BookingServiceSummary({
  page,
  compact = false,
}: {
  page: BookingPageContextValue;
  compact?: boolean;
}) {
  const service = page.selectedService;

  return (
    <div className={compact ? "scheduling-booking-summary-block is-compact" : "scheduling-booking-summary-block"}>
      <h3>{service?.name ?? "Choose a service"}</h3>
      <p>{service?.description ?? page.providerDescription}</p>
    </div>
  );
}

function BookingMetaRows({
  page,
  compact = false,
}: {
  page: BookingPageContextValue;
  compact?: boolean;
}) {
  return (
    <dl className={compact ? "scheduling-booking-meta is-compact" : "scheduling-booking-meta"}>
      <div>
        <dt>Duration</dt>
        <dd>{page.selectedServiceDurationLabel}</dd>
      </div>
      <div>
        <dt>Location</dt>
        <dd>{page.serviceLocationLabel}</dd>
      </div>
      <div>
        <dt>Timezone</dt>
        <dd>{page.providerTimeZone}</dd>
      </div>
      <div>
        <dt>Price</dt>
        <dd>{page.servicePriceLabel}</dd>
      </div>
    </dl>
  );
}

function BookingStepList({
  page,
  compact = false,
}: {
  page: BookingPageContextValue;
  compact?: boolean;
}) {
  return (
    <ol className={compact ? "scheduling-booking-steps is-compact" : "scheduling-booking-steps"}>
      {["Select a time", "Enter details", "Confirm booking"].map((label, index) => (
        <li className={page.stepIndex === index ? "is-active" : page.stepIndex > index ? "is-complete" : ""} key={label}>
          <span>{index + 1}</span>
          <strong>{label}</strong>
        </li>
      ))}
    </ol>
  );
}

function BookingDurationPicker({ page }: { page: BookingPageContextValue }) {
  return (
    <div className="scheduling-duration-picker" role="tablist" aria-label="Available durations">
      {page.services.map((service) => (
        <Button
          aria-selected={page.selectedServiceId === service.id.value}
          className="min-w-16"
          key={service.id.value}
          onClick={() => page.selectService(service.id.value)}
          role="tab"
          size="sm"
          type="button"
          variant={page.selectedServiceId === service.id.value ? "default" : "outline"}
        >
          {service.durationMinutes}m
        </Button>
      ))}
    </div>
  );
}

function BookingCalendarPanel({
  page,
  title,
  subtitle,
  showDurationPicker = false,
}: {
  page: BookingPageContextValue;
  title?: string;
  subtitle?: string;
  showDurationPicker?: boolean;
}) {
  const selectedDate = page.selectedDateKey ? dateFromDateKey(page.selectedDateKey) : undefined;
  const availableDateSet = new Set(page.availableDateKeys);
  const availableDates = page.availableDateKeys.map(dateFromDateKey);

  return (
    <>
      {title ? (
        <div className="scheduling-booking-card-head">
          <div>
            <h3>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {showDurationPicker ? <BookingDurationPicker page={page} /> : null}
        </div>
      ) : null}
      {availableDates.length ? (
        <Calendar
          className="scheduling-shadcn-calendar"
          classNames={{
            root: "w-full",
            months: "w-full",
            month: "w-full",
            month_grid: "w-full",
          }}
          disabled={(date) => !availableDateSet.has(dateKeyForDate(date))}
          fixedWeeks
          mode="single"
          modifiers={{ available: availableDates }}
          modifiersClassNames={{
            available: "bg-accent/70 text-foreground font-medium",
          }}
          month={page.calendarMonth}
          onMonthChange={page.setCalendarMonth}
          onSelect={(date) => {
            if (date) page.selectDate(dateKeyForDate(date));
          }}
          selected={selectedDate}
          showOutsideDays
          startMonth={page.calendarStartMonth}
          endMonth={page.calendarEndMonth}
        />
      ) : (
        <Alert>
          <AlertTitle>No available dates yet</AlertTitle>
          <AlertDescription>Live slots will appear here when the selected service has availability.</AlertDescription>
        </Alert>
      )}
      <p className="scheduling-booking-timezone-note">Times shown in {page.timezoneLabel}</p>
    </>
  );
}

function BookingSlotButtonList({ page }: { page: BookingPageContextValue }) {
  return (
    <div className="scheduling-booking-slot-list">
      {page.slotGroups.map((entry) => (
        <Button
          className="scheduling-slot-option"
          data-testid={entry.selected ? "public-selected-slot" : "public-slot-option"}
          key={slotKey(entry.slot)}
          onClick={() => page.selectSlot(entry.slot)}
          type="button"
          variant={entry.selected ? "default" : "outline"}
        >
          <span className="scheduling-slot-option-time">{entry.label}</span>
          <span className="scheduling-slot-option-label">{entry.sublabel}</span>
          {entry.selected ? <span aria-hidden="true">✓</span> : null}
        </Button>
      ))}
      {!page.slotGroups.length ? <p>No available times for this day yet.</p> : null}
    </div>
  );
}

function BookingIntakeField({
  label,
  htmlFor,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="scheduling-booking-field">
      <Label htmlFor={htmlFor}>
        {label}
        {optional ? <span className="scheduling-inline-note">(optional)</span> : null}
      </Label>
      {children}
    </div>
  );
}

function BookingIntakeForm({
  page,
  title,
  emptyState,
}: {
  page: BookingPageContextValue;
  title?: string;
  emptyState?: ReactNode;
}) {
  if (!page.selectedSlot) {
    return (
      <article className="scheduling-booking-intake is-empty">
        {title ? <h3>{title}</h3> : null}
        {emptyState ?? <p>Select a time to continue into intake and confirmation.</p>}
      </article>
    );
  }

  return (
    <article className="scheduling-booking-intake">
      {title ? <h3>{title}</h3> : null}
      <BookingIntakeField htmlFor="booking-intake-name" label="Your name">
        <Input
          data-testid="public-intake-name"
          id="booking-intake-name"
          onChange={(event) => page.setCustomerField("name", event.target.value)}
          placeholder="e.g., Alex Johnson"
          value={page.customer.name}
        />
      </BookingIntakeField>
      <BookingIntakeField htmlFor="booking-intake-email" label="Email">
        <Input
          data-testid="public-intake-email"
          id="booking-intake-email"
          onChange={(event) => page.setCustomerField("email", event.target.value)}
          placeholder="e.g., alex@example.com"
          type="email"
          value={page.customer.email}
        />
      </BookingIntakeField>
      <BookingIntakeField htmlFor="booking-intake-phone" label="Phone" optional>
        <Input
          id="booking-intake-phone"
          onChange={(event) => page.setCustomerField("phone", event.target.value)}
          placeholder="Optional"
          value={page.customer.phone}
        />
      </BookingIntakeField>
      <BookingIntakeField htmlFor="booking-intake-notes" label="Notes" optional>
        <Textarea
          id="booking-intake-notes"
          onChange={(event) => page.setCustomerField("notes", event.target.value)}
          placeholder="Anything we should know?"
          value={page.customer.notes}
        />
      </BookingIntakeField>

      {page.hasPaymentAlert ? (
        <Alert data-testid="public-payment-required" variant="destructive">
          <AlertTitle>Payment required</AlertTitle>
          <AlertDescription>{page.paymentAlertText}</AlertDescription>
        </Alert>
      ) : null}

      <div className="scheduling-booking-intake-actions">
        <Button
          data-testid="public-submit-intake"
          disabled={page.live ? !page.hold || !!page.busy : true}
          onClick={() => page.submitIntake()}
          type="button"
        >
          {page.busy === "intake" ? "Saving details…" : "Save details"}
        </Button>
        <Button
          data-testid="public-confirm-booking"
          disabled={page.live ? !page.hold || !!page.busy : true}
          onClick={() => page.confirmBooking()}
          type="button"
        >
          {page.busy === "confirm" ? "Continuing…" : "Continue to confirmation"}
        </Button>
      </div>

      {page.live ? (
        <Button
          data-testid="public-fake-satisfy-payment"
          disabled={!page.hold || !!page.busy}
          onClick={() => page.satisfyPayment()}
          type="button"
          variant="secondary"
        >
          {page.busy === "payment" ? "Marking fake/local payment satisfied…" : "Mark fake/local payment satisfied"}
        </Button>
      ) : null}
    </article>
  );
}

function BookingFooterSummaryCard({
  page,
  compact = false,
}: {
  page: BookingPageContextValue;
  compact?: boolean;
}) {
  return (
    <section className={compact ? "scheduling-booking-footer is-compact" : "scheduling-booking-footer"} data-testid="public-hold-state">
      <div className="scheduling-booking-footer-main">
        <div className="scheduling-provider-avatar is-small" aria-hidden="true">
          {initialsOf(page.providerName)}
        </div>
        <div>
          <strong>{page.providerName}</strong>
          <p>
            {page.selectedService?.name ?? "Choose a service"}
            {page.selectedSlot ? ` · ${longDateLabelForSlot(page.selectedSlot)} · ${page.serviceLocationLabel}` : " · Select a time to continue"}
          </p>
        </div>
      </div>
      <dl className="scheduling-booking-footer-state">
        <div>
          <dt>Hold id:</dt>
          <dd>{page.hold?.holdId ?? "none"}</dd>
        </div>
        <div>
          <dt>Hold status:</dt>
          <dd>{page.hold?.status ?? "none"}</dd>
        </div>
        <div>
          <dt>Payment reference:</dt>
          <dd>{page.hold?.paymentReference ?? "none"}</dd>
        </div>
      </dl>
      <Button disabled={!page.selectedSlot} onClick={() => page.clearSelection()} type="button" variant="outline">
        Cancel selection
      </Button>
    </section>
  );
}

export function BookingHeaderView(props: SlotProps) {
  void props;
  return <BookingHeaderContent />;
}

export function BookingMobileHeaderView(props: SlotProps) {
  void props;
  return <BookingHeaderContent mobile />;
}

export function BookingSummaryPanelView(props: SlotProps) {
  void props;
  const page = useBookingPage();

  return (
    <section className="scheduling-booking-summary">
      <BookingProviderIdentity page={page} />
      <Separator />
      <BookingServiceSummary page={page} />
      <Separator />
      <BookingMetaRows page={page} />
      <Separator />
      <BookingStepList page={page} />
      <Separator />
      <aside className="scheduling-booking-callout" role="note">
        <h3>What to expect</h3>
        {page.whatToExpectLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </aside>

      <div className="scheduling-booking-trust">
        {page.trustNotes.map((note) => (
          <p key={note}>{note}</p>
        ))}
      </div>
    </section>
  );
}

export function BookingMobileSummaryCardView(props: SlotProps) {
  void props;
  const page = useBookingPage();

  return (
    <section className="scheduling-booking-summary is-mobile-card">
      <BookingProviderIdentity page={page} compact />
      <BookingServiceSummary page={page} compact />
      <BookingMetaRows page={page} compact />
    </section>
  );
}

export function BookingMobileStepStatusView(props: SlotProps) {
  void props;
  const page = useBookingPage();

  return (
    <section className="scheduling-booking-mobile-step-card">
      <BookingStepList page={page} compact />
      <p>{page.selectedSlot ? `Selected ${longDateLabelForSlot(page.selectedSlot)}` : "Choose a day, then a time, then continue into intake."}</p>
    </section>
  );
}

export function BookingMainHeaderView(props: SlotProps) {
  void props;
  const page = useBookingPage();

  return (
    <section className="scheduling-booking-main-header">
      <div>
        <h2>Choose a date and time</h2>
        <p>Times shown in {page.timezoneLabel}</p>
      </div>
      <BookingDurationPicker page={page} />
    </section>
  );
}

export function BookingCalendarRegionView(props: SlotProps) {
  void props;
  const page = useBookingPage();

  return (
    <section className="scheduling-booking-calendar">
      <BookingCalendarPanel page={page} />
    </section>
  );
}

export function BookingMobileCalendarCardView(props: SlotProps) {
  void props;
  const page = useBookingPage();

  return (
    <section className="scheduling-booking-calendar is-mobile-card">
      <BookingCalendarPanel page={page} title="Choose a date" subtitle={`Times shown in ${page.timezoneLabel}`} showDurationPicker />
    </section>
  );
}

export function BookingSlotsRegionView(props: SlotProps) {
  void props;
  const page = useBookingPage();

  return (
    <section className="scheduling-booking-slots">
      <h3>{page.dayHeadline}</h3>

      {page.errorMessage && !page.hasPaymentAlert ? (
        <p className="error" role="alert">
          {controlledSchedulingError(page.errorMessage)}
        </p>
      ) : null}

      <BookingSlotButtonList page={page} />
      <BookingIntakeForm page={page} />
    </section>
  );
}

export function BookingMobileSlotsCardView(props: SlotProps) {
  void props;
  const page = useBookingPage();

  return (
    <section className="scheduling-booking-slots is-mobile-card">
      <div className="scheduling-booking-card-head">
        <div>
          <h3>Available times</h3>
          <p>{page.dayHeadline}</p>
        </div>
      </div>

      {page.errorMessage && !page.hasPaymentAlert ? (
        <p className="error" role="alert">
          {controlledSchedulingError(page.errorMessage)}
        </p>
      ) : null}

      <BookingSlotButtonList page={page} />
    </section>
  );
}

export function BookingMobileIntakeCardView(props: SlotProps) {
  void props;
  const page = useBookingPage();

  return (
    <section className="scheduling-booking-mobile-intake-card">
      <BookingIntakeForm
        page={page}
        title="Your details"
        emptyState={
          <>
            <p>Pick an available time first.</p>
            <p>We’ll show the intake form, payment-required notice, and confirmation action here.</p>
          </>
        }
      />
    </section>
  );
}

export function BookingFooterSummaryView(props: SlotProps) {
  void props;
  const page = useBookingPage();

  return <BookingFooterSummaryCard page={page} />;
}

export function BookingMobileConfirmFooterView(props: SlotProps) {
  void props;
  const page = useBookingPage();

  return <BookingFooterSummaryCard page={page} compact />;
}
