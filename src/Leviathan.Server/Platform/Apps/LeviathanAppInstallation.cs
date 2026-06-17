using Leviathan.Server.Platform.Identity;

namespace Leviathan.Server.Platform.Apps;

public sealed record LeviathanAppInstallation(
    LeviathanAppInstallationId AppInstallationId,
    LeviathanAccountId AccountId,
    string AppId,
    string Status,
    DateTimeOffset InstalledAt,
    LeviathanUserId InstalledBy,
    string PersistenceScope);

public sealed class LeviathanLocalDevAppInstallations
{
    public static readonly LeviathanAppInstallationId SchedulingInstallationId = new("inst_local_dev_scheduling");

    public LeviathanAppInstallation Scheduling { get; } = new(
        SchedulingInstallationId,
        LeviathanRequestContextAccessor.LocalDevAccountId,
        "scheduling",
        "active-local-dev",
        DateTimeOffset.UnixEpoch,
        LeviathanRequestContextAccessor.LocalDevUserId,
        "scheduling");
}
