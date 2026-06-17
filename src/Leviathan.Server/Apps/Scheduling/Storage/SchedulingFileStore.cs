using System.Text.Json;
using Leviathan.Server.Apps.Scheduling.Domain;

namespace Leviathan.Server.Apps.Scheduling.Storage;

public sealed class SchedulingPersistenceException(string message, Exception? inner = null) : Exception(message, inner);

public sealed class SchedulingFileStore(IConfiguration config) : SchedulingStore
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private static readonly JsonSerializerOptions JsonLine = new(JsonSerializerDefaults.Web);
    private readonly string _root = Path.Combine(config["LEVIATHAN_DATA_DIR"] ?? Environment.GetEnvironmentVariable("LEVIATHAN_DATA_DIR") ?? Path.Combine(AppContext.BaseDirectory, "data"), "scheduling", "providers");
    private static string Safe(string value) => string.Concat(value.Where(ch => char.IsLetterOrDigit(ch) || ch is '_' or '-'));
    private string ProviderDir(ProviderId id) => Path.Combine(_root, Safe(id.Value));

    private static async Task Write<T>(string path, T value, CancellationToken ct)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var tmp = path + "." + Guid.NewGuid().ToString("n") + ".tmp";
        try
        {
            await File.WriteAllTextAsync(tmp, JsonSerializer.Serialize(value, Json), ct);
            File.Move(tmp, path, overwrite: true);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException)
        {
            try { if (File.Exists(tmp)) File.Delete(tmp); } catch { }
            throw new SchedulingPersistenceException($"Could not write scheduling file '{path}'.", ex);
        }
    }

    private static async Task<T?> Read<T>(string path, CancellationToken ct)
    {
        if (!File.Exists(path)) return default;
        try { return JsonSerializer.Deserialize<T>(await File.ReadAllTextAsync(path, ct), Json); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException)
        { throw new SchedulingPersistenceException($"Could not read scheduling file '{path}'.", ex); }
    }

    private static async Task<IReadOnlyList<T>> ReadAll<T>(string dir, string pattern, CancellationToken ct)
    {
        if (!Directory.Exists(dir)) return [];
        var values = new List<T>();
        foreach (var file in Directory.EnumerateFiles(dir, pattern, SearchOption.AllDirectories)) { var value = await Read<T>(file, ct); if (value is not null) values.Add(value); }
        return values;
    }
    public Task SaveProvider(Provider provider, CancellationToken ct = default) => Write(Path.Combine(ProviderDir(provider.Id), "provider.json"), provider, ct);
    public Task<Provider?> GetProvider(ProviderId id, CancellationToken ct = default) => Read<Provider>(Path.Combine(ProviderDir(id), "provider.json"), ct);
    public async Task<Provider?> GetProviderBySlug(string slug, CancellationToken ct = default)
    { if (!Directory.Exists(_root)) return null; foreach (var p in await GetProviders(ct)) { if (p.Slug == slug) return p; } return null; }
    public async Task<IReadOnlyList<Provider>> GetProviders(CancellationToken ct = default)
    { if (!Directory.Exists(_root)) return []; var providers = new List<Provider>(); foreach (var file in Directory.EnumerateFiles(_root, "provider.json", SearchOption.AllDirectories)) { var p = await Read<Provider>(file, ct); if (p is not null) providers.Add(p); } return providers; }
    public Task SaveResource(BookableResource resource, CancellationToken ct = default) => Write(Path.Combine(ProviderDir(resource.ProviderId), "resources", resource.Id.Value + ".json"), resource, ct);
    public Task<IReadOnlyList<BookableResource>> GetResources(ProviderId providerId, CancellationToken ct = default) => ReadAll<BookableResource>(Path.Combine(ProviderDir(providerId), "resources"), "*.json", ct);
    public Task SaveService(SchedulingService service, CancellationToken ct = default) => Write(Path.Combine(ProviderDir(service.ProviderId), "services", service.Id.Value + ".json"), service, ct);
    public async Task<SchedulingService?> GetService(ServiceId id, CancellationToken ct = default)
    { if (!Directory.Exists(_root)) return null; foreach (var file in Directory.EnumerateFiles(_root, id.Value + ".json", SearchOption.AllDirectories)) return await Read<SchedulingService>(file, ct); return null; }
    public Task<IReadOnlyList<SchedulingService>> GetServices(ProviderId providerId, CancellationToken ct = default) => ReadAll<SchedulingService>(Path.Combine(ProviderDir(providerId), "services"), "*.json", ct);
    public Task SaveAvailabilityRule(AvailabilityRule rule, CancellationToken ct = default) => Write(Path.Combine(ProviderDir(rule.ProviderId), "availability-rules", rule.Id.Value + ".json"), rule, ct);
    public Task<IReadOnlyList<AvailabilityRule>> GetAvailabilityRules(ProviderId providerId, CancellationToken ct = default) => ReadAll<AvailabilityRule>(Path.Combine(ProviderDir(providerId), "availability-rules"), "*.json", ct);
    public Task SaveHold(Hold hold, CancellationToken ct = default) => Write(Path.Combine(ProviderDir(hold.ProviderId), "holds", "active", hold.Id.Value + ".json"), hold, ct);
    public async Task<Hold?> GetHold(HoldId id, CancellationToken ct = default) { if (!Directory.Exists(_root)) return null; foreach (var file in Directory.EnumerateFiles(_root, id.Value + ".json", SearchOption.AllDirectories)) return await Read<Hold>(file, ct); return null; }
    public async Task<IReadOnlyList<Hold>> GetActiveHolds(ProviderId providerId, ResourceId resourceId, DateTimeOffset now, CancellationToken ct = default)
    {
        var dir = Path.Combine(ProviderDir(providerId), "holds", "active");
        if (!Directory.Exists(dir)) return [];
        var values = new List<Hold>();
        foreach (var file in Directory.EnumerateFiles(dir, "*.json", SearchOption.TopDirectoryOnly)) { var value = await Read<Hold>(file, ct); if (value is not null) values.Add(value); }
        return values.Where(h => h.ResourceId == resourceId && h.Status == "active" && h.ExpiresAt > now).ToArray();
    }
    public async Task ExpireHold(Hold hold, CancellationToken ct = default) { var expired = hold with { Status = hold.Status == "active" ? "expired" : hold.Status }; var from = Path.Combine(ProviderDir(hold.ProviderId), "holds", "active", hold.Id.Value + ".json"); var to = Path.Combine(ProviderDir(hold.ProviderId), "holds", expired.Status == "expired" ? "expired" : "consumed", hold.Id.Value + ".json"); await Write(to, expired, ct); if (File.Exists(from)) File.Delete(from); }
    public Task SaveBooking(Booking booking, CancellationToken ct = default) => Write(Path.Combine(ProviderDir(booking.ProviderId), "bookings", booking.Id.Value, "booking.json"), booking, ct);
    public async Task<Booking?> GetBooking(BookingId id, CancellationToken ct = default) { if (!Directory.Exists(_root)) return null; foreach (var file in Directory.EnumerateFiles(_root, "booking.json", SearchOption.AllDirectories)) { var b = await Read<Booking>(file, ct); if (b?.Id == id) return b; } return null; }
    public async Task<IReadOnlyList<Booking>> GetBookings(ProviderId providerId, ResourceId? resourceId = null, CancellationToken ct = default) => (await ReadAll<Booking>(Path.Combine(ProviderDir(providerId), "bookings"), "booking.json", ct)).Where(b => resourceId is null || b.ResourceId == resourceId).ToArray();
    public async Task AppendAudit(BookingAuditEvent evt, CancellationToken ct = default) { var line = JsonSerializer.Serialize(evt, JsonLine); var month = evt.OccurredAt.ToString("yyyy-MM"); var paths = new[] { Path.Combine(ProviderDir(evt.ProviderId), "audit", $"events-{month}.jsonl") }.Concat(evt.BookingId is null ? [] : [Path.Combine(ProviderDir(evt.ProviderId), "bookings", evt.BookingId.Value, "audit.jsonl")]); foreach (var p in paths) { try { Directory.CreateDirectory(Path.GetDirectoryName(p)!); await File.AppendAllTextAsync(p, line + Environment.NewLine, ct); } catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { throw new SchedulingPersistenceException($"Could not append scheduling audit '{p}'.", ex); } } }
    public async Task<IReadOnlyList<BookingAuditEvent>> GetBookingAudit(ProviderId providerId, BookingId bookingId, CancellationToken ct = default) { var p = Path.Combine(ProviderDir(providerId), "bookings", bookingId.Value, "audit.jsonl"); if (!File.Exists(p)) return []; try { return (await File.ReadAllLinesAsync(p, ct)).Where(l => !string.IsNullOrWhiteSpace(l)).Select(l => JsonSerializer.Deserialize<BookingAuditEvent>(l, JsonLine)!).ToArray(); } catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException) { throw new SchedulingPersistenceException($"Could not read scheduling audit '{p}'.", ex); } }
}
