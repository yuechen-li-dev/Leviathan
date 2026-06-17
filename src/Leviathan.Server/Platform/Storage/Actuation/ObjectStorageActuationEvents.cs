namespace Leviathan.Server.Platform.Storage.Actuation;

public sealed record ObjectStorageOperationEvent(
    string Kind,
    string Operation,
    string? ObjectKey,
    string? AccountId,
    string? AppId,
    string? AppInstallationId,
    string? CapabilityName,
    string? CapabilityGrantId,
    bool? CapabilityAllowed,
    string? CapabilityReasonCode,
    string? ActorUserId,
    string? ContentType,
    long? ContentLength,
    string? ContentHash,
    string? ResultStatus,
    string? ErrorCode,
    string? CorrelationId,
    DateTimeOffset OccurredAt);

public interface IObjectStorageOperationEventSink
{
    void Publish(ObjectStorageOperationEvent operationEvent);
}

public sealed class InMemoryObjectStorageOperationEventSink : IObjectStorageOperationEventSink
{
    private readonly object _lock = new();
    private readonly List<ObjectStorageOperationEvent> _events = [];
    public IReadOnlyList<ObjectStorageOperationEvent> RecentEvents { get { lock (_lock) return _events.ToArray(); } }
    public void Publish(ObjectStorageOperationEvent operationEvent)
    {
        lock (_lock)
        {
            _events.Add(operationEvent);
            if (_events.Count > 100) _events.RemoveAt(0);
        }
    }
}
