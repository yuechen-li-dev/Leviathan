namespace Leviathan.Server.Apps.Scheduling.Domain;

public sealed record Provider(ProviderId Id, string Slug, string DisplayName, string TimeZoneId, string? ContactEmail, string? PublicDescription, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, string? AccountId = null, string? AppInstallationId = null);
public sealed record BookableResource(ResourceId Id, ProviderId ProviderId, string DisplayName, string ResourceType, string TimeZoneId, string CapacityMode, bool IsActive, DateTimeOffset CreatedAt);
public sealed record SchedulingService(ServiceId Id, ProviderId ProviderId, string Name, string? Description, int DurationMinutes, int BufferBeforeMinutes, int BufferAfterMinutes, IReadOnlyList<ResourceId> AssignedResourceIds, bool IsPublic, DateTimeOffset CreatedAt, SchedulingPaymentPolicy? PaymentPolicy = null);
public sealed record AvailabilityRule(AvailabilityRuleId Id, ProviderId ProviderId, ResourceId ResourceId, string TimeZoneId, IReadOnlyList<DayOfWeek> DaysOfWeek, TimeOnly LocalStartTime, TimeOnly LocalEndTime, DateOnly? EffectiveFrom, DateOnly? EffectiveUntil, bool IsActive, DateTimeOffset CreatedAt);
public sealed record BookingPolicy(string PolicyId, ProviderId ProviderId, int HoldTtlMinutes, int MinimumNoticeMinutes, int MaximumAdvanceDays, bool RequiresDeposit, bool RequiresPrepay, SchedulingPaymentPolicy? PaymentPolicy = null);
public sealed record MoneyAmount(long MinorUnits, string Currency)
{
    public bool IsPositive => MinorUnits > 0 && Currency.Length == 3 && Currency.All(char.IsLetter);
    public string NormalizedCurrency => Currency.ToUpperInvariant();
}
public sealed record SchedulingPaymentPolicy(bool RequiresDeposit, bool RequiresPrepay, MoneyAmount? DepositAmount, MoneyAmount? PrepayAmount, string Currency, string PaymentTiming, string PaymentProviderMode, string CancellationPaymentPolicy, string ReschedulePaymentPolicy)
{
    public static SchedulingPaymentPolicy None(string currency = "USD") => new(false, false, null, null, currency.ToUpperInvariant(), SchedulingPaymentTimings.None, SchedulingPaymentProviderModes.None, SchedulingCancellationPaymentPolicies.NoRefundPolicyYet, SchedulingReschedulePaymentPolicies.NoPaymentTransferYet);
    public bool RequiresPaymentBeforeConfirmation => (RequiresDeposit || RequiresPrepay) && PaymentTiming is SchedulingPaymentTimings.BeforeConfirmation or SchedulingPaymentTimings.AfterHoldBeforeConfirmation;
}
public static class SchedulingPaymentTimings
{
    public const string None = "none";
    public const string BeforeConfirmation = "before_confirmation";
    public const string AfterHoldBeforeConfirmation = "after_hold_before_confirmation";
    public const string ManualOffline = "manual_offline";
}
public static class SchedulingPaymentProviderModes
{
    public const string None = "none";
    public const string FakeLocal = "fake/local";
    public const string ExternalDeferred = "external_deferred";
}
public static class SchedulingCancellationPaymentPolicies
{
    public const string NoRefundPolicyYet = "no_refund_policy_yet";
    public const string RefundDeferred = "refund_deferred";
}
public static class SchedulingReschedulePaymentPolicies
{
    public const string CarryPaymentForwardDeferred = "carry_payment_forward_deferred";
    public const string NoPaymentTransferYet = "no_payment_transfer_yet";
}
public static class PaymentRequirementStatuses
{
    public const string NotRequired = "not_required";
    public const string Required = "required";
    public const string Satisfied = "satisfied";
    public const string Waived = "waived";
    public const string FailedDeferred = "failed/deferred";
}
public sealed record CustomerContact(string Name, string Email, string? Phone, string? Notes);
public sealed record ZonedTimeRange(DateTimeOffset StartsAtUtc, DateTimeOffset EndsAtUtc, string TimeZoneId)
{
    public bool Overlaps(ZonedTimeRange other) => StartsAtUtc < other.EndsAtUtc && other.StartsAtUtc < EndsAtUtc;
}
public sealed record Hold(HoldId Id, ProviderId ProviderId, ServiceId ServiceId, ResourceId ResourceId, ZonedTimeRange Range, string ClaimToken, CustomerContact? CustomerDraft, string Status, DateTimeOffset CreatedAt, DateTimeOffset ExpiresAt, DateTimeOffset? IntakeSubmittedAt, BookingId? ReplacementForBookingId = null, string? RescheduleReasonCode = null, string? RescheduleMessage = null, string? RescheduleActor = null, string PaymentRequirementStatus = PaymentRequirementStatuses.NotRequired, SchedulingPaymentPolicy? PaymentPolicySnapshot = null, string? PaymentReference = null, DateTimeOffset? PaymentRequiredAt = null, DateTimeOffset? PaymentSatisfiedAt = null);
public sealed record Booking(BookingId Id, ProviderId ProviderId, ServiceId ServiceId, ResourceId ResourceId, CustomerContact Customer, ZonedTimeRange Range, string Status, string PolicySnapshot, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, DateTimeOffset ConfirmedAt, DateTimeOffset? CancelledAt, string? CancellationReasonCode = null, string? CancellationMessage = null, string? CancellationActor = null, string? CancellationPolicyResult = null, BookingId? RescheduledFromBookingId = null, BookingId? RescheduledToBookingId = null, DateTimeOffset? RescheduledAt = null, string? RescheduleReasonCode = null, string? RescheduleMessage = null, string? RescheduleActor = null, HoldId? ReplacementHoldId = null, BookingId? ReplacementBookingId = null, string PaymentRequirementStatus = PaymentRequirementStatuses.NotRequired, SchedulingPaymentPolicy? PaymentPolicySnapshot = null, string? PaymentReference = null, DateTimeOffset? PaymentRequiredAt = null, DateTimeOffset? PaymentSatisfiedAt = null);
public sealed record BookingAuditEvent(string EventId, ProviderId ProviderId, ResourceId? ResourceId, BookingId? BookingId, HoldId? HoldId, string EventType, DateTimeOffset OccurredAt, string Actor, string CorrelationId, string Message, IReadOnlyDictionary<string, string> Data);
