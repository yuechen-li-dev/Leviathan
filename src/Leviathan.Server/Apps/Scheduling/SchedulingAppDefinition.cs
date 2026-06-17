using Leviathan.Server.Ariadne;

namespace Leviathan.Server.Apps.Scheduling;

public sealed class SchedulingAppDefinition : ILeviathanAppDefinition
{
    public LeviathanAppManifest Manifest { get; } = new(
        AppId: "scheduling",
        DisplayName: "Scheduling",
        Kind: "scheduling.resource-booking",
        Description: "Local resource booking with atomic holds and auditable confirmations.",
        Runtime: "scheduling.local.v1",
        FrontendRoute: "/apps/scheduling",
        PersistenceScope: "scheduling",
        Capabilities: ["provider.config", "resource.booking", "availability.rules", "holds", "bookings", "audit.local"],
        Metadata: new Dictionary<string, string> { ["m8"] = "plain-local-claim-engine", ["adminSafety"] = "local-dev-only-no-auth" });
}
