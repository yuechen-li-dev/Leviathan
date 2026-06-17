using Leviathan.Server.Apps.Scheduling.Api;
using Leviathan.Server.Apps.Scheduling.Domain;
using Leviathan.Server.Apps.Scheduling.Storage;

namespace Leviathan.Server.Apps.Scheduling.Engine;

public sealed class SlotGenerator(SchedulingStore store)
{
    public async Task<IReadOnlyList<BookableSlotDto>> Generate(string providerSlug, ServiceId serviceId, DateTimeOffset fromUtc, DateTimeOffset toUtc, string? displayTimeZone, CancellationToken ct = default)
    {
        var provider = await store.GetProviderBySlug(providerSlug, ct) ?? throw new KeyNotFoundException("provider_not_found");
        var service = await store.GetService(serviceId, ct) ?? throw new KeyNotFoundException("service_not_found");
        var resources = (await store.GetResources(provider.Id, ct)).Where(r => r.IsActive && service.AssignedResourceIds.Contains(r.Id)).ToArray();
        var rules = (await store.GetAvailabilityRules(provider.Id, ct)).Where(r => r.IsActive).ToArray();
        var bookings = await store.GetBookings(provider.Id, null, ct);
        var slots = new List<BookableSlotDto>();
        for (var date = DateOnly.FromDateTime(fromUtc.UtcDateTime.Date); date <= DateOnly.FromDateTime(toUtc.UtcDateTime.Date); date = date.AddDays(1))
        foreach (var resource in resources)
        foreach (var rule in rules.Where(r => r.ResourceId == resource.Id && r.DaysOfWeek.Contains(date.DayOfWeek) && (r.EffectiveFrom is null || date >= r.EffectiveFrom) && (r.EffectiveUntil is null || date <= r.EffectiveUntil)))
        {
            var cursor = new DateTimeOffset(date.ToDateTime(rule.LocalStartTime), TimeSpan.Zero);
            var end = new DateTimeOffset(date.ToDateTime(rule.LocalEndTime), TimeSpan.Zero);
            while (cursor.AddMinutes(service.DurationMinutes) <= end)
            {
                var range = new ZonedTimeRange(cursor, cursor.AddMinutes(service.DurationMinutes), rule.TimeZoneId);
                var activeHolds = await store.GetActiveHolds(provider.Id, resource.Id, DateTimeOffset.UtcNow, ct);
                if (range.StartsAtUtc >= fromUtc && range.EndsAtUtc <= toUtc && !bookings.Any(b => b.Status == "confirmed" && b.ResourceId == resource.Id && b.Range.Overlaps(range)) && !activeHolds.Any(h => h.Range.Overlaps(range)))
                    slots.Add(new BookableSlotDto(provider.Id.Value, service.Id.Value, resource.Id.Value, range.StartsAtUtc, range.EndsAtUtc, displayTimeZone ?? rule.TimeZoneId, $"{range.StartsAtUtc:yyyy-MM-dd HH:mm} UTC"));
                cursor = cursor.AddMinutes(service.DurationMinutes + service.BufferAfterMinutes + service.BufferBeforeMinutes);
            }
        }
        return slots.OrderBy(s => s.StartsAtUtc).ToArray();
    }
}
