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
            var service = await store.GetService(serviceId, ct);
            var paymentPolicy = service?.PaymentPolicy;
            var paymentRequired = paymentPolicy?.RequiresPaymentBeforeConfirmation == true;
            var hold = new Hold(HoldId.New(), providerId, serviceId, resourceId, range, Token(), null, "active", DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddMinutes(10), null, PaymentRequirementStatus: paymentRequired ? PaymentRequirementStatuses.Required : PaymentRequirementStatuses.NotRequired, PaymentPolicySnapshot: paymentPolicy, PaymentRequiredAt: paymentRequired ? DateTimeOffset.UtcNow : null);
            await store.SaveHold(hold, ct);
            var summary = await lifecycle.HoldCreated(hold, null, ct);
            var audit = Audit(providerId, resourceId, null, hold.Id, "hold_created", "Temporary hold created for exclusive resource.", range, "accepted", lifecycleSummary: summary);
            await store.AppendAudit(audit, ct);
            if (paymentPolicy is not null) await store.AppendAudit(Audit(providerId, resourceId, null, hold.Id, "payment_policy_snapshot_recorded", "Payment policy snapshot recorded on hold.", range, "accepted", extra: PaymentAuditData(hold)), ct);
            if (paymentRequired) await store.AppendAudit(Audit(providerId, resourceId, null, hold.Id, "payment_required", "Payment is required before confirmation.", range, "accepted", extra: PaymentAuditData(hold)), ct);
            await lifecycle.HoldCreated(hold, audit.EventId, ct);
            return (hold, null);
        }
        finally { gate.Release(); }
    }

    public async Task<(Hold? Hold, string? Error, string? AuditEventId)> CreateReplacementHold(BookingId bookingId, ServiceId serviceId, ResourceId resourceId, ZonedTimeRange range, string reason, string? message, string? actor, CancellationToken ct = default)
    {
        var old = await store.GetBooking(bookingId, ct);
        if (old is null) return (null, "not_found", null);
        var safeActor = string.IsNullOrWhiteSpace(actor) ? "local-dev" : actor.Trim();
        var reasonCode = string.IsNullOrWhiteSpace(reason) ? "unspecified" : reason.Trim();
        var details = RescheduleDetails(old, null, null, range, resourceId, safeActor, reasonCode, message);

        var gate = locks.For(old.ProviderId, resourceId); await gate.WaitAsync(ct);
        try
        {
            old = await store.GetBooking(bookingId, ct);
            if (old is null) return (null, "not_found", null);
            if (old.Status != "confirmed")
            {
                details["decision"] = "rejected_not_confirmed";
                var rejected = Audit(old.ProviderId, old.ResourceId, old.Id, null, "booking_reschedule_hold_rejected", "Replacement hold rejected because the original booking is not confirmed.", old.Range, "rejected", lifecycleSummary: lifecycle.ReadByBooking(old.ProviderId, old.Id), actor: safeActor, extra: details);
                await store.AppendAudit(rejected, ct);
                return (null, "booking_not_reschedulable", rejected.EventId);
            }

            var requested = Audit(old.ProviderId, old.ResourceId, old.Id, null, "booking_reschedule_requested", "Booking reschedule requested; original booking remains confirmed.", old.Range, "accepted", actor: safeActor, extra: details);
            await store.AppendAudit(requested, ct);

            await ExpireStale(old.ProviderId, resourceId, ct);
            var bookings = await store.GetBookings(old.ProviderId, resourceId, ct);
            if (bookings.Any(b => b.Status == "confirmed" && Overlaps(b.Range, range)))
            {
                details["decision"] = "rejected_slot_conflict";
                var rejected = Audit(old.ProviderId, resourceId, old.Id, null, "booking_reschedule_hold_rejected", "Replacement hold rejected due to confirmed booking conflict.", range, "rejected", "booking", actor: safeActor, extra: details);
                await store.AppendAudit(rejected, ct);
                return (null, "slot_conflict", rejected.EventId);
            }
            var holds = await store.GetActiveHolds(old.ProviderId, resourceId, DateTimeOffset.UtcNow, ct);
            if (holds.Any(h => Overlaps(h.Range, range)))
            {
                details["decision"] = "rejected_hold_conflict";
                var rejected = Audit(old.ProviderId, resourceId, old.Id, null, "booking_reschedule_hold_rejected", "Replacement hold rejected due to active hold conflict.", range, "rejected", "hold", actor: safeActor, extra: details);
                await store.AppendAudit(rejected, ct);
                return (null, "slot_conflict", rejected.EventId);
            }
            var service = await store.GetService(serviceId, ct);
            var paymentPolicy = service?.PaymentPolicy;
            var paymentRequired = paymentPolicy?.RequiresPaymentBeforeConfirmation == true;
            var hold = new Hold(HoldId.New(), old.ProviderId, serviceId, resourceId, range, Token(), null, "active", DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddMinutes(10), null, old.Id, reasonCode, message, safeActor, paymentRequired ? PaymentRequirementStatuses.Required : PaymentRequirementStatuses.NotRequired, paymentPolicy, null, paymentRequired ? DateTimeOffset.UtcNow : null);
            await store.SaveHold(hold, ct);
            var summary = await lifecycle.HoldCreated(hold, null, ct);
            details = RescheduleDetails(old, hold, null, range, resourceId, safeActor, reasonCode, message);
            var audit = Audit(old.ProviderId, resourceId, old.Id, hold.Id, "booking_reschedule_hold_created", "Replacement hold created; original booking remains confirmed.", range, "accepted", lifecycleSummary: summary, actor: safeActor, extra: details);
            await store.AppendAudit(audit, ct);
            if (paymentPolicy is not null) await store.AppendAudit(Audit(old.ProviderId, resourceId, old.Id, hold.Id, "payment_policy_snapshot_recorded", "Payment policy snapshot recorded on replacement hold; payment transfer remains deferred.", range, "accepted", actor: safeActor, extra: PaymentAuditData(hold)), ct);
            if (paymentRequired) await store.AppendAudit(Audit(old.ProviderId, resourceId, old.Id, hold.Id, "payment_required", "Payment is required before replacement confirmation; carry-forward is deferred.", range, "accepted", actor: safeActor, extra: PaymentAuditData(hold)), ct);
            await lifecycle.HoldCreated(hold, audit.EventId, ct);
            return (hold, null, audit.EventId);
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
        var initialOldBooking = hold.ReplacementForBookingId is null ? null : await store.GetBooking(hold.ReplacementForBookingId, ct);
        var gates = OrderedGates(hold.ProviderId, hold.ResourceId, initialOldBooking?.ResourceId);
        foreach (var gateToAcquire in gates) await gateToAcquire.WaitAsync(ct);
        try
        {
            if (hold.ExpiresAt <= DateTimeOffset.UtcNow) { await store.ExpireHold(hold, ct); var expiredConfirmSummary = await lifecycle.Expired(hold, "rejected", null, ct); var expiredConfirmAudit = Audit(hold.ProviderId, hold.ResourceId, null, hold.Id, "hold_expired", "Hold expired before confirmation.", hold.Range, "rejected", lifecycleSummary: expiredConfirmSummary); await store.AppendAudit(expiredConfirmAudit, ct); await lifecycle.Expired(hold, "rejected", expiredConfirmAudit.EventId, ct); return (null, "hold_expired"); }
            var customer = contact ?? hold.CustomerDraft;
            if (customer is null) return (null, "intake_required");
            if (hold.PaymentRequirementStatus == PaymentRequirementStatuses.Required) { await store.AppendAudit(Audit(hold.ProviderId, hold.ResourceId, null, hold.Id, "payment_missing_confirmation_rejected", "Confirmation rejected because required fake/local payment has not been satisfied.", hold.Range, "rejected", extra: PaymentAuditData(hold)), ct); return (null, "payment_required"); }
            await ExpireStale(hold.ProviderId, hold.ResourceId, ct);
            var oldBooking = hold.ReplacementForBookingId is null ? null : await store.GetBooking(hold.ReplacementForBookingId, ct);
            if (hold.ReplacementForBookingId is not null && (oldBooking is null || oldBooking.Status != "confirmed")) { await store.AppendAudit(Audit(hold.ProviderId, hold.ResourceId, oldBooking?.Id, hold.Id, "booking_reschedule_failed", "Replacement confirmation failed because the original booking is no longer confirmed.", hold.Range, "rejected", "original_not_confirmed", actor: hold.RescheduleActor ?? "local-dev"), ct); return (null, "booking_not_reschedulable"); }
            var bookings = await store.GetBookings(hold.ProviderId, hold.ResourceId, ct);
            if (bookings.Any(b => b.Status == "confirmed" && b.Id != hold.ReplacementForBookingId && Overlaps(b.Range, hold.Range))) { await store.AppendAudit(Audit(hold.ProviderId, hold.ResourceId, null, hold.Id, hold.ReplacementForBookingId is null ? "booking_rejected" : "booking_reschedule_failed", "Booking rejected due to confirmed booking conflict.", hold.Range, "rejected", "booking"), ct); return (null, "slot_conflict"); }
            var booking = new Booking(BookingId.New(), hold.ProviderId, hold.ServiceId, hold.ResourceId, customer, hold.Range, "confirmed", "m20-local-policy-payment-snapshot", DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, null, RescheduledFromBookingId: hold.ReplacementForBookingId, ReplacementHoldId: hold.ReplacementForBookingId is null ? null : hold.Id, PaymentRequirementStatus: hold.PaymentRequirementStatus, PaymentPolicySnapshot: hold.PaymentPolicySnapshot, PaymentReference: hold.PaymentReference, PaymentRequiredAt: hold.PaymentRequiredAt, PaymentSatisfiedAt: hold.PaymentSatisfiedAt);
            await store.SaveBooking(booking, ct);
            await store.ExpireHold(hold with { Status = "confirmed" }, ct);
            var summary = await lifecycle.Confirmed(hold, booking, null, ct);
            if (booking.PaymentPolicySnapshot is not null) await store.AppendAudit(Audit(hold.ProviderId, hold.ResourceId, booking.Id, hold.Id, "payment_policy_applied", "Payment policy snapshot applied to confirmed booking.", hold.Range, "accepted", lifecycleSummary: summary, extra: PaymentAuditData(hold)), ct);
            var audit = Audit(hold.ProviderId, hold.ResourceId, booking.Id, hold.Id, "booking_confirmed", "Hold confirmed into booking.", hold.Range, "accepted", lifecycleSummary: summary);
            await store.AppendAudit(audit, ct);
            await lifecycle.Confirmed(hold, booking, audit.EventId, ct);
            if (oldBooking is not null)
            {
                var details = RescheduleDetails(oldBooking, hold, booking, hold.Range, hold.ResourceId, hold.RescheduleActor ?? "local-dev", hold.RescheduleReasonCode ?? "unspecified", hold.RescheduleMessage);
                var rescheduled = oldBooking with { Status = "rescheduled", UpdatedAt = DateTimeOffset.UtcNow, RescheduledAt = DateTimeOffset.UtcNow, RescheduledToBookingId = booking.Id, RescheduleReasonCode = hold.RescheduleReasonCode, RescheduleMessage = hold.RescheduleMessage, RescheduleActor = hold.RescheduleActor, ReplacementHoldId = hold.Id, ReplacementBookingId = booking.Id, CancellationPolicyResult = "accepted_reschedule" };
                await store.SaveBooking(rescheduled, ct);
                var oldSummary = await lifecycle.Rescheduled(rescheduled, null, ct);
                var oldAudit = Audit(rescheduled.ProviderId, rescheduled.ResourceId, rescheduled.Id, hold.Id, "booking_rescheduled", "Original booking rescheduled after replacement booking confirmation.", rescheduled.Range, "accepted", lifecycleSummary: oldSummary, actor: hold.RescheduleActor ?? "local-dev", extra: details);
                await store.AppendAudit(oldAudit, ct);
                oldSummary = await lifecycle.Rescheduled(rescheduled, oldAudit.EventId, ct);
                var newAudit = Audit(booking.ProviderId, booking.ResourceId, booking.Id, hold.Id, "booking_reschedule_confirmed", "Replacement booking confirmed and linked to original booking.", booking.Range, "accepted", lifecycleSummary: summary, actor: hold.RescheduleActor ?? "local-dev", extra: details);
                await store.AppendAudit(newAudit, ct);
                await lifecycle.Confirmed(hold, booking, newAudit.EventId, ct);
            }
            return (booking, null);
        }
        finally { foreach (var gateToRelease in gates.Reverse()) gateToRelease.Release(); }
    }

    public async Task<(Hold? Hold, string? Error, string? AuditEventId)> MarkFakePaymentSatisfied(HoldId holdId, string token, string? actor, CancellationToken ct = default)
    {
        var hold = await store.GetHold(holdId, ct);
        if (hold is null || hold.ClaimToken != token) return (null, "hold_not_found", null);
        if (hold.ExpiresAt <= DateTimeOffset.UtcNow) return (null, "hold_expired", null);
        if (hold.PaymentPolicySnapshot?.PaymentProviderMode != SchedulingPaymentProviderModes.FakeLocal) return (null, "payment_not_supported", null);
        var updated = hold with { PaymentRequirementStatus = PaymentRequirementStatuses.Satisfied, PaymentReference = $"fakepay_{Guid.NewGuid():N}", PaymentSatisfiedAt = DateTimeOffset.UtcNow };
        await store.SaveHold(updated, ct);
        var audit = Audit(updated.ProviderId, updated.ResourceId, null, updated.Id, "payment_satisfied_fake", "Fake/local payment marked satisfied for development and tests only.", updated.Range, "accepted", actor: string.IsNullOrWhiteSpace(actor) ? "local-dev" : actor.Trim(), extra: PaymentAuditData(updated));
        await store.AppendAudit(audit, ct);
        return (updated, null, audit.EventId);
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

    private static IReadOnlyDictionary<string, string> PaymentAuditData(Hold hold) => new Dictionary<string, string>
    {
        ["paymentRequirementStatus"] = hold.PaymentRequirementStatus,
        ["paymentProviderMode"] = hold.PaymentPolicySnapshot?.PaymentProviderMode ?? SchedulingPaymentProviderModes.None,
        ["paymentTiming"] = hold.PaymentPolicySnapshot?.PaymentTiming ?? SchedulingPaymentTimings.None,
        ["currency"] = hold.PaymentPolicySnapshot?.Currency ?? "",
        ["requiresDeposit"] = (hold.PaymentPolicySnapshot?.RequiresDeposit == true).ToString(),
        ["requiresPrepay"] = (hold.PaymentPolicySnapshot?.RequiresPrepay == true).ToString(),
        ["paymentReference"] = hold.PaymentReference ?? ""
    };

    private async Task ExpireStale(ProviderId providerId, ResourceId resourceId, CancellationToken ct)
    {
        foreach (var hold in await store.GetActiveHolds(providerId, resourceId, DateTimeOffset.MinValue, ct))
            if (hold.ExpiresAt <= DateTimeOffset.UtcNow) { await store.ExpireHold(hold, ct); var summary = await lifecycle.Expired(hold, "released", null, ct); var audit = Audit(providerId, resourceId, null, hold.Id, "hold_expired", "Expired stale hold before claim decision.", hold.Range, "released", lifecycleSummary: summary); await store.AppendAudit(audit, ct); await lifecycle.Expired(hold, "released", audit.EventId, ct); }
    }

    private static Dictionary<string, string> RescheduleDetails(Booking old, Hold? hold, Booking? replacement, ZonedTimeRange replacementRange, ResourceId replacementResourceId, string actor, string reason, string? message)
    {
        var details = new Dictionary<string, string>
        {
            ["oldBookingId"] = old.Id.Value,
            ["oldResourceId"] = old.ResourceId.Value,
            ["oldStartsAtUtc"] = old.Range.StartsAtUtc.ToString("O"),
            ["oldEndsAtUtc"] = old.Range.EndsAtUtc.ToString("O"),
            ["newResourceId"] = replacementResourceId.Value,
            ["newStartsAtUtc"] = replacementRange.StartsAtUtc.ToString("O"),
            ["newEndsAtUtc"] = replacementRange.EndsAtUtc.ToString("O"),
            ["actor"] = actor,
            ["reasonCode"] = reason,
            ["hasMessage"] = string.IsNullOrWhiteSpace(message) ? "false" : "true"
        };
        if (hold is not null) details["replacementHoldId"] = hold.Id.Value;
        if (replacement is not null) details["newBookingId"] = replacement.Id.Value;
        return details;
    }

    private IReadOnlyList<SemaphoreSlim> OrderedGates(ProviderId providerId, ResourceId primary, ResourceId? secondary) =>
        new[] { primary, secondary }.Where(r => r is not null).Select(r => r!).Distinct().OrderBy(r => $"{providerId.Value}:{r.Value}", StringComparer.Ordinal).Select(r => locks.For(providerId, r)).ToArray();
}
