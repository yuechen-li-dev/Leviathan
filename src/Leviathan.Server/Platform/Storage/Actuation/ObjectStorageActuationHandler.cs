using System.Text;
using Dominatus.Core.Runtime;
using Leviathan.Server.Platform.Capabilities;

namespace Leviathan.Server.Platform.Storage.Actuation;

public enum ObjectStorageActuationSecurityMode { TrustedInternal }

public sealed class ObjectStorageActuationOptions
{
    public ObjectStorageActuationSecurityMode SecurityMode { get; set; } = ObjectStorageActuationSecurityMode.TrustedInternal;
    public int DefaultMaxReadBytes { get; set; } = 64 * 1024;
    public int DefaultMaxListResults { get; set; } = 100;
}

public sealed class ObjectStorageActuationHandler(
    ILeviathanObjectStore store,
    IObjectStorageOperationEventSink? events = null,
    ObjectStorageActuationOptions? options = null) :
    IActuationHandler<ObjectPutCommand>,
    IActuationHandler<ObjectGetCommand>,
    IActuationHandler<ObjectExistsCommand>,
    IActuationHandler<ObjectDeleteCommand>,
    IActuationHandler<ObjectListCommand>,
    IActuationHandler<ObjectAppendCommand>
{
    private readonly ObjectStorageActuationOptions _options = options ?? new();

    public ActuatorHost.HandlerResult Handle(ActuatorHost host, AiCtx ctx, ActuationId id, ObjectPutCommand cmd) => Result(ExecutePutAsync(cmd, default).GetAwaiter().GetResult());
    public ActuatorHost.HandlerResult Handle(ActuatorHost host, AiCtx ctx, ActuationId id, ObjectGetCommand cmd) => Result(ExecuteGetAsync(cmd, default).GetAwaiter().GetResult());
    public ActuatorHost.HandlerResult Handle(ActuatorHost host, AiCtx ctx, ActuationId id, ObjectExistsCommand cmd) => Result(ExecuteExistsAsync(cmd, default).GetAwaiter().GetResult());
    public ActuatorHost.HandlerResult Handle(ActuatorHost host, AiCtx ctx, ActuationId id, ObjectDeleteCommand cmd) => Result(ExecuteDeleteAsync(cmd, default).GetAwaiter().GetResult());
    public ActuatorHost.HandlerResult Handle(ActuatorHost host, AiCtx ctx, ActuationId id, ObjectListCommand cmd) => Result(ExecuteListAsync(cmd, default).GetAwaiter().GetResult());
    public ActuatorHost.HandlerResult Handle(ActuatorHost host, AiCtx ctx, ActuationId id, ObjectAppendCommand cmd) => Result(ExecuteAppendAsync(cmd, default).GetAwaiter().GetResult());

    public async Task<ObjectPutResult> ExecutePutAsync(ObjectPutCommand cmd, CancellationToken ct)
    {
        var started = Start("put", cmd.Key, LeviathanCapabilityNames.ObjectWrite, cmd.Context, cmd.ContentType, Payload(cmd).LongLength);
        if (TryKey(cmd.Key, out var key, out var rejected) is false) return Fail(new ObjectPutResult(false, cmd.Key, ErrorCode: rejected, ErrorMessage: "Invalid object key."), started, rejected);
        try
        {
            var bytes = Payload(cmd);
            await store.PutAsync(key!, bytes, new(cmd.ContentType, Custom: cmd.Metadata), new(cmd.Overwrite, cmd.IfNotExists, cmd.ExpectedETag), ct);
            var read = await store.GetAsync(key!, ct);
            var result = new ObjectPutResult(true, key!.Value, read is null ? null : ObjectResultMetadata.From(read.Metadata));
            Complete(started, "ok", result.Metadata); return result;
        }
        catch (LeviathanObjectConflictException ex) { return Fail(new ObjectPutResult(false, key!.Value, ErrorCode: "conflict", ErrorMessage: ex.Message), started, "conflict"); }
        catch (Exception ex) when (ex is LeviathanObjectStorageException or IOException or UnauthorizedAccessException) { return Fail(new ObjectPutResult(false, key!.Value, ErrorCode: "storage_error", ErrorMessage: ex.Message), started, "storage_error"); }
    }

    public async Task<ObjectGetResult> ExecuteGetAsync(ObjectGetCommand cmd, CancellationToken ct)
    {
        var started = Start("get", cmd.Key, LeviathanCapabilityNames.ObjectRead, cmd.Context, null, null);
        if (TryKey(cmd.Key, out var key, out var rejected) is false) return Fail(new ObjectGetResult(false, cmd.Key, ErrorCode: rejected, ErrorMessage: "Invalid object key."), started, rejected);
        var read = await store.GetAsync(key!, ct);
        if (read is null) return Fail(new ObjectGetResult(false, key!.Value, ErrorCode: "not_found", ErrorMessage: "Object was not found."), started, "not_found");
        var max = cmd.MaxBytes ?? _options.DefaultMaxReadBytes;
        if (read.Content.Length > max) return Fail(new ObjectGetResult(false, key!.Value, Metadata: ObjectResultMetadata.From(read.Metadata), ErrorCode: "too_large", ErrorMessage: $"Object exceeds max read size of {max} bytes."), started, "too_large");
        var text = cmd.IncludeText && IsUtf8(read.Content) ? Encoding.UTF8.GetString(read.Content) : null;
        var result = new ObjectGetResult(true, key!.Value, read.Content, text, ObjectResultMetadata.From(read.Metadata));
        Complete(started, "ok", result.Metadata); return result;
    }

    public async Task<ObjectExistsResult> ExecuteExistsAsync(ObjectExistsCommand cmd, CancellationToken ct)
    {
        var started = Start("exists", cmd.Key, LeviathanCapabilityNames.ObjectRead, cmd.Context, null, null);
        if (TryKey(cmd.Key, out var key, out var rejected) is false) return Fail(new ObjectExistsResult(false, cmd.Key, false, rejected, "Invalid object key."), started, rejected);
        var result = new ObjectExistsResult(true, key!.Value, await store.ExistsAsync(key, ct)); Complete(started, result.Exists ? "exists" : "missing", null); return result;
    }

    public async Task<ObjectDeleteResult> ExecuteDeleteAsync(ObjectDeleteCommand cmd, CancellationToken ct)
    {
        var started = Start("delete", cmd.Key, LeviathanCapabilityNames.ObjectDelete, cmd.Context, null, null);
        if (TryKey(cmd.Key, out var key, out var rejected) is false) return Fail(new ObjectDeleteResult(false, cmd.Key, false, rejected, "Invalid object key."), started, rejected);
        var existed = await store.ExistsAsync(key!, ct); await store.DeleteAsync(key!, ct);
        var result = new ObjectDeleteResult(true, key!.Value, existed); Complete(started, existed ? "deleted" : "missing", null); return result;
    }

    public async Task<ObjectListResult> ExecuteListAsync(ObjectListCommand cmd, CancellationToken ct)
    {
        var started = Start("list", cmd.Prefix, LeviathanCapabilityNames.ObjectList, cmd.Context, null, null);
        if (TryKey(cmd.Prefix, out var prefix, out var rejected) is false) return Fail(new ObjectListResult(false, cmd.Prefix, [], rejected, "Invalid object key."), started, rejected);
        var max = cmd.MaxResults ?? _options.DefaultMaxListResults; var items = new List<ObjectListItem>();
        await foreach (var item in store.ListAsync(prefix!, ct)) { if (items.Count >= max) break; items.Add(new(item.Key.Value, ObjectResultMetadata.From(item.Metadata))); }
        var result = new ObjectListResult(true, prefix!.Value, items); Complete(started, "ok", null); return result;
    }

    public async Task<ObjectAppendResult> ExecuteAppendAsync(ObjectAppendCommand cmd, CancellationToken ct)
    {
        var started = Start("append", cmd.Key, LeviathanCapabilityNames.ObjectWrite, cmd.Context, cmd.ContentType, Payload(cmd).LongLength);
        if (TryKey(cmd.Key, out var key, out var rejected) is false) return Fail(new ObjectAppendResult(false, cmd.Key, ErrorCode: rejected, ErrorMessage: "Invalid object key."), started, rejected);
        await store.AppendAsync(key!, Payload(cmd), new(cmd.ContentType, Custom: cmd.Metadata), ct);
        var read = await store.GetAsync(key!, ct); var result = new ObjectAppendResult(true, key!.Value, read is null ? null : ObjectResultMetadata.From(read.Metadata));
        Complete(started, "ok", result.Metadata); return result;
    }

    private static ActuatorHost.HandlerResult Result<T>(T payload) => ActuatorHost.HandlerResult.CompletedWithPayload(payload, ok: (bool)(typeof(T).GetProperty("Ok")!.GetValue(payload) ?? false), error: typeof(T).GetProperty("ErrorMessage")!.GetValue(payload) as string);
    private static bool TryKey(string value, out LeviathanObjectKey? key, out string? error) { try { key = new(value); error = null; return true; } catch (ArgumentException) { key = null; error = "invalid_key"; return false; } }
    private static byte[] Payload(ObjectPutCommand cmd) => cmd.Bytes ?? (cmd.Text is null ? [] : Encoding.UTF8.GetBytes(cmd.Text));
    private static byte[] Payload(ObjectAppendCommand cmd) => cmd.Bytes ?? (cmd.Text is null ? [] : Encoding.UTF8.GetBytes(cmd.Text));
    private static bool IsUtf8(byte[] bytes) { try { _ = new UTF8Encoding(false, true).GetString(bytes); return true; } catch (DecoderFallbackException) { return false; } }

    private ObjectStorageOperationEvent Start(string op, string key, string capability, ObjectStorageCapabilityContext? ctx, string? contentType, long? length)
    {
        var e = Event("started", op, key, capability, ctx, contentType, length, null, null, null); events?.Publish(e); return e;
    }
    private void Complete(ObjectStorageOperationEvent started, string status, ObjectResultMetadata? metadata) => events?.Publish(started with { Kind = "completed", ResultStatus = status, ContentLength = metadata?.ContentLength ?? started.ContentLength, ContentHash = metadata?.ContentHash, OccurredAt = DateTimeOffset.UtcNow });
    private T Fail<T>(T result, ObjectStorageOperationEvent started, string? code) { events?.Publish(started with { Kind = code == "invalid_key" ? "rejected" : "failed", ResultStatus = "failed", ErrorCode = code, OccurredAt = DateTimeOffset.UtcNow }); return result; }
    private static ObjectStorageOperationEvent Event(string kind, string op, string key, string capability, ObjectStorageCapabilityContext? ctx, string? contentType, long? length, string? hash, string? status, string? error)
        => new(kind, op, SafeKey(key), ctx?.AccountId, ctx?.AppId, ctx?.AppInstallationId, capability, ctx?.CapabilityGrantId, contentType, length, hash, status, error, ctx?.CorrelationId, DateTimeOffset.UtcNow);
    private static string SafeKey(string key) { try { return new LeviathanObjectKey(key).Value; } catch { return "<invalid>"; } }
}
