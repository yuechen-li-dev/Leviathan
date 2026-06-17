using System.Collections.Concurrent;

namespace Leviathan.Server.Ariadne;

public sealed class AriadneSessionManager(AriadneSessionPersistence persistence, LeviathanAppRegistry registry)
{
    private readonly ConcurrentDictionary<string, AriadneSession> _sessions = new();

    public IReadOnlyList<LeviathanAppManifest> Apps => registry.Apps;

    public IReadOnlyList<AriadneSessionListItemDto> Sessions(string appId) =>
        registry.TryGetManifest(appId, out var manifest) && manifest is not null
            ? persistence.ListSessions(manifest)
            : Array.Empty<AriadneSessionListItemDto>();

    public bool TryCreate(string appId, out AriadneSession? session)
    {
        session = null;
        if (!registry.TryGetSessionApp(appId, out var app) || app is null) return false;
        session = app.Start(Guid.NewGuid().ToString("n"));
        _sessions[session.Id] = session;
        persistence.Save(session, app.Manifest);
        return true;
    }

    public bool TryGet(string appId, string sessionId, out AriadneSession? session, out string? error)
    {
        error = null;
        if (!registry.TryGetSessionApp(appId, out var app) || app is null)
        {
            session = null;
            return false;
        }
        if (_sessions.TryGetValue(sessionId, out session) && session.AppId == appId) return true;
        if (!persistence.Exists(app.Manifest, sessionId)) return false;
        try
        {
            session = app.Restore(sessionId, persistence.ReadCheckpoint(app.Manifest, sessionId));
            _sessions[session.Id] = session;
            return true;
        }
        catch (Exception ex) when (ex is InvalidDataException or InvalidOperationException or System.Text.Json.JsonException or IOException or EndOfStreamException)
        {
            error = $"Session '{sessionId}' for app '{appId}' could not be restored: {ex.Message}";
            session = null;
            return false;
        }
    }

    public void Save(AriadneSession session)
    {
        if (registry.TryGetManifest(session.AppId, out var manifest) && manifest is not null) persistence.Save(session, manifest);
    }
}
