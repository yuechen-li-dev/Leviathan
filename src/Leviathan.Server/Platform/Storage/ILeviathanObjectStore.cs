using System.Runtime.CompilerServices;

namespace Leviathan.Server.Platform.Storage;

public sealed record LeviathanObjectMetadata(string? ContentType = null, DateTimeOffset? CreatedAt = null, DateTimeOffset? UpdatedAt = null, long? ContentLength = null, string? ContentHash = null, string? ETag = null, IReadOnlyDictionary<string, string>? Custom = null);
public sealed record LeviathanObjectWriteOptions(bool Overwrite = true, bool IfNotExists = false, string? ExpectedETag = null, bool AtomicReplace = true);
public sealed record LeviathanObjectReadResult(LeviathanObjectKey Key, byte[] Content, LeviathanObjectMetadata Metadata);
public sealed record LeviathanObjectInfo(LeviathanObjectKey Key, LeviathanObjectMetadata Metadata);

public interface ILeviathanObjectStore
{
    Task PutAsync(LeviathanObjectKey key, byte[] content, LeviathanObjectMetadata? metadata = null, LeviathanObjectWriteOptions? options = null, CancellationToken ct = default);
    Task<LeviathanObjectReadResult?> GetAsync(LeviathanObjectKey key, CancellationToken ct = default);
    Task<bool> ExistsAsync(LeviathanObjectKey key, CancellationToken ct = default);
    Task DeleteAsync(LeviathanObjectKey key, CancellationToken ct = default);
    IAsyncEnumerable<LeviathanObjectInfo> ListAsync(LeviathanObjectKey prefix, CancellationToken ct = default);
    Task AppendAsync(LeviathanObjectKey key, byte[] content, LeviathanObjectMetadata? metadata = null, CancellationToken ct = default);
}
