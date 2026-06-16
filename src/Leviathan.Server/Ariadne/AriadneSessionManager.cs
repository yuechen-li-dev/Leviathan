using Ariadne.ConsoleApp;
using System.Collections.Concurrent;

namespace Leviathan.Server.Ariadne;

public sealed class AriadneSessionManager
{
    private readonly ConcurrentDictionary<string, AriadneSession> _sessions = new();
    private static readonly IReadOnlyList<string> Capabilities = ["line", "advance", "choice", "text-input"];

    public IReadOnlyList<LeviathanAppDto> Apps => AdventureCatalog.All
        .Where(a => a.Id == "rust_simulator")
        .Select(a => new LeviathanAppDto(a.Id, "ariadne.adventure", a.Title, a.Description, Capabilities))
        .ToArray();

    public bool TryCreate(string appId, out AriadneSession? session)
    {
        session = null;
        var adventure = AdventureCatalog.All.FirstOrDefault(a => a.Id == appId);
        if (adventure is null || adventure.Id != "rust_simulator") return false;
        session = new AriadneSession(Guid.NewGuid().ToString("n"), adventure);
        _sessions[session.Id] = session;
        return true;
    }

    public bool TryGet(string sessionId, out AriadneSession? session) => _sessions.TryGetValue(sessionId, out session);
}
