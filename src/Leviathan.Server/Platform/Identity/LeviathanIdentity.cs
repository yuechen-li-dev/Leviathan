namespace Leviathan.Server.Platform.Identity;

public sealed record LeviathanUserId(string Value)
{
    public override string ToString() => Value;
}

public sealed record LeviathanAccountId(string Value)
{
    public override string ToString() => Value;
}

public sealed record LeviathanAppInstallationId(string Value)
{
    public override string ToString() => Value;
}

public sealed record LeviathanRequestContext(
    string ActorKind,
    LeviathanUserId UserId,
    LeviathanAccountId AccountId,
    bool UnsafeLocalDev,
    string RequestId);

public interface ILeviathanRequestContextAccessor
{
    LeviathanRequestContext? Current { get; }
}

public sealed class LeviathanRequestContextAccessor(IConfiguration config, IHttpContextAccessor http) : ILeviathanRequestContextAccessor
{
    public const string LocalDevActorKind = "local-dev";
    public static readonly LeviathanUserId LocalDevUserId = new("user_local_dev");
    public static readonly LeviathanAccountId LocalDevAccountId = new("acct_local_dev");

    public LeviathanRequestContext? Current
    {
        get
        {
            if (!LeviathanLocalDevIdentity.UnsafeAdminEnabled(config)) return null;
            var requestId = http.HttpContext?.TraceIdentifier ?? Guid.NewGuid().ToString("n");
            return new(LocalDevActorKind, LocalDevUserId, LocalDevAccountId, true, requestId);
        }
    }
}

public static class LeviathanLocalDevIdentity
{
    public static bool UnsafeAdminEnabled(IConfiguration config) =>
        string.Equals(config["LEVIATHAN_ALLOW_UNSAFE_ADMIN"] ?? Environment.GetEnvironmentVariable("LEVIATHAN_ALLOW_UNSAFE_ADMIN"), "true", StringComparison.OrdinalIgnoreCase);
}
