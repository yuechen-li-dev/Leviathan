namespace Leviathan.Server.Apps.Scheduling.Domain;

public sealed record ProviderId(string Value) { public override string ToString() => Value; public static ProviderId New() => new($"prov_{Guid.NewGuid():N}"); }
public sealed record ResourceId(string Value) { public override string ToString() => Value; public static ResourceId New() => new($"res_{Guid.NewGuid():N}"); }
public sealed record ServiceId(string Value) { public override string ToString() => Value; public static ServiceId New() => new($"svc_{Guid.NewGuid():N}"); }
public sealed record AvailabilityRuleId(string Value) { public override string ToString() => Value; public static AvailabilityRuleId New() => new($"avail_{Guid.NewGuid():N}"); }
public sealed record HoldId(string Value) { public override string ToString() => Value; public static HoldId New() => new($"hold_{Guid.NewGuid():N}"); }
public sealed record BookingId(string Value) { public override string ToString() => Value; public static BookingId New() => new($"book_{Guid.NewGuid():N}"); }
public sealed record NotificationId(string Value) { public override string ToString() => Value; public static NotificationId New() => new($"ntf_{Guid.NewGuid():N}"); }
