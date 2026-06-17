using Dominatus.Core.Blackboard;

namespace Leviathan.Server.Apps.Scheduling.Runtime;

public static class SchedulingBookingKeys
{
    public static readonly BbKey<string> ProviderId = new("Scheduling.Booking.ProviderId");
    public static readonly BbKey<string> ResourceId = new("Scheduling.Booking.ResourceId");
    public static readonly BbKey<string> ServiceId = new("Scheduling.Booking.ServiceId");
    public static readonly BbKey<string> HoldId = new("Scheduling.Booking.HoldId");
    public static readonly BbKey<string> BookingId = new("Scheduling.Booking.BookingId");
    public static readonly BbKey<string> ClaimTokenRef = new("Scheduling.Booking.ClaimTokenRef");
    public static readonly BbKey<string> StartsAtUtc = new("Scheduling.Booking.StartsAtUtc");
    public static readonly BbKey<string> EndsAtUtc = new("Scheduling.Booking.EndsAtUtc");
    public static readonly BbKey<string> TimeZoneId = new("Scheduling.Booking.TimeZoneId");
    public static readonly BbKey<string> Status = new("Scheduling.Booking.Status");
    public static readonly BbKey<bool> IntakeSubmitted = new("Scheduling.Booking.IntakeSubmitted");
    public static readonly BbKey<string> WorkflowState = new("Scheduling.Booking.WorkflowState");
    public static readonly BbKey<string> LastDecisionCode = new("Scheduling.Booking.LastDecisionCode");
    public static readonly BbKey<string> LastAuditEventId = new("Scheduling.Booking.LastAuditEventId");
    public static readonly BbKey<string> CreatedAt = new("Scheduling.Booking.CreatedAt");
    public static readonly BbKey<string> UpdatedAt = new("Scheduling.Booking.UpdatedAt");
    public static readonly BbKey<string> ExpiresAt = new("Scheduling.Booking.ExpiresAt");
    public static readonly BbKey<string> PaymentRequirementStatus = new("Scheduling.Booking.PaymentRequirementStatus");
    public static readonly BbKey<string> PaymentReference = new("Scheduling.Booking.PaymentReference");
}
