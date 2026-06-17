using Dominatus.Core.Runtime;

namespace Leviathan.Server.Platform.Storage.Actuation;

public sealed record ObjectStorageCapabilityContext(
    string? AccountId = null,
    string? AppId = null,
    string? AppInstallationId = null,
    string? CapabilityGrantId = null,
    string? CorrelationId = null);

public sealed record ObjectPutCommand(
    string Key,
    byte[]? Bytes = null,
    string? Text = null,
    string? ContentType = null,
    IReadOnlyDictionary<string, string>? Metadata = null,
    bool Overwrite = true,
    bool IfNotExists = false,
    string? ExpectedETag = null,
    ObjectStorageCapabilityContext? Context = null) : IActuationCommand;

public sealed record ObjectGetCommand(
    string Key,
    int? MaxBytes = null,
    bool IncludeText = true,
    ObjectStorageCapabilityContext? Context = null) : IActuationCommand;

public sealed record ObjectExistsCommand(string Key, ObjectStorageCapabilityContext? Context = null) : IActuationCommand;
public sealed record ObjectDeleteCommand(string Key, ObjectStorageCapabilityContext? Context = null) : IActuationCommand;
public sealed record ObjectListCommand(string Prefix, int? MaxResults = null, ObjectStorageCapabilityContext? Context = null) : IActuationCommand;

public sealed record ObjectAppendCommand(
    string Key,
    byte[]? Bytes = null,
    string? Text = null,
    string? ContentType = null,
    IReadOnlyDictionary<string, string>? Metadata = null,
    ObjectStorageCapabilityContext? Context = null) : IActuationCommand;

public sealed record ObjectResultMetadata(string? ContentType, long? ContentLength, string? ContentHash, string? ETag, IReadOnlyDictionary<string, string>? Custom)
{
    public static ObjectResultMetadata From(LeviathanObjectMetadata metadata) => new(metadata.ContentType, metadata.ContentLength, metadata.ContentHash, metadata.ETag, metadata.Custom);
}

public sealed record ObjectListItem(string Key, ObjectResultMetadata Metadata);

public sealed record ObjectPutResult(bool Ok, string Key, ObjectResultMetadata? Metadata = null, string? ErrorCode = null, string? ErrorMessage = null);
public sealed record ObjectGetResult(bool Ok, string Key, byte[]? Bytes = null, string? Text = null, ObjectResultMetadata? Metadata = null, string? ErrorCode = null, string? ErrorMessage = null);
public sealed record ObjectExistsResult(bool Ok, string Key, bool Exists, string? ErrorCode = null, string? ErrorMessage = null);
public sealed record ObjectDeleteResult(bool Ok, string Key, bool Deleted, string? ErrorCode = null, string? ErrorMessage = null);
public sealed record ObjectListResult(bool Ok, string Prefix, IReadOnlyList<ObjectListItem> Items, string? ErrorCode = null, string? ErrorMessage = null);
public sealed record ObjectAppendResult(bool Ok, string Key, ObjectResultMetadata? Metadata = null, string? ErrorCode = null, string? ErrorMessage = null);
