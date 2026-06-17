namespace Leviathan.Server.Apps.Scheduling.Runtime;

public sealed record SchedulingBookingCheckpoint(
    int Version,
    string ProviderId,
    string ResourceId,
    string ServiceId,
    string HoldId,
    string? BookingId,
    string ClaimTokenRef,
    DateTimeOffset StartsAtUtc,
    DateTimeOffset EndsAtUtc,
    string TimeZoneId,
    string Status,
    string WorkflowState,
    bool IntakeSubmitted,
    string LastDecisionCode,
    string? LastAuditEventId,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset ExpiresAt);

public sealed record SchedulingLifecycleSummary(
    string Status,
    string ProviderId,
    string ResourceId,
    string ServiceId,
    string HoldId,
    string? BookingId,
    string CurrentWorkflowState,
    bool HasCheckpoint,
    string? CheckpointPath,
    string? LastAuditEventId,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset ExpiresAt);
