using Leviathan.Server.Apps.Scheduling.Domain;

namespace Leviathan.Server.Apps.Scheduling.Engine;

public static class SchedulingTimeZone
{
    public static bool TryFind(string timeZoneId, out TimeZoneInfo zone)
    {
        try { zone = TimeZoneInfo.FindSystemTimeZoneById(timeZoneId); return true; }
        catch { zone = TimeZoneInfo.Utc; return false; }
    }

    public static TimeZoneInfo FindOrThrow(string timeZoneId)
    {
        if (TryFind(timeZoneId, out var zone)) return zone;
        throw new ArgumentException($"Invalid IANA timezone id '{timeZoneId}'.", nameof(timeZoneId));
    }

    public static DateTimeOffset ConvertLocalToUtc(DateOnly date, TimeOnly time, TimeZoneInfo zone)
    {
        var local = DateTime.SpecifyKind(date.ToDateTime(time), DateTimeKind.Unspecified);
        if (zone.IsInvalidTime(local)) throw new InvalidOperationException($"Local time {local:O} is nonexistent in {zone.Id}.");
        var offset = zone.IsAmbiguousTime(local) ? zone.GetAmbiguousTimeOffsets(local).Min() : zone.GetUtcOffset(local);
        return new DateTimeOffset(local, offset).ToUniversalTime();
    }

    public static string Label(DateTimeOffset utc, string timeZoneId)
    {
        var zone = FindOrThrow(timeZoneId);
        return TimeZoneInfo.ConvertTime(utc, zone).ToString("yyyy-MM-dd HH:mm zzz") + $" ({timeZoneId})";
    }

    public static (string LocalStart, string LocalEnd) Display(ZonedTimeRange range, string timeZoneId) => (Label(range.StartsAtUtc, timeZoneId), Label(range.EndsAtUtc, timeZoneId));
}
