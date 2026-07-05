// Scheduling app landing/home surface (live backend mode). Extracted from
// views.tsx (M1). Zero behavior change.

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminModeBanner } from "../shared/AdminGateBanner";
import { linkWithCurrentQuery, loadLiveContext } from "../shared/liveContext";

function LiveSchedulingLandingView() {
  const liveContext = loadLiveContext();
  const publicLink = liveContext.providerSlug ? linkWithCurrentQuery(`/book/${liveContext.providerSlug}`) : null;
  const bookingsLink = liveContext.providerId
    ? linkWithCurrentQuery(`/apps/scheduling/bookings?providerId=${encodeURIComponent(liveContext.providerId)}`)
    : linkWithCurrentQuery("/apps/scheduling/bookings");

  return (
    <div className="scheduling-stack">
      <Card>
        <CardHeader>
          <CardTitle>Scheduling real-backend smoke</CardTitle>
          <CardDescription>Use this local/dev admin surface to create a real bookable setup, open the generated public link, and walk the live booking journey end to end.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AdminModeBanner />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Setup provider</CardTitle>
                <CardDescription>Create the provider, resource, service, and availability rule first.</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button asChild data-testid="live-open-setup">
                  <a href={linkWithCurrentQuery("/apps/scheduling/setup")}>Open provider setup</a>
                </Button>
              </CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Public booking demo</CardTitle>
                <CardDescription>{publicLink ? "Open the generated live booking page." : "Available after provider creation."}</CardDescription>
              </CardHeader>
              <CardFooter>
                {publicLink ? (
                  <Button asChild variant="secondary">
                    <a href={publicLink}>Open public booking</a>
                  </Button>
                ) : (
                  <Button disabled type="button" variant="secondary">
                    Open public booking
                  </Button>
                )}
              </CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Provider bookings</CardTitle>
                <CardDescription>Review confirmation, lifecycle, notification summary, and cancellation on live backend data.</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button asChild variant="secondary">
                  <a href={bookingsLink}>Open provider bookings</a>
                </Button>
              </CardFooter>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Policy skeleton status</CardTitle>
          <CardDescription>These reminders stay intentionally honest in local/dev mode.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">No auth/login</Badge>
            <Badge variant="outline">No real payment provider</Badge>
            <Badge variant="outline">No real email or SMS provider</Badge>
            <Badge variant="outline">No calendar sync</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
export { LiveSchedulingLandingView };
