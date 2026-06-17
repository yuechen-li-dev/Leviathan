using Ariadne.ConsoleApp.Scripts;

namespace Leviathan.Server.Ariadne;

public sealed record LeviathanAppId(string Value)
{
    public override string ToString() => Value;
}

public sealed record LeviathanAppManifest(
    string AppId,
    string DisplayName,
    string Kind,
    string Description,
    string Runtime,
    string FrontendRoute,
    string PersistenceScope,
    IReadOnlyList<string> Capabilities,
    IReadOnlyDictionary<string, string> Metadata);

public interface ILeviathanAppDefinition
{
    LeviathanAppManifest Manifest { get; }
}

public interface ILeviathanSessionApp : ILeviathanAppDefinition
{
    AriadneSession Start(string sessionId);
    AriadneSession Restore(string sessionId, IReadOnlyList<Dominatus.Core.Persistence.SaveChunk> chunks);
}

public sealed class RustSimulatorAppDefinition : ILeviathanSessionApp
{
    private static readonly AdventureDefinition Adventure = new(
        Id: "rust_simulator",
        Title: "Rust Simulator",
        Description: "A black-comedy descent through compile-time suffering.",
        RegisterStates: RustSimulator.Register);

    public LeviathanAppManifest Manifest { get; } = new(
        AppId: Adventure.Id,
        DisplayName: Adventure.Title,
        Kind: "ariadne.adventure",
        Description: Adventure.Description,
        Runtime: "ariadne.optflow",
        FrontendRoute: "/apps/rust-simulator",
        PersistenceScope: "ariadne/rust_simulator",
        Capabilities: ["line", "advance", "choice", "text-input"],
        Metadata: new Dictionary<string, string>
        {
            ["source"] = "temporary-linked-vendored-rust-simulator",
            ["legacyAppId"] = "rust_simulator"
        });

    public AriadneSession Start(string sessionId) => new(sessionId, Adventure);

    public AriadneSession Restore(string sessionId, IReadOnlyList<Dominatus.Core.Persistence.SaveChunk> chunks) =>
        AriadneSession.Restore(sessionId, Adventure, chunks);
}

public sealed class LeviathanAppRegistry(IEnumerable<ILeviathanAppDefinition> apps, IEnumerable<ILeviathanSessionApp> sessionApps)
{
    private readonly IReadOnlyDictionary<string, ILeviathanAppDefinition> _apps = apps.ToDictionary(app => app.Manifest.AppId, StringComparer.Ordinal);
    private readonly IReadOnlyDictionary<string, ILeviathanSessionApp> _sessionApps = sessionApps.ToDictionary(app => app.Manifest.AppId, StringComparer.Ordinal);

    public IReadOnlyList<LeviathanAppManifest> Apps => _apps.Values.Select(app => app.Manifest).OrderBy(app => app.DisplayName).ToArray();

    public bool TryGetManifest(string appId, out LeviathanAppManifest? manifest)
    {
        if (_apps.TryGetValue(appId, out var app))
        {
            manifest = app.Manifest;
            return true;
        }
        manifest = null;
        return false;
    }

    public bool TryGetSessionApp(string appId, out ILeviathanSessionApp? app) => _sessionApps.TryGetValue(appId, out app);
}
