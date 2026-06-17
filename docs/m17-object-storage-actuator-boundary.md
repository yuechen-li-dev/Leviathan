# M17 Object Storage Actuator and Event Boundary

## Purpose

M17 adds a small Dominatus-facing object-storage actuator boundary. Dominatus-backed agents and future app workflows can now request object operations through explicit actuation commands and receive typed, inspectable results instead of directly reaching into local filesystem paths.

This is not a replacement for platform-internal persistence. Ariadne/RustSimulator session persistence, Scheduling lifecycle persistence, manifests, checkpoints, and other trusted platform writes may continue to use `ILeviathanObjectStore` directly when they are internal implementation details.

## Existing Dominatus actuation pattern followed

Leviathan's Ariadne web dialogue bridge handles Dominatus dialogue commands by implementing `IActuationHandler<TCommand>`, returning `ActuatorHost.HandlerResult`, and using deferred completion only when UI input is pending. Dominatus `ActuatorHost` registers typed handlers, dispatches `IActuationCommand` instances, and publishes `ActuationCompleted`/typed completion events on immediate completion. Vendored Dominatus actuators use the same style: command records implement `IActuationCommand`, one handler class implements multiple `IActuationHandler<T>` interfaces, and typed payloads are returned through `CompletedWithPayload`.

The object storage actuator follows that pattern:

* command records implement `IActuationCommand`;
* `ObjectStorageActuationHandler` implements typed handlers for put/get/exists/delete/list/append;
* handler methods complete immediately with typed result records;
* object-operation events are separate typed audit records so storage decisions remain inspectable even before a durable EventBus/audit sink exists.

## Commands and results

Implemented commands under `src/Leviathan.Server/Platform/Storage/Actuation/`:

* `ObjectPutCommand`
* `ObjectGetCommand`
* `ObjectExistsCommand`
* `ObjectDeleteCommand`
* `ObjectListCommand`
* `ObjectAppendCommand`

Implemented results:

* `ObjectPutResult`
* `ObjectGetResult`
* `ObjectExistsResult`
* `ObjectDeleteResult`
* `ObjectListResult`
* `ObjectAppendResult`

Commands use explicit fields for keys, bytes/text payloads, content type, metadata, if-not-exists/overwrite flags, expected ETag, read/list limits, correlation/context fields, and optional capability identity fields. Results include normalized object keys, safe metadata, content bytes/text for small reads, list items, and controlled `ErrorCode`/`ErrorMessage` fields.

Large streaming reads/writes are intentionally deferred. M17 keeps read payloads bounded by a configurable max byte count.

## Handler behavior

`ObjectStorageActuationHandler` accepts all M17 commands, normalizes object keys with `LeviathanObjectKey`, calls `ILeviathanObjectStore`, and converts expected storage outcomes into controlled result records:

* invalid keys return `invalid_key`;
* if-not-exists/overwrite conflicts return `conflict`;
* missing reads return `not_found`;
* oversized reads return `too_large`;
* local storage exceptions return `storage_error`.

The handler never returns local filesystem paths. It exposes normalized object keys and object metadata only.

A DI helper, `AddLeviathanObjectStorageActuation`, registers the handler and the in-memory operation-event sink. A separate `RegisterLeviathanObjectStorageActuation` extension registers the handler with an `ActuatorHost` when a host wants these commands. Program startup registers the services but does not reroute internal Ariadne or Scheduling persistence through the actuator.

## Capability policy status

The current implementation is explicitly `TrustedInternal` mode. Commands carry optional `ObjectStorageCapabilityContext` fields for account id, app id, app installation id, grant id, and correlation id, and events include those values when supplied.

Real capability enforcement is deferred because the current Dominatus actuation call path does not yet carry a reliable Leviathan request/account/app-installation context into `IActuationHandler<T>` in a way that can be evaluated without faking security. The intended policy mapping is:

* put/append require `object.write`;
* get/exists require `object.read`;
* list requires `object.list`;
* delete requires `object.delete`.

M18 or a later capability milestone should connect request context into Dominatus actuation and evaluate `ILeviathanCapabilityPolicy` before storage execution. Until then, agent/app exposure must only register this handler in trusted internal hosts or behind a real policy adapter.

## Event and audit model

M17 defines `ObjectStorageOperationEvent` and `IObjectStorageOperationEventSink`. The default sink is in-memory and bounded to recent events. Events are emitted for:

* `started`
* `completed`
* `rejected`
* `failed`

Fields include operation name, normalized object key or `<invalid>`, account/app/app-installation ids when present, capability name, grant id when present, content type/length/hash where safe, result status, error code, correlation id, and timestamp.

Durable audit storage and direct Dominatus `AiEventBus` publication are deferred. The event records are shaped so a future EventBus/audit adapter can publish the same boundary decisions without changing command/result contracts.

## What remains direct object-store usage and why

Ariadne/RustSimulator persistence still uses `ILeviathanObjectStore` and the local-file implementation because Dominatus `SaveFile` remains the chunk-format authority and the current persistence adapter is intentionally path-based. Scheduling lifecycle storage also remains direct object-store usage because these writes are platform-internal state transitions, not app/agent requested object I/O.

## Known limitations

* No cloud backend or SDK was added.
* No database was added.
* No real auth/login/OAuth was added.
* Capability enforcement is not real yet; the handler is trusted-internal only.
* Payload streaming is not implemented.
* The operation-event sink is in-memory and diagnostic, not a full audit product.

## Recommended M18

Good next options:

* connect Dominatus actuation request context to `ILeviathanCapabilityPolicy` for real object capability enforcement;
* Scheduling full reschedule workflow;
* reminder/notification contract without provider integration;
* object storage cloud adapter preflight;
* product metadata/query-plane preflight.

## M18 update: capability context

M18 adds policy-enforced mode for object-storage actuation. In trusted-internal mode the M17 behavior remains available for platform/internal paths. In policy-enforced mode, the handler resolves Leviathan actuation context, maps each object command to `object.read`, `object.write`, `object.list`, or `object.delete`, calls `ILeviathanCapabilityPolicy`, returns controlled `capability_denied` results, and emits capability decision metadata on object operation events.
