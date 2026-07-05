// Stable landmark map for the scheduling app (machinalayout/atlas). "Keep
// the file. Add the map." - most of the app is still one large views.tsx/
// layouts.ts, same as before M0; the setup wizard is the one surface that's
// actually moved into its own directory so far. This atlas describes both:
// where things live today, and where the still-in-progress split lands
// each surface (per the M0-M4 milestone ladder), so re-deriving "where does
// X live" doesn't mean re-reading 3,000+ lines cold, for either a person or
// a model. Update this file as each later milestone lands its own surface.

import { defineMachinaAtlas } from "machinalayout/atlas";

export const SchedulingAtlas = defineMachinaAtlas({
  app: "Scheduling",
  notes:
    "Second app on the Leviathan platform (Ariadne is first). M0 (this pass) rewrote the provider setup wizard as its own directory with a real DeusMachina-backed live orchestrator; landing/booking/confirmation/bookings surfaces are still inside the monolithic views.tsx/layouts.ts pending M1-M3.",
  sections: [
    {
      key: "setup",
      name: "Provider setup wizard",
      kind: "page",
      route: "/apps/scheduling/setup",
      fixture: "provider-setup",
      owns: [
        "ProviderSetupFlow",
        "ProviderSetupView",
        "LiveProviderSetupView",
        "SetupChecklist",
        "SetupEntitySummary",
        "SetupResultCard",
        "SetupSectionCard",
        "SetupProgressBadge",
        "setupStepState",
        "createDefaultSetupDraft",
        "setupEntitiesFromValues",
        "createSetupMachine",
      ],
      uses: ["shared/format", "shared/liveContext", "shared/AdminGateBanner"],
      usedBy: ["shared-shell"],
      tags: ["scheduling", "setup", "m0", "deusmachina"],
      notes:
        "M0 deliverable. Real DeusMachina port (Candidate 1 from the DeusMachina port audit) - see setup/setupMachine.ts. Fixture (ProviderSetupView) and live (LiveProviderSetupView) modes render the same ProviderSetupFlow component tree, driven by different event sources; that sharing is what makes the fixture/live unification flagged in the port audit tractable once every surface follows this pattern.",
    },
    {
      key: "shared-format",
      name: "Shared formatters",
      kind: "shared",
      file: "shared/format.ts",
      owns: ["slotKey", "statusLabel", "formatDateTimeRange", "buildAvailableDates", "chipToneForValue"],
      usedBy: ["setup", "landing", "public-booking", "confirmation", "bookings"],
      tags: ["shared", "pure"],
      notes: "Pure, no React. Extracted from views.tsx before the setup rewrite - was always self-contained, just trapped behind every other import in one file.",
    },
    {
      key: "shared-live-context",
      name: "Live-mode routing & admin gate",
      kind: "shared",
      file: "shared/liveContext.ts",
      owns: ["isFixtureMode", "loadLiveContext", "saveLiveContext", "isUnsafeAdminError", "controlledSchedulingError"],
      usedBy: ["setup", "landing", "public-booking", "confirmation", "bookings"],
      tags: ["shared", "live-mode"],
      notes:
        "Extracted specifically to avoid a circular import between views.tsx and setup/ (both need these helpers; only one of them could keep them without the other importing back). Same boundary the original scheduling-app restructuring audit already recommended.",
    },
    {
      key: "shared-admin-gate-banner",
      name: "Admin gate / ownership banners",
      kind: "shared",
      file: "shared/AdminGateBanner.tsx",
      owns: ["AdminModeBanner", "OwnershipSummary"],
      usedBy: ["setup", "confirmation"],
      tags: ["shared", "presentational"],
    },
    {
      key: "front-page",
      name: "Front page / landing",
      kind: "page",
      route: "/apps/scheduling",
      fixture: "landing",
      file: "views.tsx",
      owns: ["SchedulingHomeView", "LiveSchedulingLandingView"],
      uses: ["shared/format", "shared/liveContext"],
      tags: ["scheduling", "landing", "not-yet-split"],
      notes: "Candidate for M1 per the milestone ladder. Still lives in views.tsx.",
    },
    {
      key: "public-booking",
      name: "Public booking flow",
      kind: "page",
      route: "/book/:providerSlug",
      fixture: "public-booking",
      file: "views.tsx",
      owns: ["SchedulingBookingPageProvider", "useBookingPage", "PublicBookingFlowView", "LivePublicBookingView"],
      uses: ["shared/format", "shared/liveContext"],
      tags: ["scheduling", "booking", "not-yet-split"],
      notes: "Candidate for M3 (deliberately last - highest value, highest risk, deepest fixture/live divergence per the DeusMachina port audit's Candidate 3).",
    },
    {
      key: "confirmation",
      name: "Booking confirmation & reschedule",
      kind: "page",
      route: "/book/:providerSlug/confirmed/:bookingId",
      fixture: "booking-confirmation",
      file: "views.tsx",
      owns: ["ConfirmationView", "BookingReschedulePanel", "LiveConfirmationView"],
      uses: ["shared/format", "shared/liveContext", "shared/AdminGateBanner"],
      tags: ["scheduling", "confirmation", "reschedule", "not-yet-split"],
      notes:
        "Candidate for M2, combining confirmation + reschedule into one milestone since reschedule is an action reachable from the confirmation screen, not a separate flow - they should share one DeusMachina board. Also still has the same dead-absolute-row pattern layouts.ts's setup branch had before M0 (booking-status-hero/-details/-next-steps etc, never assigned a view); worth re-checking when this surface's turn comes.",
    },
    {
      key: "bookings",
      name: "Provider bookings list",
      kind: "page",
      route: "/apps/scheduling/bookings",
      fixture: "notification-summary",
      file: "views.tsx",
      owns: ["ProviderBookingsView", "LiveProviderBookingsView"],
      uses: ["shared/format", "shared/liveContext"],
      tags: ["scheduling", "bookings", "not-yet-split"],
      notes: "Candidate for M1, alongside front-page. Read-only display of server-computed lifecycle state - no DeusMachina port needed here per the port audit's 'what not to port' section.",
    },
    {
      key: "shared-shell",
      name: "Scheduling shell (Machina layout + slots)",
      kind: "shared",
      owns: ["buildSchedulingLayout", "SchedulingHeroView", "SchedulingMainView", "SchedulingSidebarView"],
      usedBy: ["setup", "front-page", "public-booking", "confirmation", "bookings"],
      tags: ["shared", "layout", "shell"],
      notes: "layouts.ts's setup-surface branch was rewritten in M0 using machinalayout/machina (M.vstack/M.node) in place of ~40 lines of hand-computed absolute positions for rows that were never actually rendered (no view assigned). Other surfaces' branches in this same file likely have the same dead-row pattern; not yet audited.",
    },
  ],
});
