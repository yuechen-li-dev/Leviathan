using System.Net;
using System.Security.Cryptography;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;

namespace Leviathan.Server.Platform.Storage;

// S3-compatible object plane for account/project source. Existing Dominatus
// path-based checkpoints continue to use the local adapter until stream support exists.
public sealed class S3LeviathanObjectStore : ILeviathanObjectStore, IDisposable
{
    private readonly AmazonS3Client _client;
    private readonly string _bucket;

    public S3LeviathanObjectStore(IConfiguration config)
    {
        var endpoint = config["LEVIATHAN_S3_ENDPOINT"];
        var key = config["LEVIATHAN_S3_ACCESS_KEY"];
        var secret = config["LEVIATHAN_S3_SECRET_KEY"];
        _bucket = config["LEVIATHAN_S3_BUCKET"] ?? "";
        if (string.IsNullOrWhiteSpace(endpoint) || !Uri.TryCreate(endpoint, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps ||
            string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(secret) || string.IsNullOrWhiteSpace(_bucket))
            throw new InvalidOperationException("S3 object storage requires an HTTPS endpoint, bucket, access key, and secret key.");
        var region = config["LEVIATHAN_S3_REGION"] ?? "auto";
        _client = new AmazonS3Client(new BasicAWSCredentials(key, secret), new AmazonS3Config { ServiceURL = endpoint, AuthenticationRegion = region, ForcePathStyle = true });
    }

    public async Task PutAsync(LeviathanObjectKey key, byte[] content, LeviathanObjectMetadata? metadata = null, LeviathanObjectWriteOptions? options = null, CancellationToken ct = default)
    {
        options ??= new();
        using var stream = new MemoryStream(content, writable: false);
        var request = new PutObjectRequest { BucketName = _bucket, Key = key.Value, InputStream = stream, ContentType = metadata?.ContentType ?? "application/octet-stream" };
        if (options.IfNotExists || !options.Overwrite) request.IfNoneMatch = "*";
        if (options.ExpectedETag is not null) request.IfMatch = options.ExpectedETag;
        request.Metadata["sha256"] = metadata?.ContentHash ?? Hash(content);
        try { await _client.PutObjectAsync(request, ct); }
        catch (AmazonS3Exception ex) when (ex.StatusCode is HttpStatusCode.PreconditionFailed or HttpStatusCode.Conflict)
        { throw new LeviathanObjectConflictException($"Object '{key}' changed or already exists."); }
        catch (AmazonS3Exception ex) { throw new LeviathanObjectStorageException($"Could not write object '{key}'.", ex); }
    }

    public async Task<LeviathanObjectReadResult?> GetAsync(LeviathanObjectKey key, CancellationToken ct = default)
    {
        try
        {
            using var response = await _client.GetObjectAsync(new GetObjectRequest { BucketName = _bucket, Key = key.Value }, ct);
            using var stream = new MemoryStream();
            await response.ResponseStream.CopyToAsync(stream, ct);
            var bytes = stream.ToArray();
            return new(key, bytes, new(response.Headers.ContentType, null, response.LastModified, bytes.LongLength, Hash(bytes), response.ETag));
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == HttpStatusCode.NotFound) { return null; }
        catch (AmazonS3Exception ex) { throw new LeviathanObjectStorageException($"Could not read object '{key}'.", ex); }
    }

    public async Task<bool> ExistsAsync(LeviathanObjectKey key, CancellationToken ct = default)
    {
        try { await _client.GetObjectMetadataAsync(new GetObjectMetadataRequest { BucketName = _bucket, Key = key.Value }, ct); return true; }
        catch (AmazonS3Exception ex) when (ex.StatusCode == HttpStatusCode.NotFound) { return false; }
        catch (AmazonS3Exception ex) { throw new LeviathanObjectStorageException($"Could not inspect object '{key}'.", ex); }
    }

    public async Task DeleteAsync(LeviathanObjectKey key, CancellationToken ct = default)
    {
        try { await _client.DeleteObjectAsync(new DeleteObjectRequest { BucketName = _bucket, Key = key.Value }, ct); }
        catch (AmazonS3Exception ex) { throw new LeviathanObjectStorageException($"Could not delete object '{key}'.", ex); }
    }

    public async IAsyncEnumerable<LeviathanObjectInfo> ListAsync(LeviathanObjectKey prefix, [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct = default)
    {
        string? continuation = null;
        do
        {
            ListObjectsV2Response response;
            try { response = await _client.ListObjectsV2Async(new ListObjectsV2Request { BucketName = _bucket, Prefix = prefix.Value, ContinuationToken = continuation }, ct); }
            catch (AmazonS3Exception ex) { throw new LeviathanObjectStorageException($"Could not list objects under '{prefix}'.", ex); }
            foreach (var item in response.S3Objects ?? [])
                yield return new(new(item.Key), new(null, null, item.LastModified, item.Size, null, item.ETag));
            continuation = response.IsTruncated == true ? response.NextContinuationToken : null;
        } while (continuation is not null);
    }

    public async Task AppendAsync(LeviathanObjectKey key, byte[] content, LeviathanObjectMetadata? metadata = null, CancellationToken ct = default)
    {
        for (var attempt = 0; attempt < 4; attempt++)
        {
            var current = await GetAsync(key, ct);
            var combined = new byte[(current?.Content.Length ?? 0) + content.Length];
            if (current is not null) Buffer.BlockCopy(current.Content, 0, combined, 0, current.Content.Length);
            Buffer.BlockCopy(content, 0, combined, current?.Content.Length ?? 0, content.Length);
            try { await PutAsync(key, combined, metadata, new(IfNotExists: current is null, ExpectedETag: current?.Metadata.ETag), ct); return; }
            catch (LeviathanObjectConflictException) when (attempt < 3) { }
        }
        throw new LeviathanObjectConflictException($"Could not append object '{key}' after concurrent updates.");
    }

    public void Dispose() => _client.Dispose();
    private static string Hash(byte[] content) => Convert.ToHexString(SHA256.HashData(content)).ToLowerInvariant();
}
