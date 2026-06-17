using System.Security.Cryptography;
using Microsoft.Extensions.Options;

namespace Leviathan.Server.Platform.Storage;

public sealed class LeviathanObjectStoreOptions { public string? RootPath { get; set; } }

public class LeviathanObjectStorageException(string message, Exception? inner = null) : Exception(message, inner);
public sealed class LeviathanObjectConflictException(string message) : LeviathanObjectStorageException(message);

public sealed class LocalFileLeviathanObjectStore : ILeviathanObjectStore
{
    public string RootPath { get; }
    public LocalFileLeviathanObjectStore(IConfiguration config, IWebHostEnvironment env, IOptions<LeviathanObjectStoreOptions>? options = null)
    {
        var configured = options?.Value.RootPath ?? config["LEVIATHAN_DATA_DIR"] ?? Environment.GetEnvironmentVariable("LEVIATHAN_DATA_DIR");
        RootPath = Path.GetFullPath(string.IsNullOrWhiteSpace(configured) ? Path.Combine(env.ContentRootPath, "data") : configured);
    }

    public async Task PutAsync(LeviathanObjectKey key, byte[] content, LeviathanObjectMetadata? metadata = null, LeviathanObjectWriteOptions? options = null, CancellationToken ct = default)
    {
        options ??= new();
        var path = PathFor(key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        if (options.IfNotExists && File.Exists(path)) throw new LeviathanObjectConflictException($"Object '{key}' already exists.");
        if (!options.Overwrite && File.Exists(path)) throw new LeviathanObjectConflictException($"Object '{key}' already exists.");
        var tmp = path + "." + Guid.NewGuid().ToString("n") + ".tmp";
        try
        {
            if (options.AtomicReplace)
            {
                await File.WriteAllBytesAsync(tmp, content, ct);
                File.Move(tmp, path, overwrite: options.Overwrite || options.IfNotExists);
            }
            else await File.WriteAllBytesAsync(path, content, ct);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            TryDelete(tmp); throw new LeviathanObjectStorageException($"Could not write object '{key}'.", ex);
        }
    }

    public async Task<LeviathanObjectReadResult?> GetAsync(LeviathanObjectKey key, CancellationToken ct = default)
    {
        var path = PathFor(key); if (!File.Exists(path)) return null;
        var bytes = await File.ReadAllBytesAsync(path, ct);
        return new(key, bytes, Metadata(path, bytes));
    }
    public Task<bool> ExistsAsync(LeviathanObjectKey key, CancellationToken ct = default) => Task.FromResult(File.Exists(PathFor(key)));
    public Task DeleteAsync(LeviathanObjectKey key, CancellationToken ct = default) { var path = PathFor(key); if (File.Exists(path)) File.Delete(path); return Task.CompletedTask; }
    public async IAsyncEnumerable<LeviathanObjectInfo> ListAsync(LeviathanObjectKey prefix, [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct = default)
    {
        var dir = Directory.Exists(PathFor(prefix)) ? PathFor(prefix) : Path.GetDirectoryName(PathFor(prefix))!;
        if (!Directory.Exists(dir)) yield break;
        foreach (var path in Directory.EnumerateFiles(dir, "*", SearchOption.AllDirectories))
        {
            ct.ThrowIfCancellationRequested();
            var key = KeyFor(path);
            if (key.Value.StartsWith(prefix.Value, StringComparison.Ordinal)) yield return new(key, Metadata(path));
            await Task.Yield();
        }
    }
    public async Task AppendAsync(LeviathanObjectKey key, byte[] content, LeviathanObjectMetadata? metadata = null, CancellationToken ct = default)
    { var path = PathFor(key); Directory.CreateDirectory(Path.GetDirectoryName(path)!); await File.AppendAllTextAsync(path, System.Text.Encoding.UTF8.GetString(content), ct); }

    public string PathFor(LeviathanObjectKey key)
    {
        var path = Path.GetFullPath(Path.Combine(new[] { RootPath }.Concat(key.Value.Split('/')).ToArray()));
        if (!path.StartsWith(RootPath + Path.DirectorySeparatorChar, StringComparison.Ordinal) && path != RootPath) throw new ArgumentException($"Object key '{key}' escapes root.", nameof(key));
        return path;
    }
    public LeviathanObjectKey KeyFor(string path) => new(Path.GetRelativePath(RootPath, Path.GetFullPath(path)).Replace(Path.DirectorySeparatorChar, '/'));
    private static LeviathanObjectMetadata Metadata(string path, byte[]? bytes = null) { var info = new FileInfo(path); var content = bytes ?? File.ReadAllBytes(path); return new(null, info.CreationTimeUtc, info.LastWriteTimeUtc, info.Length, Convert.ToHexString(SHA256.HashData(content)).ToLowerInvariant(), $"\"{info.Length:x}-{info.LastWriteTimeUtc.Ticks:x}\""); }
    private static void TryDelete(string path) { try { if (File.Exists(path)) File.Delete(path); } catch { } }
}
