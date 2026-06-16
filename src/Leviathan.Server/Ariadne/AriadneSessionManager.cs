using Ariadne.ConsoleApp.Scripts;
using System.Collections.Concurrent;

namespace Leviathan.Server.Ariadne;

public sealed class AriadneSessionManager
{
    private readonly ConcurrentDictionary<string, AriadneSession> _sessions = new();
    private static readonly IReadOnlyList<string> Capabilities = ["line", "advance", "choice", "text-input"];

    private static readonly IReadOnlyList<AdventureDefinition> AvailableAdventures =
    [
        new(
            Id: "rust_simulator",
            Title: "Rust Simulator",
            Description: "A black-comedy descent through compile-time suffering.",
            RegisterStates: RustSimulator.Register),
    ];

    public IReadOnlyList<LeviathanAppDto> Apps => AvailableAdventures
        .Select(adventure => new LeviathanAppDto(
            adventure.Id,
            "ariadne.adventure",
            adventure.Title,
            adventure.Description,
            Capabilities))
        .ToArray();

    public bool TryCreate(string appId, out AriadneSession? session)
    {
        session = null;
        var adventure = AvailableAdventures.FirstOrDefault(candidate => candidate.Id == appId);
        if (adventure is null) return false;
        session = new AriadneSession(Guid.NewGuid().ToString("n"), adventure);
        _sessions[session.Id] = session;
        return true;
    }

    public bool TryGet(string sessionId, out AriadneSession? session) => _sessions.TryGetValue(sessionId, out session);
}
