namespace Leviathan.Server.Platform.Storage;

public sealed record LeviathanObjectKey
{
    public string Value { get; }
    public LeviathanObjectKey(string value)
    {
        Value = Normalize(value);
    }
    public override string ToString() => Value;
    public LeviathanObjectKey Child(params string[] parts) => new(string.Join('/', new[] { Value }.Concat(parts)));
    public static LeviathanObjectKey FromParts(params string[] parts) => new(string.Join('/', parts));
    public static LeviathanObjectKey AppSession(string persistenceScope, string sessionId, string fileName) => FromParts(ScopeParts(persistenceScope).Concat(["sessions", sessionId, fileName]).ToArray());
    public static LeviathanObjectKey SchedulingHoldLifecycle(string providerId, string bucket, string holdId, string fileName) => FromParts("scheduling", "providers", SafeSegment(providerId), "holds", SafeSegment(bucket), SafeSegment(holdId), fileName);
    public static LeviathanObjectKey SchedulingBookingLifecycle(string providerId, string bookingId, string fileName) => FromParts("scheduling", "providers", SafeSegment(providerId), "bookings", SafeSegment(bookingId), fileName);
    public static LeviathanObjectKey CapabilityAudit(string accountId, DateTimeOffset occurredAt) => FromParts("platform", "accounts", SafeSegment(accountId), "audit", $"capability-events-{occurredAt:yyyy-MM}.jsonl");

    public static string[] ScopeParts(string persistenceScope) => Normalize(persistenceScope).Split('/');
    public static string SafeSegment(string value) => string.Concat(value.Where(ch => char.IsLetterOrDigit(ch) || ch is '_' or '-' or '.'));

    public static string Normalize(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) throw new ArgumentException("Object key cannot be empty.", nameof(value));
        var normalized = value.Replace('\\', '/').Trim('/');
        if (normalized.Length == 0) throw new ArgumentException("Object key cannot be empty.", nameof(value));
        var parts = normalized.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Any(p => p is "." or ".." || p.Contains('\0'))) throw new ArgumentException($"Invalid object key '{value}'.", nameof(value));
        return string.Join('/', parts);
    }
}
