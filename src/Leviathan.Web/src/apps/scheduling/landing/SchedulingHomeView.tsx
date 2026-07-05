// Scheduling app landing/home surface (fixture mode). Extracted from
// views.tsx (M1). Zero behavior change - layouts.ts's fallback branch for
// this surface was already a single clean row, nothing to clean up here
// the way setup (M0) and bookings (M1) needed.

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminModeBanner, OwnershipSummary } from "../shared/AdminGateBanner";
import type { SchedulingFixtureScenario } from "../fixtures";

export function SchedulingHomeView({ scenario }: { scenario: SchedulingFixtureScenario }) {
  return (
    <div className="scheduling-stack">
      <Card>
        <CardHeader>
          <CardTitle>Scheduling landing</CardTitle>
          <CardDescription>Start with provider setup, then move into the public booking demo, provider bookings, and lifecycle verification without adding auth, real payments, or external providers.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AdminModeBanner />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Setup provider</CardTitle>
                <CardDescription>Create a bookable provider, resource, service, and availability rule.</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button asChild>
                  <a href="/apps/scheduling/setup?debug=1&fixture=provider-setup">Open setup demo</a>
                </Button>
              </CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Public booking demo</CardTitle>
                <CardDescription>Preview the customer-facing booking page that the generated link will open.</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button asChild variant="secondary">
                  <a href="/book/demo-provider?debug=1&fixture=public-booking">Open booking demo</a>
                </Button>
              </CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Provider bookings</CardTitle>
                <CardDescription>Inspect confirmation, cancellation, notification summary, and audit/lifecycle detail.</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button asChild variant="secondary">
                  <a href="/apps/scheduling/bookings?debug=1&fixture=cancelled-rescheduled">Open bookings demo</a>
                </Button>
              </CardFooter>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Action cards</CardTitle>
          <CardDescription>Secondary entry points stay available for the other milestone surfaces.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="scheduling-action-grid">
            {scenario.actions.map((action) => (
              <article className="card scheduling-action-card" key={action.title}>
                <h3>{action.title}</h3>
                <p>{action.body}</p>
                <a className="scheduling-inline-link" href={action.href}>
                  {action.cta}
                </a>
              </article>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current proof points</CardTitle>
          <CardDescription>These remain the boundaries for the Scheduling UX passes.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="scheduling-proof-grid">
            {scenario.proofPoints.map((point) => (
              <article className="card scheduling-proof-card" key={point}>
                <p>{point}</p>
              </article>
            ))}
          </div>
        </CardContent>
      </Card>

      {scenario.localDevContext ? (
        <Card>
          <CardHeader>
            <CardTitle>Unsafe local-dev ownership context</CardTitle>
            <CardDescription>The backend still owns installation identity; the UI should not make providers think they need internal ids.</CardDescription>
          </CardHeader>
          <CardContent>
            <OwnershipSummary localDevContext={scenario.localDevContext} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
