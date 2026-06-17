using Ariadne.ConsoleApp.Scripts;
using System.Collections.Concurrent;

namespace Leviathan.Server.Ariadne;

public sealed class AriadneSessionManager(AriadneSessionPersistence persistence)
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

    public IReadOnlyList<AriadneSessionListItemDto> Sessions => persistence.ListSessions();

    public bool TryCreate(string appId, out AriadneSession? session)
    {
        session = null;
        var adventure = FindAdventure(appId);
        if (adventure is null) return false;
        session = new AriadneSession(Guid.NewGuid().ToString("n"), adventure);
        _sessions[session.Id] = session;
        persistence.Save(session);
        return true;
    }

    public bool TryGet(string sessionId, out AriadneSession? session, out string? error)
    {
        error = null;
        if (_sessions.TryGetValue(sessionId, out session)) return true;
        var adventure = FindAdventure("rust_simulator");
        if (adventure is null || !persistence.Exists(sessionId)) return false;
        try
        {
            session = persistence.Restore(sessionId, adventure);
            _sessions[session.Id] = session;
            return true;
        }
        catch (Exception ex) when (ex is InvalidDataException or InvalidOperationException or System.Text.Json.JsonException or IOException or EndOfStreamException)
        {
            error = $"Session '{sessionId}' could not be restored: {ex.Message}";
            session = null;
            return false;
        }
    }

    public void Save(AriadneSession session) => persistence.Save(session);

    private static AdventureDefinition? FindAdventure(string appId) => AvailableAdventures.FirstOrDefault(candidate => candidate.Id == appId);
}
