using Leviathan.Server.Platform.Capabilities;
using Leviathan.Server.Platform.Identity;

namespace Leviathan.Server.Platform.Storage.Actuation;

public sealed record LeviathanActuationContext(
    LeviathanAccountId AccountId,
    LeviathanAppInstallationId AppInstallationId,
    string AppId,
    LeviathanUserId? ActorUserId,
    string? RequestId,
    string? CorrelationId,
    bool UnsafeLocalDev,
    bool TrustedInternal,
    LeviathanCapabilityGrantId? CapabilityGrantId = null)
{
    public LeviathanRequestContext ToRequestContext() => new(TrustedInternal ? "trusted-internal" : "local-dev", ActorUserId ?? new("user_unknown"), AccountId, UnsafeLocalDev, RequestId ?? CorrelationId ?? Guid.NewGuid().ToString("n"));

    public static LeviathanActuationContext TrustedInternalContext(string correlationId = "trusted-internal") =>
        new(new("acct_internal"), new("inst_internal"), "platform", null, correlationId, correlationId, UnsafeLocalDev: false, TrustedInternal: true);
}

public interface ILeviathanActuationContextResolver
{
    LeviathanActuationContext? Resolve(ObjectStorageCapabilityContext? commandContext);
}

public sealed class LeviathanActuationContextResolver(ILeviathanRequestContextAccessor requestContextAccessor) : ILeviathanActuationContextResolver
{
    public LeviathanActuationContext? Resolve(ObjectStorageCapabilityContext? commandContext)
    {
        if (commandContext?.TrustedInternal == true)
        {
            return new(
                new(commandContext.AccountId ?? "acct_internal"),
                new(commandContext.AppInstallationId ?? "inst_internal"),
                commandContext.AppId ?? "platform",
                string.IsNullOrWhiteSpace(commandContext.ActorUserId) ? null : new(commandContext.ActorUserId),
                commandContext.RequestId ?? commandContext.CorrelationId,
                commandContext.CorrelationId,
                UnsafeLocalDev: commandContext.LocalDev,
                TrustedInternal: true,
                string.IsNullOrWhiteSpace(commandContext.CapabilityGrantId) ? null : new(commandContext.CapabilityGrantId));
        }

        var request = requestContextAccessor.Current;
        if (request is null) return null;

        var appId = commandContext?.AppId;
        var appInstallationId = commandContext?.AppInstallationId;
        if (string.IsNullOrWhiteSpace(appId) || string.IsNullOrWhiteSpace(appInstallationId)) return null;

        if (!string.IsNullOrWhiteSpace(commandContext?.AccountId) && !string.Equals(commandContext.AccountId, request.AccountId.Value, StringComparison.Ordinal)) return null;
        if (!string.IsNullOrWhiteSpace(commandContext?.ActorUserId) && !string.Equals(commandContext.ActorUserId, request.UserId.Value, StringComparison.Ordinal)) return null;

        return new(
            request.AccountId,
            new(appInstallationId),
            appId,
            request.UserId,
            request.RequestId,
            commandContext?.CorrelationId ?? request.RequestId,
            request.UnsafeLocalDev,
            TrustedInternal: false,
            string.IsNullOrWhiteSpace(commandContext?.CapabilityGrantId) ? null : new(commandContext.CapabilityGrantId));
    }
}
