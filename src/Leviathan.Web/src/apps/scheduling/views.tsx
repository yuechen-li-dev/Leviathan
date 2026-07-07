// Scheduling app shell dispatch layer (M4 cutover). What's left here after
// M0-M3.5 moved every surface into its own directory: the three
// screen-catalog-registered shell views (Hero/Main/Sidebar) that route each
// surface's fixture or live component into the right slot, plus their live
// counterparts. This is not a monolith remnant waiting to be deleted - it's
// the legitimate, appropriately-scoped shell layer every other app in this
// codebase has too (compare src/machina/views.tsx, which does the same job
// for the non-scheduling routes). M4 stripped ~90 dead imports left over
// from the deleted booking-flow/setup/confirmation/bookings-list code that
// used to live in this file before M0-M3 moved it out; nothing below
// actually used them.

import type { MachinaSlotProps } from "machinalayout/react";
import { StatusChip } from "./shared/StatusChip";
import { BookingStatusSummary } from "./shared/BookingStatusSummary";
import { isFixtureMode, linkWithCurrentQuery, liveRouteLabel, liveRouteTitle, loadLiveContext, pathname } from "./shared/liveContext";
import { LiveProviderSetupView } from "./setup/LiveProviderSetupView";
import { ProviderSetupView } from "./setup/ProviderSetupFlow";
import { SchedulingHomeView } from "./landing/SchedulingHomeView";
import { LiveSchedulingLandingView } from "./landing/LiveSchedulingLandingView";
import { ProviderBookingsView } from "./bookings/ProviderBookingsView";
import { LiveProviderBookingsView } from "./bookings/LiveProviderBookingsView";
import { ConfirmationSurfaceView } from "./confirmation/ConfirmationSurfaceView";
import { LiveConfirmationView } from "./confirmation/LiveConfirmationView";
import { BookingReschedulePanel } from "./confirmation/BookingReschedulePanel";
import type { SchedulingFixtureScenario } from "./fixtures";

type SlotProps = MachinaSlotProps<unknown, { dispatch?: (event: unknown) => void }>;
type SchedulingViewData = { scenario: SchedulingFixtureScenario };

function scenarioFrom(props: SlotProps): SchedulingFixtureScenario {
  return (props.viewData as SchedulingViewData).scenario;
}

export function SchedulingHeroView(props: SlotProps) {
  const scenario = scenarioFrom(props);
  if (!isFixtureMode()) return <LiveSchedulingHero />;
  return (
    <section className="panel scheduling-shell scheduling-shell-hero">
      <div className="scheduling-eyebrow-row">
        <span className="scheduling-eyebrow">{scenario.eyebrow}</span>
        <span className="scheduling-route-badge">{scenario.routeLabel}</span>
      </div>
      <h1>{scenario.title}</h1>
      <p className="scheduling-hero-copy">{scenario.subtitle}</p>
      <div className="scheduling-chip-row">
        <StatusChip tone="confirmed" label="resource-first booking" />
        <StatusChip tone="warning" label="local/dev admin" />
        <StatusChip tone="info" label="Machina layout driven" />
      </div>
    </section>
  );
}

export function SchedulingMainView(props: SlotProps) {
  const scenario = scenarioFrom(props);
  if (!isFixtureMode()) return <LiveSchedulingMain />;

  return (
    <section className="panel scheduling-shell scheduling-shell-main">
      {scenario.surface === "landing" ? (
        <SchedulingHomeView scenario={scenario} />
      ) : scenario.surface === "setup" ? (
        <ProviderSetupView
          availabilityRule={scenario.setupAvailabilityRule}
          errorMessage={scenario.errorMessage}
          providerSlug={scenario.providerSlug}
          provider={scenario.setupProvider}
          providerTimeZone={scenario.providerTimeZone}
          resource={scenario.setupResource}
          service={scenario.setupService}
          localDevContext={scenario.localDevContext}
        />
      ) : scenario.surface === "confirmation" ? (
        // Note: there is deliberately no `scenario.surface === "booking"`
        // branch here. The booking surface's layout (buildPublicBooking
        // Horizontal/VerticalLayout in layouts.ts) never assigns a
        // "schedulingMain" view - it has its own dedicated slot set
        // (bookingHeader, bookingSummaryPanel, bookingCalendarRegion, etc.,
        // each independently registered). A branch used to live here
        // rendering PublicBookingFlowView, but tracing the actual view
        // registry confirmed it was never reachable; removed along with
        // that component and its live counterpart, LivePublicBookingView
        // (M3).
        <ConfirmationSurfaceView scenario={scenario} />
      ) : scenario.surface === "booking" ? null : (
        <ProviderBookingsView
          bookings={scenario.bookings}
          selectedBooking={scenario.selectedBooking}
          auditEvents={scenario.auditEvents}
          lifecycle={scenario.lifecycle}
          errorMessage={scenario.errorMessage}
          reschedulePanel={
            scenario.selectedBooking ? (
              <BookingReschedulePanel
                booking={scenario.rescheduleState?.oldBooking ?? scenario.selectedBooking}
                fixtureState={scenario.rescheduleState}
                providerSlug={scenario.providerSlug}
              />
            ) : undefined
          }
        />
      )}
    </section>
  );
}

export function SchedulingSidebarView(props: SlotProps) {
  const scenario = scenarioFrom(props);
  if (!isFixtureMode()) return <LiveSchedulingSidebar />;
  const spotlight = scenario.selectedBooking ?? scenario.booking;

  return (
    <section className="panel scheduling-shell scheduling-shell-sidebar">
      <div className="scheduling-stack">
        <section className="scheduling-subpanel">
          <h2>Demo flow</h2>
          <div className="scheduling-action-grid">
            {scenario.actions.map((action) => (
              <article className="card scheduling-action-card" key={action.title}>
                <p className="scheduling-card-kicker">{action.title}</p>
                <p>{action.body}</p>
                <a className="scheduling-inline-link" href={action.href}>
                  {action.cta}
                </a>
              </article>
            ))}
          </div>
        </section>

        <section className="scheduling-subpanel">
          <h2>What this proves</h2>
          <ul className="scheduling-checklist">
            {scenario.proofPoints.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        {spotlight ? (
          <section className="scheduling-subpanel">
            <h2>Fixture spotlight</h2>
            <BookingStatusSummary booking={spotlight} lifecycle={scenario.lifecycle} />
          </section>
        ) : null}
      </div>
    </section>
  );
}

function LiveSchedulingHero() {
  return (
    <section className="panel scheduling-shell scheduling-shell-hero">
      <div className="scheduling-eyebrow-row">
        <span className="scheduling-eyebrow">Scheduling real-backend smoke</span>
        <span className="scheduling-route-badge">{liveRouteLabel()}</span>
      </div>
      <h1>{liveRouteTitle()}</h1>
      <p className="scheduling-hero-copy">Fixture mode is off for this route. The UI below is talking to the live ASP.NET Scheduling backend through the existing local-dev path.</p>
      <div className="scheduling-chip-row">
        <StatusChip tone="confirmed" label="real backend" />
        <StatusChip tone="warning" label="unsafe local-dev admin" />
        <StatusChip tone="info" label="Machina layout driven" />
      </div>
    </section>
  );
}

function LiveSchedulingMain() {
  if (pathname().startsWith("/apps/scheduling/setup")) return <LiveProviderSetupView />;
  if (pathname().startsWith("/apps/scheduling/bookings")) return <LiveProviderBookingsView />;
  if (pathname().includes("/confirmed/")) return <LiveConfirmationView />;
  // "/book/" (public booking) never reaches here - the booking surface's
  // layout never assigns a "schedulingMain" view (it has its own dedicated
  // slot set: bookingHeader, bookingSummaryPanel, bookingCalendarRegion,
  // etc., each independently registered), so this function is never called
  // for a live /book/:slug route. Confirmed by tracing every view: layout
  // assignment in layouts.ts before removing the dead LivePublicBookingView
  // this branch used to route to (M3).
  return <LiveSchedulingLandingView />;
}

function LiveSchedulingSidebar() {
  const liveContext = loadLiveContext();
  const publicLink = liveContext.providerSlug ? linkWithCurrentQuery(`/book/${liveContext.providerSlug}`) : null;
  const bookingsLink = liveContext.providerId ? linkWithCurrentQuery(`/apps/scheduling/bookings?providerId=${encodeURIComponent(liveContext.providerId)}`) : linkWithCurrentQuery("/apps/scheduling/bookings");

  return (
    <section className="panel scheduling-shell scheduling-shell-sidebar">
      <div className="scheduling-stack">
        <section className="scheduling-subpanel">
          <h2>Smoke flow</h2>
          <ul className="scheduling-checklist">
            <li>Create provider, resource, service, and availability with the unsafe local-dev admin path.</li>
            <li>Use the public booking route to create a hold, submit intake, satisfy fake/local payment, and confirm.</li>
            <li>Inspect provider bookings, lifecycle, audit events, and cancellation from the same live backend data.</li>
          </ul>
        </section>

        <section className="scheduling-subpanel">
          <h2>Current links</h2>
          <div className="scheduling-action-grid">
            <article className="card scheduling-action-card">
              <p className="scheduling-card-kicker">Setup</p>
              <a className="scheduling-inline-link" href={linkWithCurrentQuery("/apps/scheduling/setup")}>
                Open setup
              </a>
            </article>
            {publicLink ? (
              <article className="card scheduling-action-card">
                <p className="scheduling-card-kicker">Public booking</p>
                <a className="scheduling-inline-link" data-testid="live-sidebar-public-link" href={publicLink}>
                  Open booking link
                </a>
              </article>
            ) : null}
            <article className="card scheduling-action-card">
              <p className="scheduling-card-kicker">Provider bookings</p>
              <a className="scheduling-inline-link" href={bookingsLink}>
                Open bookings
              </a>
            </article>
          </div>
        </section>

        {liveContext.providerId ? (
          <section className="scheduling-subpanel">
            <h2>Live context</h2>
            <ul className="scheduling-checklist scheduling-checklist-tight">
              <li>Provider id: {liveContext.providerId}</li>
              <li>Provider slug: {liveContext.providerSlug ?? "unknown"}</li>
              <li>Service id: {liveContext.serviceId ?? "not created yet"}</li>
              <li>Booking id: {liveContext.bookingId ?? "not confirmed yet"}</li>
            </ul>
          </section>
        ) : null}
      </div>
    </section>
  );
}

