namespace Leviathan.Server.Apps.Scheduling.Domain;

public sealed record Provider(ProviderId Id, string Slug, string DisplayName, string TimeZoneId, string? ContactEmail, string? PublicDescription, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, string? AccountId = null, string? AppInstallationId = null);
public sealed record BookableResource(ResourceId Id, ProviderId ProviderId, string DisplayName, string ResourceType, string TimeZoneId, string CapacityMode, bool IsActive, DateTimeOffset CreatedAt);
public sealed record SchedulingService(ServiceId Id, ProviderId ProviderId, string Name, string? Description, int DurationMinutes, int BufferBeforeMinutes, int BufferAfterMinutes, IReadOnlyList<ResourceId> AssignedResourceIds, bool IsPublic, DateTimeOffset CreatedAt);
public sealed record AvailabilityRule(AvailabilityRuleId Id, ProviderId ProviderId, ResourceId ResourceId, string TimeZoneId, IReadOnlyList<DayOfWeek> DaysOfWeek, TimeOnly LocalStartTime, TimeOnly LocalEndTime, DateOnly? EffectiveFrom, DateOnly? EffectiveUntil, bool IsActive, DateTimeOffset CreatedAt);
public sealed record BookingPolicy(string PolicyId, ProviderId ProviderId, int HoldTtlMinutes, int MinimumNoticeMinutes, int MaximumAdvanceDays, bool RequiresDeposit, bool RequiresPrepay);
public sealed record CustomerContact(string Name, string Email, string? Phone, string? Notes);
public sealed record ZonedTimeRange(DateTimeOffset StartsAtUtc, DateTimeOffset EndsAtUtc, string TimeZoneId)
{
    public bool Overlaps(ZonedTimeRange other) => StartsAtUtc < other.EndsAtUtc && other.StartsAtUtc < EndsAtUtc;
}
public sealed record Hold(HoldId Id, ProviderId ProviderId, ServiceId ServiceId, ResourceId ResourceId, ZonedTimeRange Range, string ClaimToken, CustomerContact? CustomerDraft, string Status, DateTimeOffset CreatedAt, DateTimeOffset ExpiresAt, DateTimeOffset? IntakeSubmittedAt);
public sealed record Booking(BookingId Id, ProviderId ProviderId, ServiceId ServiceId, ResourceId ResourceId, CustomerContact Customer, ZonedTimeRange Range, string Status, string PolicySnapshot, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, DateTimeOffset ConfirmedAt, DateTimeOffset? CancelledAt, string? CancellationReasonCode = null, string? CancellationMessage = null, string? CancellationActor = null, string? CancellationPolicyResult = null);
public sealed record BookingAuditEvent(string EventId, ProviderId ProviderId, ResourceId? ResourceId, BookingId? BookingId, HoldId? HoldId, string EventType, DateTimeOffset OccurredAt, string Actor, string CorrelationId, string Message, IReadOnlyDictionary<string, string> Data);
