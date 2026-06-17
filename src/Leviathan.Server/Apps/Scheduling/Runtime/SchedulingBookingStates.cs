namespace Leviathan.Server.Apps.Scheduling.Runtime;

public static class SchedulingBookingStates
{
    public const string Start = "Start";
    public const string HoldCreated = "HoldCreated";
    public const string AwaitingIntake = "AwaitingIntake";
    public const string IntakeSubmitted = "IntakeSubmitted";
    public const string PaymentRequired = "PaymentRequired";
    public const string PaymentSatisfied = "PaymentSatisfied";
    public const string PaymentFailed = "PaymentFailed";
    public const string Confirmed = "Confirmed";
    public const string Expired = "Expired";
    public const string Cancelled = "Cancelled";
    public const string Rescheduled = "Rescheduled";
    public const string Completed = "Completed";
    public const string NoShow = "NoShow";
    public const string Failed = "Failed";
}
