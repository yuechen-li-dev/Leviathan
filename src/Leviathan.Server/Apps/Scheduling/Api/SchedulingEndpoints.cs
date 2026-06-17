using Leviathan.Server.Apps.Scheduling.Domain;
using Leviathan.Server.Apps.Scheduling.Engine;
using Leviathan.Server.Apps.Scheduling.Storage;

namespace Leviathan.Server.Apps.Scheduling.Api;

public static class SchedulingEndpoints
{
    public static IEndpointRouteBuilder MapSchedulingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/apps/scheduling");
        group.MapPost("/providers", async (CreateProviderRequest req, SchedulingStore store) => { var now = DateTimeOffset.UtcNow; var p = new Provider(ProviderId.New(), req.Slug, req.DisplayName, req.TimeZoneId, req.ContactEmail, req.PublicDescription, now, now); await store.SaveProvider(p); return Results.Ok(p); });
        group.MapGet("/providers/{providerId}", async (string providerId, SchedulingStore store) => await store.GetProvider(new(providerId)) is { } p ? Results.Ok(p) : Results.NotFound(new SchedulingError("not_found", "Provider not found.")));
        group.MapPost("/resources", async (CreateResourceRequest req, SchedulingStore store) => { var p = await store.GetProvider(new(req.ProviderId)); if (p is null) return Results.NotFound(new SchedulingError("not_found", "Provider not found.")); var r = new BookableResource(ResourceId.New(), p.Id, req.DisplayName, req.ResourceType, req.TimeZoneId ?? p.TimeZoneId, "Exclusive", true, DateTimeOffset.UtcNow); await store.SaveResource(r); return Results.Ok(r); });
        group.MapPost("/services", async (CreateServiceRequest req, SchedulingStore store) => { var p = await store.GetProvider(new(req.ProviderId)); if (p is null) return Results.NotFound(new SchedulingError("not_found", "Provider not found.")); var s = new SchedulingService(ServiceId.New(), p.Id, req.Name, req.Description, req.DurationMinutes, req.BufferBeforeMinutes, req.BufferAfterMinutes, [], req.IsPublic, DateTimeOffset.UtcNow); await store.SaveService(s); return Results.Ok(s); });
        group.MapPost("/services/{serviceId}/resources", async (string serviceId, AssignResourceRequest req, SchedulingStore store) => { var s = await store.GetService(new(serviceId)); if (s is null) return Results.NotFound(new SchedulingError("not_found", "Service not found.")); var rid = new ResourceId(req.ResourceId); var updated = s with { AssignedResourceIds = s.AssignedResourceIds.Concat([rid]).Distinct().ToArray() }; await store.SaveService(updated); return Results.Ok(updated); });
        group.MapPost("/availability-rules", async (CreateAvailabilityRuleRequest req, SchedulingStore store) => { var rule = new AvailabilityRule(AvailabilityRuleId.New(), new(req.ProviderId), new(req.ResourceId), req.TimeZoneId, req.DaysOfWeek, TimeOnly.Parse(req.LocalStartTime), TimeOnly.Parse(req.LocalEndTime), req.EffectiveFrom, req.EffectiveUntil, true, DateTimeOffset.UtcNow); await store.SaveAvailabilityRule(rule); return Results.Ok(rule); });
        group.MapGet("/bookings", async (string providerId, SchedulingStore store) => Results.Ok(await store.GetBookings(new(providerId))));
        group.MapGet("/public/{providerSlug}", async (string providerSlug, SchedulingStore store) => await store.GetProviderBySlug(providerSlug) is { } p ? Results.Ok(p) : Results.NotFound(new SchedulingError("not_found", "Provider not found.")));
        group.MapGet("/public/{providerSlug}/services", async (string providerSlug, SchedulingStore store) => await store.GetProviderBySlug(providerSlug) is { } p ? Results.Ok((await store.GetServices(p.Id)).Where(s => s.IsPublic)) : Results.NotFound(new SchedulingError("not_found", "Provider not found.")));
        group.MapGet("/public/{providerSlug}/slots", async (string providerSlug, string serviceId, DateTimeOffset from, DateTimeOffset to, string? timeZone, SlotGenerator gen) => Results.Ok(await gen.Generate(providerSlug, new(serviceId), from, to, timeZone)));
        group.MapPost("/holds", async (CreateHoldRequest req, BookingClaimService claims) => { var (hold, error) = await claims.CreateHold(new(req.ProviderId), new(req.ServiceId), new(req.ResourceId), new(req.StartsAtUtc, req.EndsAtUtc, req.TimeZoneId)); return hold is null ? Conflict(error!) : Results.Ok(new HoldResponse(hold.Id.Value, hold.ClaimToken, hold.ExpiresAt, hold.Status)); });
        group.MapPost("/holds/{holdId}/intake", async (string holdId, SubmitIntakeRequest req, BookingClaimService claims) => { var (hold, error) = await claims.SubmitIntake(new(holdId), req.ClaimToken, new(req.Name, req.Email, req.Phone, req.Notes)); return hold is null ? Error(error!) : Results.Ok(new HoldResponse(hold.Id.Value, hold.ClaimToken, hold.ExpiresAt, hold.Status)); });
        group.MapPost("/bookings/confirm", async (ConfirmBookingRequest req, BookingClaimService claims) => { var (booking, error) = await claims.Confirm(new(req.HoldId), req.ClaimToken, req.Customer); return booking is null ? Error(error!) : Results.Ok(booking); });
        group.MapGet("/bookings/{bookingId}", async (string bookingId, SchedulingStore store) => await store.GetBooking(new(bookingId)) is { } b ? Results.Ok(b) : Results.NotFound(new SchedulingError("not_found", "Booking not found.")));
        group.MapGet("/bookings/{bookingId}/audit", async (string bookingId, string providerId, SchedulingStore store) => Results.Ok(await store.GetBookingAudit(new(providerId), new(bookingId))));
        return app;
    }
    private static IResult Conflict(string error) => Results.Conflict(new SchedulingError(error, "The requested exclusive resource interval is no longer available."));
    private static IResult Error(string error) => error is "slot_conflict" ? Conflict(error) : Results.BadRequest(new SchedulingError(error, "The scheduling request could not be completed."));
}
