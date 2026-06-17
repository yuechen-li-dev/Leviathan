using System.Security.Cryptography;
using Leviathan.Server.Apps.Scheduling.Domain;
using Leviathan.Server.Apps.Scheduling.Storage;
using Leviathan.Server.Apps.Scheduling.Runtime;

namespace Leviathan.Server.Apps.Scheduling.Engine;

public sealed class BookingClaimService(SchedulingStore store, ResourceLockRegistry locks, SchedulingBookingRuntime lifecycle)
{
    private static bool Overlaps(ZonedTimeRange a, ZonedTimeRange b) => a.Overlaps(b);
    private static string Token() => Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();
    private static BookingAuditEvent Audit(ProviderId p, ResourceId? r, BookingId? b, HoldId? h, string type, string msg, ZonedTimeRange? range = null, string? decision = null, string? conflict = null, SchedulingLifecycleSummary? lifecycleSummary = null, string actor = "local-dev", IReadOnlyDictionary<string, string>? extra = null)
    {
        var data = new Dictionary<string, string>();
        if (range is not null) { data["startsAtUtc"] = range.StartsAtUtc.ToString("O"); data["endsAtUtc"] = range.EndsAtUtc.ToString("O"); data["timeZoneId"] = range.TimeZoneId; }
        if (decision is not null) data["decision"] = decision;
        if (conflict is not null) data["conflict"] = conflict;
        if (extra is not null) foreach (var item in extra) data[item.Key] = item.Value;
        if (lifecycleSummary is not null) foreach (var item in SchedulingBookingRuntime.AuditData(lifecycleSummary)) data[item.Key] = item.Value;
        return new(Guid.NewGuid().ToString("n"), p, r, b, h, type, DateTimeOffset.UtcNow, actor, Guid.NewGuid().ToString("n"), msg, data);
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
            await store.SaveHold(hold, ct);
            var summary = await lifecycle.HoldCreated(hold, null, ct);
            var audit = Audit(providerId, resourceId, null, hold.Id, "hold_created", "Temporary hold created for exclusive resource.", range, "accepted", lifecycleSummary: summary);
            await store.AppendAudit(audit, ct);
            await lifecycle.HoldCreated(hold, audit.EventId, ct);
            return (hold, null);
        }
        finally { gate.Release(); }
    }

    public async Task<(Hold? Hold, string? Error)> SubmitIntake(HoldId holdId, string token, CustomerContact contact, CancellationToken ct = default)
    {
        var hold = await store.GetHold(holdId, ct);
        if (hold is null || hold.ClaimToken != token) return (null, "hold_not_found");
        if (hold.ExpiresAt <= DateTimeOffset.UtcNow) { await store.ExpireHold(hold, ct); var expiredSummary = await lifecycle.Expired(hold, "rejected", null, ct); var expiredAudit = Audit(hold.ProviderId, hold.ResourceId, null, hold.Id, "hold_expired", "Hold expired before intake.", hold.Range, "rejected", lifecycleSummary: expiredSummary); await store.AppendAudit(expiredAudit, ct); await lifecycle.Expired(hold, "rejected", expiredAudit.EventId, ct); return (null, "hold_expired"); }
        var updated = hold with { CustomerDraft = contact, IntakeSubmittedAt = DateTimeOffset.UtcNow };
        await store.SaveHold(updated, ct);
        var summary = await lifecycle.IntakeSubmitted(updated, null, ct);
        var audit = Audit(updated.ProviderId, updated.ResourceId, null, updated.Id, "intake_submitted", "Customer intake captured for hold.", updated.Range, "accepted", lifecycleSummary: summary);
        await store.AppendAudit(audit, ct);
        await lifecycle.IntakeSubmitted(updated, audit.EventId, ct);
        return (updated, null);
    }

    public async Task<(Booking? Booking, string? Error)> Confirm(HoldId holdId, string token, CustomerContact? contact, CancellationToken ct = default)
    {
        var hold = await store.GetHold(holdId, ct);
        if (hold is null || hold.ClaimToken != token) return (null, "hold_not_found");
        var gate = locks.For(hold.ProviderId, hold.ResourceId); await gate.WaitAsync(ct);
        try
        {
            if (hold.ExpiresAt <= DateTimeOffset.UtcNow) { await store.ExpireHold(hold, ct); var expiredConfirmSummary = await lifecycle.Expired(hold, "rejected", null, ct); var expiredConfirmAudit = Audit(hold.ProviderId, hold.ResourceId, null, hold.Id, "hold_expired", "Hold expired before confirmation.", hold.Range, "rejected", lifecycleSummary: expiredConfirmSummary); await store.AppendAudit(expiredConfirmAudit, ct); await lifecycle.Expired(hold, "rejected", expiredConfirmAudit.EventId, ct); return (null, "hold_expired"); }
            var customer = contact ?? hold.CustomerDraft;
            if (customer is null) return (null, "intake_required");
            await ExpireStale(hold.ProviderId, hold.ResourceId, ct);
            var bookings = await store.GetBookings(hold.ProviderId, hold.ResourceId, ct);
            if (bookings.Any(b => b.Status == "confirmed" && Overlaps(b.Range, hold.Range))) { await store.AppendAudit(Audit(hold.ProviderId, hold.ResourceId, null, hold.Id, "booking_rejected", "Booking rejected due to confirmed booking conflict.", hold.Range, "rejected", "booking"), ct); return (null, "slot_conflict"); }
            var booking = new Booking(BookingId.New(), hold.ProviderId, hold.ServiceId, hold.ResourceId, customer, hold.Range, "confirmed", "m8-local-policy-hold-ttl-10m", DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, null);
            await store.SaveBooking(booking, ct);
            await store.ExpireHold(hold with { Status = "confirmed" }, ct);
            var summary = await lifecycle.Confirmed(hold, booking, null, ct);
            var audit = Audit(hold.ProviderId, hold.ResourceId, booking.Id, hold.Id, "booking_confirmed", "Hold confirmed into booking.", hold.Range, "accepted", lifecycleSummary: summary);
            await store.AppendAudit(audit, ct);
            await lifecycle.Confirmed(hold, booking, audit.EventId, ct);
            return (booking, null);
        }
        finally { gate.Release(); }
    }

    public async Task<(Booking? Booking, string? Error, string? AuditEventId, SchedulingLifecycleSummary? Lifecycle)> Cancel(BookingId bookingId, string reason, string? message, string? actor, CancellationToken ct = default)
    {
        var booking = await store.GetBooking(bookingId, ct);
        if (booking is null) return (null, "not_found", null, null);
        var safeActor = string.IsNullOrWhiteSpace(actor) ? "local-dev" : actor.Trim();
        var reasonCode = string.IsNullOrWhiteSpace(reason) ? "unspecified" : reason.Trim();
        var details = new Dictionary<string, string> { ["bookingId"] = booking.Id.Value, ["reasonCode"] = reasonCode, ["actor"] = safeActor };
        if (!string.IsNullOrWhiteSpace(message)) details["hasMessage"] = "true";

        var gate = locks.For(booking.ProviderId, booking.ResourceId); await gate.WaitAsync(ct);
        try
        {
            booking = await store.GetBooking(bookingId, ct);
            if (booking is null) return (null, "not_found", null, null);
            if (booking.Status != "confirmed")
            {
                details["policyResult"] = "rejected_not_confirmed";
                await store.AppendAudit(Audit(booking.ProviderId, booking.ResourceId, booking.Id, null, "booking_cancellation_rejected", "Booking cancellation rejected by M11 policy.", booking.Range, "rejected", lifecycleSummary: lifecycle.ReadByBooking(booking.ProviderId, booking.Id), actor: safeActor, extra: details), ct);
                return (null, "booking_not_cancellable", null, null);
            }

            details["policyResult"] = "accepted_confirmed_booking";
            var requested = Audit(booking.ProviderId, booking.ResourceId, booking.Id, null, "booking_cancellation_requested", "Booking cancellation requested.", booking.Range, "accepted", actor: safeActor, extra: details);
            await store.AppendAudit(requested, ct);

            var cancelled = booking with
            {
                Status = "cancelled",
                UpdatedAt = DateTimeOffset.UtcNow,
                CancelledAt = DateTimeOffset.UtcNow,
                CancellationReasonCode = reasonCode,
                CancellationMessage = message,
                CancellationActor = safeActor,
                CancellationPolicyResult = "accepted_confirmed_booking"
            };
            await store.SaveBooking(cancelled, ct);
            var summary = await lifecycle.Cancelled(cancelled, null, ct);
            var audit = Audit(cancelled.ProviderId, cancelled.ResourceId, cancelled.Id, null, "booking_cancelled", "Booking cancelled and resource interval released.", cancelled.Range, "accepted", lifecycleSummary: summary, actor: safeActor, extra: details);
            await store.AppendAudit(audit, ct);
            summary = await lifecycle.Cancelled(cancelled, audit.EventId, ct);
            return (cancelled, null, audit.EventId, summary);
        }
        finally { gate.Release(); }
    }

    private async Task ExpireStale(ProviderId providerId, ResourceId resourceId, CancellationToken ct)
    {
        foreach (var hold in await store.GetActiveHolds(providerId, resourceId, DateTimeOffset.MinValue, ct))
            if (hold.ExpiresAt <= DateTimeOffset.UtcNow) { await store.ExpireHold(hold, ct); var summary = await lifecycle.Expired(hold, "released", null, ct); var audit = Audit(providerId, resourceId, null, hold.Id, "hold_expired", "Expired stale hold before claim decision.", hold.Range, "released", lifecycleSummary: summary); await store.AppendAudit(audit, ct); await lifecycle.Expired(hold, "released", audit.EventId, ct); }
    }
}
