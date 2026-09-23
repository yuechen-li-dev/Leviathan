using Leviathan.Server.Ariadne;

namespace Leviathan.Server.Platform.Apps;

// Platform registration only. CAD documents and the editor remain in HeliosCAD.
public sealed class HeliosAppDefinition : ILeviathanAppDefinition
{
    public LeviathanAppManifest Manifest { get; } = new(
        "helios", "Helios", "project.application", "Account-owned projects", "external.browser", "/helios",
        "helios", ["project.read", "project.write", "project.delete", "object.read", "object.write"],
        new Dictionary<string, string>());
}
