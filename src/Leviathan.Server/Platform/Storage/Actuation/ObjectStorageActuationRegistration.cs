using Dominatus.Core.Runtime;
using Microsoft.Extensions.DependencyInjection;

namespace Leviathan.Server.Platform.Storage.Actuation;

public static class ObjectStorageActuationRegistration
{
    public static IServiceCollection AddLeviathanObjectStorageActuation(this IServiceCollection services, Action<ObjectStorageActuationOptions>? configure = null)
    {
        var options = new ObjectStorageActuationOptions();
        configure?.Invoke(options);
        services.AddSingleton(options);
        services.AddSingleton<InMemoryObjectStorageOperationEventSink>();
        services.AddSingleton<IObjectStorageOperationEventSink>(sp => sp.GetRequiredService<InMemoryObjectStorageOperationEventSink>());
        services.AddSingleton<ObjectStorageActuationHandler>();
        return services;
    }

    public static ActuatorHost RegisterLeviathanObjectStorageActuation(this ActuatorHost host, ObjectStorageActuationHandler handler)
    {
        host.Register<ObjectPutCommand>(handler);
        host.Register<ObjectGetCommand>(handler);
        host.Register<ObjectExistsCommand>(handler);
        host.Register<ObjectDeleteCommand>(handler);
        host.Register<ObjectListCommand>(handler);
        host.Register<ObjectAppendCommand>(handler);
        return host;
    }
}
