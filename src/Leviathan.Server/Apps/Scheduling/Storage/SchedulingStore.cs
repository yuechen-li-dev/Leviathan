using Leviathan.Server.Apps.Scheduling.Domain;

namespace Leviathan.Server.Apps.Scheduling.Storage;

public interface SchedulingStore
{
    Task SaveProvider(Provider provider, CancellationToken ct = default);
    Task<Provider?> GetProvider(ProviderId id, CancellationToken ct = default);
    Task<Provider?> GetProviderBySlug(string slug, CancellationToken ct = default);
    Task<IReadOnlyList<Provider>> GetProviders(CancellationToken ct = default);
    Task SaveResource(BookableResource resource, CancellationToken ct = default);
    Task<IReadOnlyList<BookableResource>> GetResources(ProviderId providerId, CancellationToken ct = default);
    Task SaveService(SchedulingService service, CancellationToken ct = default);
    Task<SchedulingService?> GetService(ServiceId id, CancellationToken ct = default);
    Task<IReadOnlyList<SchedulingService>> GetServices(ProviderId providerId, CancellationToken ct = default);
    Task SaveAvailabilityRule(AvailabilityRule rule, CancellationToken ct = default);
    Task<IReadOnlyList<AvailabilityRule>> GetAvailabilityRules(ProviderId providerId, CancellationToken ct = default);
    Task SaveHold(Hold hold, CancellationToken ct = default);
    Task<Hold?> GetHold(HoldId id, CancellationToken ct = default);
    Task<IReadOnlyList<Hold>> GetActiveHolds(ProviderId providerId, ResourceId resourceId, DateTimeOffset now, CancellationToken ct = default);
    Task ExpireHold(Hold hold, CancellationToken ct = default);
    Task SaveBooking(Booking booking, CancellationToken ct = default);
    Task<Booking?> GetBooking(BookingId id, CancellationToken ct = default);
    Task<IReadOnlyList<Booking>> GetBookings(ProviderId providerId, ResourceId? resourceId = null, CancellationToken ct = default);
    Task AppendAudit(BookingAuditEvent evt, CancellationToken ct = default);
    Task<IReadOnlyList<BookingAuditEvent>> GetBookingAudit(ProviderId providerId, BookingId bookingId, CancellationToken ct = default);
}
