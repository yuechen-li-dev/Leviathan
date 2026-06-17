using Dominatus.Core.Persistence;
using System.Text.Json;

namespace Leviathan.Server.Ariadne;

public sealed class AriadneSessionPersistence
{
    private const string AppDirectory = "rust_simulator";
    private const string CheckpointFile = "checkpoint.dom1";
    private readonly string _root;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    public AriadneSessionPersistence(IConfiguration configuration, IWebHostEnvironment environment)
    {
        var configured = configuration["LEVIATHAN_DATA_DIR"] ?? Environment.GetEnvironmentVariable("LEVIATHAN_DATA_DIR");
        _root = Path.GetFullPath(string.IsNullOrWhiteSpace(configured) ? Path.Combine(environment.ContentRootPath, "data") : configured);
    }

    public string Root => _root;

    public void Save(AriadneSession session)
    {
        var dir = SessionDirectory(session.Id);
        Directory.CreateDirectory(dir);
        var checkpointPath = Path.Combine(dir, CheckpointFile);
        SaveFile.Write(checkpointPath, session.CreateCheckpointChunks());
        var now = DateTimeOffset.UtcNow;
        var manifestPath = Path.Combine(dir, "manifest.json");
        var existing = ReadManifestOrNull(manifestPath);
        var manifest = new AriadneSessionManifest(
            SessionId: session.Id,
            AppId: session.AppId,
            CreatedAt: existing?.CreatedAt ?? now,
            UpdatedAt: now,
            IsComplete: session.Screen().IsComplete,
            PersistenceFormat: "dominatus-save/dom1",
            CurrentCheckpoint: CheckpointFile);
        File.WriteAllText(manifestPath, JsonSerializer.Serialize(manifest, JsonOptions));
    }

    public bool Exists(string sessionId) => File.Exists(CheckpointPath(sessionId));

    public AriadneSession Restore(string sessionId, AdventureDefinition adventure)
    {
        var chunks = SaveFile.Read(CheckpointPath(sessionId));
        return AriadneSession.Restore(sessionId, adventure, chunks);
    }

    public IReadOnlyList<AriadneSessionManifest> ListSessions()
    {
        var dir = Path.Combine(_root, "ariadne", AppDirectory, "sessions");
        if (!Directory.Exists(dir)) return Array.Empty<AriadneSessionManifest>();
        return Directory.EnumerateFiles(dir, "manifest.json", SearchOption.AllDirectories)
            .Select(ReadManifestOrNull)
            .Where(static m => m is not null)
            .Cast<AriadneSessionManifest>()
            .OrderByDescending(static m => m.UpdatedAt)
            .ToArray();
    }

    private string SessionDirectory(string sessionId) => Path.Combine(_root, "ariadne", AppDirectory, "sessions", sessionId);
    private string CheckpointPath(string sessionId) => Path.Combine(SessionDirectory(sessionId), CheckpointFile);

    private static AriadneSessionManifest? ReadManifestOrNull(string path)
    {
        try { return File.Exists(path) ? JsonSerializer.Deserialize<AriadneSessionManifest>(File.ReadAllText(path), JsonOptions) : null; }
        catch { return null; }
    }
}

public sealed record AriadneSessionManifest(
    string SessionId,
    string AppId,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    bool IsComplete,
    string PersistenceFormat,
    string CurrentCheckpoint);

internal sealed record AriadneUiCheckpoint(
    int Version,
    int Revision,
    AriadneTranscriptLineDto[] Transcript,
    long NextPromptNumber,
    bool Restored);

internal sealed class AriadneUiChunkContributor : ISaveChunkContributor
{
    public static readonly ChunkId Chunk = new("leviathan.ariadne.ui");
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);
    private readonly AriadneUiCheckpoint? _write;
    public AriadneUiCheckpoint? Read { get; private set; }

    public AriadneUiChunkContributor(AriadneUiCheckpoint write) => _write = write;
    public AriadneUiChunkContributor() { }

    public void WriteChunks(SaveWriteContext ctx)
    {
        if (_write is not null) ctx.Add(Chunk, JsonSerializer.SerializeToUtf8Bytes(_write, Options));
    }

    public void ReadChunks(SaveReadContext ctx)
    {
        if (ctx.TryGet(Chunk, out var chunk)) Read = JsonSerializer.Deserialize<AriadneUiCheckpoint>(chunk.Payload, Options);
    }
}
