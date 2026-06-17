using System.Text;
using Dominatus.Core.Runtime;
using Leviathan.Server.Platform.Capabilities;

namespace Leviathan.Server.Platform.Storage.Actuation;

public enum ObjectStorageActuationSecurityMode { TrustedInternal, PolicyEnforced }

public sealed class ObjectStorageActuationOptions
{
    public ObjectStorageActuationSecurityMode SecurityMode { get; set; } = ObjectStorageActuationSecurityMode.TrustedInternal;
    public int DefaultMaxReadBytes { get; set; } = 64 * 1024;
    public int DefaultMaxListResults { get; set; } = 100;
}

public sealed class ObjectStorageActuationHandler(
    ILeviathanObjectStore store,
    IObjectStorageOperationEventSink? events = null,
    ObjectStorageActuationOptions? options = null,
    ILeviathanCapabilityPolicy? capabilityPolicy = null,
    ILeviathanActuationContextResolver? contextResolver = null) :
    IActuationHandler<ObjectPutCommand>, IActuationHandler<ObjectGetCommand>, IActuationHandler<ObjectExistsCommand>,
    IActuationHandler<ObjectDeleteCommand>, IActuationHandler<ObjectListCommand>, IActuationHandler<ObjectAppendCommand>
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
        var bytes = Payload(cmd); var started = Start("put", cmd.Key, LeviathanCapabilityNames.ObjectWrite, cmd.Context, cmd.ContentType, bytes.LongLength);
        if (TryKey(cmd.Key, out var key, out var rejected) is false) return Fail(new ObjectPutResult(false, cmd.Key, ErrorCode: rejected, ErrorMessage: "Invalid object key."), started, rejected);
        var auth = await Authorize(LeviathanCapabilityNames.ObjectWrite, "put", key!.Value, cmd.Context); if (!auth.Allowed) return Denied(new ObjectPutResult(false, key.Value, ErrorCode: "capability_denied", ErrorMessage: "Object operation was denied by Leviathan capability policy.", Decision: auth.Decision), started, auth);
        try { await store.PutAsync(key, bytes, new(cmd.ContentType, Custom: cmd.Metadata), new(cmd.Overwrite, cmd.IfNotExists, cmd.ExpectedETag), ct); var read = await store.GetAsync(key, ct); var result = new ObjectPutResult(true, key.Value, read is null ? null : ObjectResultMetadata.From(read.Metadata), Decision: auth.Decision); Complete(started, "ok", result.Metadata, auth); return result; }
        catch (LeviathanObjectConflictException ex) { return Fail(new ObjectPutResult(false, key.Value, ErrorCode: "conflict", ErrorMessage: ex.Message, Decision: auth.Decision), started, "conflict", auth); }
        catch (Exception ex) when (ex is LeviathanObjectStorageException or IOException or UnauthorizedAccessException) { return Fail(new ObjectPutResult(false, key.Value, ErrorCode: "storage_error", ErrorMessage: ex.Message, Decision: auth.Decision), started, "storage_error", auth); }
    }

    public async Task<ObjectGetResult> ExecuteGetAsync(ObjectGetCommand cmd, CancellationToken ct)
    {
        var started = Start("get", cmd.Key, LeviathanCapabilityNames.ObjectRead, cmd.Context, null, null);
        if (TryKey(cmd.Key, out var key, out var rejected) is false) return Fail(new ObjectGetResult(false, cmd.Key, ErrorCode: rejected, ErrorMessage: "Invalid object key."), started, rejected);
        var auth = await Authorize(LeviathanCapabilityNames.ObjectRead, "get", key!.Value, cmd.Context); if (!auth.Allowed) return Denied(new ObjectGetResult(false, key.Value, ErrorCode: "capability_denied", ErrorMessage: "Object operation was denied by Leviathan capability policy.", Decision: auth.Decision), started, auth);
        var read = await store.GetAsync(key, ct); if (read is null) return Fail(new ObjectGetResult(false, key.Value, ErrorCode: "not_found", ErrorMessage: "Object was not found.", Decision: auth.Decision), started, "not_found", auth);
        var max = cmd.MaxBytes ?? _options.DefaultMaxReadBytes; if (read.Content.Length > max) return Fail(new ObjectGetResult(false, key.Value, Metadata: ObjectResultMetadata.From(read.Metadata), ErrorCode: "too_large", ErrorMessage: $"Object exceeds max read size of {max} bytes.", Decision: auth.Decision), started, "too_large", auth);
        var text = cmd.IncludeText && IsUtf8(read.Content) ? Encoding.UTF8.GetString(read.Content) : null; var result = new ObjectGetResult(true, key.Value, read.Content, text, ObjectResultMetadata.From(read.Metadata), Decision: auth.Decision); Complete(started, "ok", result.Metadata, auth); return result;
    }

    public async Task<ObjectExistsResult> ExecuteExistsAsync(ObjectExistsCommand cmd, CancellationToken ct)
    {
        var started = Start("exists", cmd.Key, LeviathanCapabilityNames.ObjectRead, cmd.Context, null, null);
        if (TryKey(cmd.Key, out var key, out var rejected) is false) return Fail(new ObjectExistsResult(false, cmd.Key, false, rejected, "Invalid object key."), started, rejected);
        var auth = await Authorize(LeviathanCapabilityNames.ObjectRead, "exists", key!.Value, cmd.Context); if (!auth.Allowed) return Denied(new ObjectExistsResult(false, key.Value, false, "capability_denied", "Object operation was denied by Leviathan capability policy.", auth.Decision), started, auth);
        var result = new ObjectExistsResult(true, key.Value, await store.ExistsAsync(key, ct), Decision: auth.Decision); Complete(started, result.Exists ? "exists" : "missing", null, auth); return result;
    }

    public async Task<ObjectDeleteResult> ExecuteDeleteAsync(ObjectDeleteCommand cmd, CancellationToken ct)
    {
        var started = Start("delete", cmd.Key, LeviathanCapabilityNames.ObjectDelete, cmd.Context, null, null);
        if (TryKey(cmd.Key, out var key, out var rejected) is false) return Fail(new ObjectDeleteResult(false, cmd.Key, false, rejected, "Invalid object key."), started, rejected);
        var auth = await Authorize(LeviathanCapabilityNames.ObjectDelete, "delete", key!.Value, cmd.Context); if (!auth.Allowed) return Denied(new ObjectDeleteResult(false, key.Value, false, "capability_denied", "Object operation was denied by Leviathan capability policy.", auth.Decision), started, auth);
        var existed = await store.ExistsAsync(key, ct); await store.DeleteAsync(key, ct); var result = new ObjectDeleteResult(true, key.Value, existed, Decision: auth.Decision); Complete(started, existed ? "deleted" : "missing", null, auth); return result;
    }

    public async Task<ObjectListResult> ExecuteListAsync(ObjectListCommand cmd, CancellationToken ct)
    {
        var started = Start("list", cmd.Prefix, LeviathanCapabilityNames.ObjectList, cmd.Context, null, null);
        if (TryKey(cmd.Prefix, out var prefix, out var rejected) is false) return Fail(new ObjectListResult(false, cmd.Prefix, [], rejected, "Invalid object key."), started, rejected);
        var auth = await Authorize(LeviathanCapabilityNames.ObjectList, "list", prefix!.Value, cmd.Context); if (!auth.Allowed) return Denied(new ObjectListResult(false, prefix.Value, [], "capability_denied", "Object operation was denied by Leviathan capability policy.", auth.Decision), started, auth);
        var max = cmd.MaxResults ?? _options.DefaultMaxListResults; var items = new List<ObjectListItem>(); await foreach (var item in store.ListAsync(prefix, ct)) { if (items.Count >= max) break; items.Add(new(item.Key.Value, ObjectResultMetadata.From(item.Metadata))); }
        var result = new ObjectListResult(true, prefix.Value, items, Decision: auth.Decision); Complete(started, "ok", null, auth); return result;
    }

    public async Task<ObjectAppendResult> ExecuteAppendAsync(ObjectAppendCommand cmd, CancellationToken ct)
    {
        var bytes = Payload(cmd); var started = Start("append", cmd.Key, LeviathanCapabilityNames.ObjectWrite, cmd.Context, cmd.ContentType, bytes.LongLength);
        if (TryKey(cmd.Key, out var key, out var rejected) is false) return Fail(new ObjectAppendResult(false, cmd.Key, ErrorCode: rejected, ErrorMessage: "Invalid object key."), started, rejected);
        var auth = await Authorize(LeviathanCapabilityNames.ObjectWrite, "append", key!.Value, cmd.Context); if (!auth.Allowed) return Denied(new ObjectAppendResult(false, key.Value, ErrorCode: "capability_denied", ErrorMessage: "Object operation was denied by Leviathan capability policy.", Decision: auth.Decision), started, auth);
        await store.AppendAsync(key, bytes, new(cmd.ContentType, Custom: cmd.Metadata), ct); var read = await store.GetAsync(key, ct); var result = new ObjectAppendResult(true, key.Value, read is null ? null : ObjectResultMetadata.From(read.Metadata), Decision: auth.Decision); Complete(started, "ok", result.Metadata, auth); return result;
    }

    private async Task<AuthResult> Authorize(string capability, string operation, string key, ObjectStorageCapabilityContext? commandContext)
    {
        if (_options.SecurityMode == ObjectStorageActuationSecurityMode.TrustedInternal) return AuthResult.Allow(new(capability, true, "trusted_internal", commandContext?.CapabilityGrantId, commandContext?.CorrelationId), ResolveBestEffort(commandContext));
        var resolved = contextResolver?.Resolve(commandContext); if (resolved is null || capabilityPolicy is null) return AuthResult.Deny(new(capability, false, "missing_actuation_context", null, commandContext?.CorrelationId), null);
        if (resolved.TrustedInternal) return AuthResult.Allow(new(capability, true, "trusted_internal", resolved.CapabilityGrantId?.Value, resolved.CorrelationId), resolved);
        var decision = await capabilityPolicy.Evaluate(resolved.ToRequestContext(), new(resolved.AppId, resolved.AppInstallationId, new(capability), LeviathanCapabilityScope.Account(), operation, "object", key, resolved.CorrelationId));
        var d = new ObjectCapabilityDecision(capability, decision.Allowed, decision.ReasonCode, decision.GrantId?.Value, resolved.CorrelationId);
        return decision.Allowed ? AuthResult.Allow(d, resolved) : AuthResult.Deny(d, resolved);
    }

    private LeviathanActuationContext? ResolveBestEffort(ObjectStorageCapabilityContext? ctx) => ctx is null ? null : new(new(ctx.AccountId ?? ""), new(ctx.AppInstallationId ?? ""), ctx.AppId ?? "", string.IsNullOrWhiteSpace(ctx.ActorUserId) ? null : new(ctx.ActorUserId), ctx.RequestId, ctx.CorrelationId, ctx.LocalDev, ctx.TrustedInternal, string.IsNullOrWhiteSpace(ctx.CapabilityGrantId) ? null : new(ctx.CapabilityGrantId));
    private sealed record AuthResult(bool Allowed, ObjectCapabilityDecision Decision, LeviathanActuationContext? Context) { public static AuthResult Allow(ObjectCapabilityDecision d, LeviathanActuationContext? c) => new(true, d, c); public static AuthResult Deny(ObjectCapabilityDecision d, LeviathanActuationContext? c) => new(false, d, c); }

    private static ActuatorHost.HandlerResult Result<T>(T payload) => ActuatorHost.HandlerResult.CompletedWithPayload(payload, ok: (bool)(typeof(T).GetProperty("Ok")!.GetValue(payload) ?? false), error: typeof(T).GetProperty("ErrorMessage")!.GetValue(payload) as string);
    private static bool TryKey(string value, out LeviathanObjectKey? key, out string? error) { try { key = new(value); error = null; return true; } catch (ArgumentException) { key = null; error = "invalid_key"; return false; } }
    private static byte[] Payload(ObjectPutCommand cmd) => cmd.Bytes ?? (cmd.Text is null ? [] : Encoding.UTF8.GetBytes(cmd.Text));
    private static byte[] Payload(ObjectAppendCommand cmd) => cmd.Bytes ?? (cmd.Text is null ? [] : Encoding.UTF8.GetBytes(cmd.Text));
    private static bool IsUtf8(byte[] bytes) { try { _ = new UTF8Encoding(false, true).GetString(bytes); return true; } catch (DecoderFallbackException) { return false; } }

    private ObjectStorageOperationEvent Start(string op, string key, string capability, ObjectStorageCapabilityContext? ctx, string? contentType, long? length) { var e = Event("started", op, key, capability, ctx, null, contentType, length, null, null, null); events?.Publish(e); return e; }
    private void Complete(ObjectStorageOperationEvent started, string status, ObjectResultMetadata? metadata, AuthResult auth) => events?.Publish(WithAuth(started, auth) with { Kind = "completed", ResultStatus = status, ContentLength = metadata?.ContentLength ?? started.ContentLength, ContentHash = metadata?.ContentHash, OccurredAt = DateTimeOffset.UtcNow });
    private T Fail<T>(T result, ObjectStorageOperationEvent started, string? code, AuthResult? auth = null) { events?.Publish((auth is null ? started : WithAuth(started, auth)) with { Kind = code == "invalid_key" ? "rejected" : "failed", ResultStatus = "failed", ErrorCode = code, OccurredAt = DateTimeOffset.UtcNow }); return result; }
    private T Denied<T>(T result, ObjectStorageOperationEvent started, AuthResult auth) { events?.Publish(WithAuth(started, auth) with { Kind = "denied", ResultStatus = "denied", ErrorCode = "capability_denied", OccurredAt = DateTimeOffset.UtcNow }); return result; }
    private static ObjectStorageOperationEvent WithAuth(ObjectStorageOperationEvent e, AuthResult auth) => e with { AccountId = auth.Context?.AccountId.Value ?? e.AccountId, AppId = auth.Context?.AppId ?? e.AppId, AppInstallationId = auth.Context?.AppInstallationId.Value ?? e.AppInstallationId, ActorUserId = auth.Context?.ActorUserId?.Value ?? e.ActorUserId, CapabilityGrantId = auth.Decision.GrantId ?? e.CapabilityGrantId, CapabilityAllowed = auth.Decision.Allowed, CapabilityReasonCode = auth.Decision.ReasonCode, CorrelationId = auth.Decision.CorrelationId ?? e.CorrelationId };
    private static ObjectStorageOperationEvent Event(string kind, string op, string key, string capability, ObjectStorageCapabilityContext? ctx, ObjectCapabilityDecision? decision, string? contentType, long? length, string? hash, string? status, string? error)
        => new(kind, op, SafeKey(key), ctx?.AccountId, ctx?.AppId, ctx?.AppInstallationId, capability, ctx?.CapabilityGrantId, decision?.Allowed, decision?.ReasonCode, ctx?.ActorUserId, contentType, length, hash, status, error, ctx?.CorrelationId, DateTimeOffset.UtcNow);
    private static string SafeKey(string key) { try { return new LeviathanObjectKey(key).Value; } catch { return "<invalid>"; } }
}
