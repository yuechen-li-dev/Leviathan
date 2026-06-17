using System.Security.Cryptography;
using System.Text.Json;
using Dominatus.Core.Persistence;
using Dominatus.Core.Runtime;
using Leviathan.Server.Apps.Scheduling.Domain;

namespace Leviathan.Server.Apps.Scheduling.Runtime;

public sealed class SchedulingBookingRuntime
{
    private const string CheckpointFile = "lifecycle.dom1";
    private const string ManifestFile = "lifecycle-manifest.json";
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private readonly string _providersRoot;

    public SchedulingBookingRuntime(IConfiguration config, IWebHostEnvironment environment)
    {
        var configured = config["LEVIATHAN_DATA_DIR"] ?? Environment.GetEnvironmentVariable("LEVIATHAN_DATA_DIR");
        var root = Path.GetFullPath(string.IsNullOrWhiteSpace(configured) ? Path.Combine(environment.ContentRootPath, "data") : configured);
        _providersRoot = Path.Combine(root, "scheduling", "providers");
    }

    public async Task<SchedulingLifecycleSummary> HoldCreated(Hold hold, string? lastAuditEventId, CancellationToken ct = default) =>
        await Save(ToCheckpoint(hold, SchedulingBookingStates.AwaitingIntake, "accepted", lastAuditEventId), ct);

    public async Task<SchedulingLifecycleSummary> IntakeSubmitted(Hold hold, string? lastAuditEventId, CancellationToken ct = default) =>
        await Save(ToCheckpoint(hold, SchedulingBookingStates.IntakeSubmitted, "accepted", lastAuditEventId), ct);

    public async Task<SchedulingLifecycleSummary> Confirmed(Hold hold, Booking booking, string? lastAuditEventId, CancellationToken ct = default) =>
        await Save(new SchedulingBookingCheckpoint(1, hold.ProviderId.Value, hold.ResourceId.Value, hold.ServiceId.Value, hold.Id.Value, booking.Id.Value, TokenRef(hold.ClaimToken), hold.Range.StartsAtUtc, hold.Range.EndsAtUtc, hold.Range.TimeZoneId, booking.Status, SchedulingBookingStates.Confirmed, true, "accepted", lastAuditEventId, hold.CreatedAt, booking.UpdatedAt, hold.ExpiresAt), ct);

    public async Task<SchedulingLifecycleSummary> Expired(Hold hold, string decision, string? lastAuditEventId, CancellationToken ct = default) =>
        await Save(ToCheckpoint(hold with { Status = "expired" }, SchedulingBookingStates.Expired, decision, lastAuditEventId), ct);

    public async Task<SchedulingLifecycleSummary> Cancelled(Booking booking, string? lastAuditEventId, CancellationToken ct = default) =>
        await Save(new SchedulingBookingCheckpoint(1, booking.ProviderId.Value, booking.ResourceId.Value, booking.ServiceId.Value, string.Empty, booking.Id.Value, string.Empty, booking.Range.StartsAtUtc, booking.Range.EndsAtUtc, booking.Range.TimeZoneId, booking.Status, SchedulingBookingStates.Cancelled, true, booking.CancellationPolicyResult ?? "accepted_confirmed_booking", lastAuditEventId, booking.CreatedAt, booking.UpdatedAt, booking.CancelledAt ?? booking.UpdatedAt), ct);

    public SchedulingLifecycleSummary? ReadByHold(ProviderId providerId, HoldId holdId)
    {
        var active = Path.Combine(HoldDir(providerId, "active", holdId), CheckpointFile);
        var expired = Path.Combine(HoldDir(providerId, "expired", holdId), CheckpointFile);
        var consumed = Path.Combine(HoldDir(providerId, "consumed", holdId), CheckpointFile);
        return ReadFirst(expired, consumed, active);
    }

    public SchedulingLifecycleSummary? ReadByBooking(ProviderId providerId, BookingId bookingId) =>
        ReadFirst(Path.Combine(BookingDir(providerId, bookingId), CheckpointFile));

    public static IReadOnlyDictionary<string, string> AuditData(SchedulingLifecycleSummary summary) => new Dictionary<string, string>
    {
        ["lifecycleState"] = summary.CurrentWorkflowState,
        ["lifecycleStatus"] = summary.Status,
        ["lifecycleCheckpoint"] = summary.CheckpointPath ?? string.Empty
    };

    private async Task<SchedulingLifecycleSummary> Save(SchedulingBookingCheckpoint checkpoint, CancellationToken ct)
    {
        var dir = checkpoint.BookingId is null
            ? HoldDir(new(checkpoint.ProviderId), checkpoint.WorkflowState == SchedulingBookingStates.Expired ? "expired" : "active", new(checkpoint.HoldId))
            : BookingDir(new(checkpoint.ProviderId), new(checkpoint.BookingId));
        Directory.CreateDirectory(dir);
        var path = Path.Combine(dir, CheckpointFile);

        var world = new AiWorld();
        world.Bb.Set(SchedulingBookingKeys.ProviderId, checkpoint.ProviderId);
        world.Bb.Set(SchedulingBookingKeys.ResourceId, checkpoint.ResourceId);
        world.Bb.Set(SchedulingBookingKeys.ServiceId, checkpoint.ServiceId);
        world.Bb.Set(SchedulingBookingKeys.HoldId, checkpoint.HoldId);
        if (checkpoint.BookingId is not null) world.Bb.Set(SchedulingBookingKeys.BookingId, checkpoint.BookingId);
        world.Bb.Set(SchedulingBookingKeys.ClaimTokenRef, checkpoint.ClaimTokenRef);
        world.Bb.Set(SchedulingBookingKeys.StartsAtUtc, checkpoint.StartsAtUtc.ToString("O"));
        world.Bb.Set(SchedulingBookingKeys.EndsAtUtc, checkpoint.EndsAtUtc.ToString("O"));
        world.Bb.Set(SchedulingBookingKeys.TimeZoneId, checkpoint.TimeZoneId);
        world.Bb.Set(SchedulingBookingKeys.Status, checkpoint.Status);
        world.Bb.Set(SchedulingBookingKeys.WorkflowState, checkpoint.WorkflowState);
        world.Bb.Set(SchedulingBookingKeys.IntakeSubmitted, checkpoint.IntakeSubmitted);
        world.Bb.Set(SchedulingBookingKeys.LastDecisionCode, checkpoint.LastDecisionCode);
        if (checkpoint.LastAuditEventId is not null) world.Bb.Set(SchedulingBookingKeys.LastAuditEventId, checkpoint.LastAuditEventId);
        world.Bb.Set(SchedulingBookingKeys.CreatedAt, checkpoint.CreatedAt.ToString("O"));
        world.Bb.Set(SchedulingBookingKeys.UpdatedAt, checkpoint.UpdatedAt.ToString("O"));
        world.Bb.Set(SchedulingBookingKeys.ExpiresAt, checkpoint.ExpiresAt.ToString("O"));

        SaveFile.Write(path, DominatusSave.CreateCheckpointChunks(DominatusCheckpointBuilder.Capture(world), extra: new SchedulingLifecycleChunkContributor(checkpoint)));
        await File.WriteAllTextAsync(Path.Combine(dir, ManifestFile), JsonSerializer.Serialize(ToSummary(checkpoint, path), Json), ct);
        return ToSummary(checkpoint, path);
    }

    private SchedulingLifecycleSummary? ReadFirst(params string[] paths)
    {
        foreach (var path in paths)
        {
            if (!File.Exists(path)) continue;
            var contributor = new SchedulingLifecycleChunkContributor();
            DominatusSave.ReadCheckpointChunks(SaveFile.Read(path), contributor);
            if (contributor.Read is { } checkpoint) return ToSummary(checkpoint, path);
        }
        return null;
    }

    private static SchedulingBookingCheckpoint ToCheckpoint(Hold hold, string state, string decision, string? auditId) =>
        new(1, hold.ProviderId.Value, hold.ResourceId.Value, hold.ServiceId.Value, hold.Id.Value, null, TokenRef(hold.ClaimToken), hold.Range.StartsAtUtc, hold.Range.EndsAtUtc, hold.Range.TimeZoneId, hold.Status, state, hold.IntakeSubmittedAt is not null, decision, auditId, hold.CreatedAt, DateTimeOffset.UtcNow, hold.ExpiresAt);

    private static SchedulingLifecycleSummary ToSummary(SchedulingBookingCheckpoint c, string path) =>
        new(c.Status, c.ProviderId, c.ResourceId, c.ServiceId, c.HoldId, c.BookingId, c.WorkflowState, File.Exists(path), path, c.LastAuditEventId, c.CreatedAt, c.UpdatedAt, c.ExpiresAt);

    private string HoldDir(ProviderId providerId, string bucket, HoldId holdId) => Path.Combine(_providersRoot, Safe(providerId.Value), "holds", bucket, Safe(holdId.Value));
    private string BookingDir(ProviderId providerId, BookingId bookingId) => Path.Combine(_providersRoot, Safe(providerId.Value), "bookings", Safe(bookingId.Value));
    private static string Safe(string value) => string.Concat(value.Where(ch => char.IsLetterOrDigit(ch) || ch is '_' or '-'));
    private static string TokenRef(string token) => "sha256:" + Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(token)))[..16].ToLowerInvariant();
}

internal sealed class SchedulingLifecycleChunkContributor : ISaveChunkContributor
{
    private static readonly ChunkId Chunk = new("leviathan.scheduling.booking.lifecycle");
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);
    private readonly SchedulingBookingCheckpoint? _write;
    public SchedulingBookingCheckpoint? Read { get; private set; }
    public SchedulingLifecycleChunkContributor(SchedulingBookingCheckpoint write) => _write = write;
    public SchedulingLifecycleChunkContributor() { }
    public void WriteChunks(SaveWriteContext ctx) { if (_write is not null) ctx.Add(Chunk, JsonSerializer.SerializeToUtf8Bytes(_write, Options)); }
    public void ReadChunks(SaveReadContext ctx) { if (ctx.TryGet(Chunk, out var chunk)) Read = JsonSerializer.Deserialize<SchedulingBookingCheckpoint>(chunk.Payload, Options); }
}
