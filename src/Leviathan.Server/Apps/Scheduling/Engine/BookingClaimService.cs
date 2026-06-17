using System.Security.Cryptography;
using Leviathan.Server.Apps.Scheduling.Domain;
using Leviathan.Server.Apps.Scheduling.Storage;

namespace Leviathan.Server.Apps.Scheduling.Engine;

public sealed class BookingClaimService(SchedulingStore store, ResourceLockRegistry locks)
{
    private static bool Overlaps(ZonedTimeRange a, ZonedTimeRange b) => a.Overlaps(b);
    private static string Token() => Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();
    private static BookingAuditEvent Audit(ProviderId p, ResourceId? r, BookingId? b, HoldId? h, string type, string msg, ZonedTimeRange? range = null, string? decision = null, string? conflict = null)
    {
        var data = new Dictionary<string, string>();
        if (range is not null) { data["startsAtUtc"] = range.StartsAtUtc.ToString("O"); data["endsAtUtc"] = range.EndsAtUtc.ToString("O"); data["timeZoneId"] = range.TimeZoneId; }
        if (decision is not null) data["decision"] = decision;
        if (conflict is not null) data["conflict"] = conflict;
        return new(Guid.NewGuid().ToString("n"), p, r, b, h, type, DateTimeOffset.UtcNow, "local-dev", Guid.NewGuid().ToString("n"), msg, data);
    }

    public async Task<(Hold? Hold, string? Error)> CreateHold(ProviderId providerId, ServiceId serviceId, ResourceId resourceId, ZonedTimeRange range, CancellationToken ct = default)
    {
        var gate = locks.For(providerId, resourceId); await gate.WaitAsync(ct);
        try
        {
            await ExpireStale(providerId, resourceId, ct);
            var bookings = await store.GetBookings(providerId, resourceId, ct);
            if (bookings.Any(b => b.Status == "confirmed" && Overlaps(b.Range, range))) { await store.AppendAudit(Audit(providerId, resourceId, null, null, "hold_rejected", "Hold rejected due to confirmed booking conflict.", range, "rejected", "booking"), ct); return (null, "slot_conflict"); }
            var holds = await store.GetActiveHolds(providerId, resourceId, DateTimeOffset.UtcNow, ct);
            if (holds.Any(h => Overlaps(h.Range, range))) { await store.AppendAudit(Audit(providerId, resourceId, null, null, "hold_rejected", "Hold rejected due to active hold conflict.", range, "rejected", "hold"), ct); return (null, "slot_conflict"); }
            var hold = new Hold(HoldId.New(), providerId, serviceId, resourceId, range, Token(), null, "active", DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddMinutes(10), null);
            await store.SaveHold(hold, ct); await store.AppendAudit(Audit(providerId, resourceId, null, hold.Id, "hold_created", "Temporary hold created for exclusive resource.", range, "accepted"), ct);
            return (hold, null);
        }
        finally { gate.Release(); }
    }

    public async Task<(Hold? Hold, string? Error)> SubmitIntake(HoldId holdId, string token, CustomerContact contact, CancellationToken ct = default)
    {
        var hold = await store.GetHold(holdId, ct);
        if (hold is null || hold.ClaimToken != token) return (null, "hold_not_found");
        if (hold.ExpiresAt <= DateTimeOffset.UtcNow) { await store.ExpireHold(hold, ct); await store.AppendAudit(Audit(hold.ProviderId, hold.ResourceId, null, hold.Id, "hold_expired", "Hold expired before intake.", hold.Range, "rejected"), ct); return (null, "hold_expired"); }
        var updated = hold with { CustomerDraft = contact, IntakeSubmittedAt = DateTimeOffset.UtcNow };
        await store.SaveHold(updated, ct); await store.AppendAudit(Audit(updated.ProviderId, updated.ResourceId, null, updated.Id, "intake_submitted", "Customer intake captured for hold.", updated.Range, "accepted"), ct);
        return (updated, null);
    }

    public async Task<(Booking? Booking, string? Error)> Confirm(HoldId holdId, string token, CustomerContact? contact, CancellationToken ct = default)
    {
        var hold = await store.GetHold(holdId, ct);
        if (hold is null || hold.ClaimToken != token) return (null, "hold_not_found");
        var gate = locks.For(hold.ProviderId, hold.ResourceId); await gate.WaitAsync(ct);
        try
        {
            if (hold.ExpiresAt <= DateTimeOffset.UtcNow) { await store.ExpireHold(hold, ct); await store.AppendAudit(Audit(hold.ProviderId, hold.ResourceId, null, hold.Id, "hold_expired", "Hold expired before intake.", hold.Range, "rejected"), ct); return (null, "hold_expired"); }
            var customer = contact ?? hold.CustomerDraft;
            if (customer is null) return (null, "intake_required");
            await ExpireStale(hold.ProviderId, hold.ResourceId, ct);
            var bookings = await store.GetBookings(hold.ProviderId, hold.ResourceId, ct);
            if (bookings.Any(b => b.Status == "confirmed" && Overlaps(b.Range, hold.Range))) { await store.AppendAudit(Audit(hold.ProviderId, hold.ResourceId, null, hold.Id, "booking_rejected", "Booking rejected due to confirmed booking conflict.", hold.Range, "rejected", "booking"), ct); return (null, "slot_conflict"); }
            var booking = new Booking(BookingId.New(), hold.ProviderId, hold.ServiceId, hold.ResourceId, customer, hold.Range, "confirmed", "m8-local-policy-hold-ttl-10m", DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, null);
            await store.SaveBooking(booking, ct);
            await store.ExpireHold(hold with { Status = "confirmed" }, ct);
            await store.AppendAudit(Audit(hold.ProviderId, hold.ResourceId, booking.Id, hold.Id, "booking_confirmed", "Hold confirmed into booking.", hold.Range, "accepted"), ct);
            return (booking, null);
        }
        finally { gate.Release(); }
    }

    private async Task ExpireStale(ProviderId providerId, ResourceId resourceId, CancellationToken ct)
    {
        foreach (var hold in await store.GetActiveHolds(providerId, resourceId, DateTimeOffset.MinValue, ct))
            if (hold.ExpiresAt <= DateTimeOffset.UtcNow) { await store.ExpireHold(hold, ct); await store.AppendAudit(Audit(providerId, resourceId, null, hold.Id, "hold_expired", "Expired stale hold before claim decision.", hold.Range, "released"), ct); }
    }
}
