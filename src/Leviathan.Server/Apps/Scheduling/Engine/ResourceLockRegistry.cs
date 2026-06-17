using System.Collections.Concurrent;
using Leviathan.Server.Apps.Scheduling.Domain;

namespace Leviathan.Server.Apps.Scheduling.Engine;

public sealed class ResourceLockRegistry
{
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _locks = new(StringComparer.Ordinal);
    public SemaphoreSlim For(ProviderId providerId, ResourceId resourceId) => _locks.GetOrAdd($"{providerId.Value}:{resourceId.Value}", _ => new SemaphoreSlim(1, 1));
}
