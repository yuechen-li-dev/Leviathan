using Leviathan.Server.Apps.Scheduling.Domain;
using Leviathan.Server.Apps.Scheduling.Runtime;

namespace Leviathan.Server.Apps.Scheduling.Api;

public sealed record CreateProviderRequest(string Slug, string DisplayName, string TimeZoneId, string? ContactEmail, string? PublicDescription);
public sealed record CreateResourceRequest(string ProviderId, string DisplayName, string ResourceType, string? TimeZoneId);
public sealed record CreateServiceRequest(string ProviderId, string Name, string? Description, int DurationMinutes, int BufferBeforeMinutes = 0, int BufferAfterMinutes = 0, bool IsPublic = true, SchedulingPaymentPolicy? PaymentPolicy = null);
public sealed record AssignResourceRequest(string ProviderId, string ResourceId);
public sealed record CreateAvailabilityRuleRequest(string ProviderId, string ResourceId, string TimeZoneId, DayOfWeek[] DaysOfWeek, string LocalStartTime, string LocalEndTime, DateOnly? EffectiveFrom, DateOnly? EffectiveUntil);
public sealed record BookableSlotDto(string ProviderId, string ServiceId, string ResourceId, DateTimeOffset StartsAtUtc, DateTimeOffset EndsAtUtc, string TimeZoneId, string DisplayLabel, string ProviderTimeZoneId, string DisplayTimeZoneId, string DisplayStartsAtLocal, string DisplayEndsAtLocal);
public sealed record CreateHoldRequest(string ProviderId, string ServiceId, string ResourceId, DateTimeOffset StartsAtUtc, DateTimeOffset EndsAtUtc, string TimeZoneId);
public sealed record HoldResponse(string HoldId, string ClaimToken, DateTimeOffset ExpiresAt, string Status, string PaymentRequirementStatus, SchedulingPaymentPolicy? PaymentPolicySnapshot, string? PaymentReference, DateTimeOffset? PaymentRequiredAt, DateTimeOffset? PaymentSatisfiedAt);
public sealed record SubmitIntakeRequest(string ClaimToken, string Name, string Email, string? Phone, string? Notes);
public sealed record ConfirmBookingRequest(string HoldId, string ClaimToken, CustomerContact? Customer);
public sealed record CancelBookingRequest(string Reason, string? Message, string? Actor);
public sealed record CancelBookingResponse(Booking Booking, string AuditEventId, SchedulingLifecycleSummary Lifecycle);
public sealed record CreateReplacementHoldRequest(string ServiceId, string ResourceId, DateTimeOffset StartUtc, DateTimeOffset EndUtc, string TimeZoneId, string? DisplayTimeZoneId, string Reason, string? Message, string? Actor);
public sealed record ReplacementHoldResponse(string OldBookingId, string ReplacementHoldId, string ClaimToken, BookableSlotDto TargetSlot, string? AuditEventId, SchedulingLifecycleSummary? Lifecycle);
public sealed record SchedulingError(string Error, string Message);
public sealed record FakeSatisfyPaymentRequest(string ClaimToken, string? Actor);
public sealed record FakeSatisfyPaymentResponse(string HoldId, string PaymentRequirementStatus, string PaymentReference, DateTimeOffset PaymentSatisfiedAt, string AuditEventId);
public sealed record IcsBookingDto(string Content);
