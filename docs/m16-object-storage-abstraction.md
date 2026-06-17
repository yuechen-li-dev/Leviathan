# M16 Object Storage Abstraction

## Purpose

M16 introduces a platform-owned object/checkpoint storage contract while keeping the local filesystem as the only working backend. The goal is to prevent Dominatus checkpoints, manifests, app artifacts, and audit-like append streams from becoming scattered direct `File`/cloud SDK calls.

## Persistence survey and plane classification

Object/checkpoint plane:

- Ariadne/RustSimulator `checkpoint.dom1` plus `manifest.json` session metadata.
- Scheduling booking lifecycle `lifecycle.dom1` plus `lifecycle-manifest.json`.
- Audit JSONL streams are object-like append streams, but Scheduling audit remains direct file access in M16 because it is tightly coupled to product query paths and booking-specific reads.

Query/product metadata plane:

- Scheduling providers, resources, services, availability rules, holds, bookings, and booking audit query files.
- Capability grants and local-dev app installation ownership data.
- Booking indexes/list files.

Plain local-dev config:

- Environment/config-driven local-dev identity, unsafe-admin, and bootstrap capability settings.

M16 primarily abstracts the first group. Product JSON files intentionally remain direct file-backed query metadata until a separate product metadata/query-plane preflight.

## Contract

The storage contract lives in `src/Leviathan.Server/Platform/Storage` and defines:

- `LeviathanObjectKey` for normalized `/`-separated keys.
- `LeviathanObjectMetadata` for content type, timestamps, length, hash, ETag, and custom metadata.
- `LeviathanObjectWriteOptions` for overwrite, if-not-exists, expected ETag, and atomic local replacement intent.
- `LeviathanObjectReadResult` and `LeviathanObjectInfo`.
- `ILeviathanObjectStore` with `PutAsync`, `GetAsync`, `ExistsAsync`, `DeleteAsync`, `ListAsync`, and `AppendAsync`.

The contract is deliberately small and cloud-portable. Multipart upload, signed URLs, retention policies, encryption, lifecycle rules, and cloud SDKs remain out of scope.

## Local file adapter

`LocalFileLeviathanObjectStore` maps object keys under `LEVIATHAN_DATA_DIR` or the existing app data root. It rejects unsafe keys, creates directories, performs temp-file writes followed by replace/move for normal puts, supports prefix listing, and supports append for JSONL-like streams.

## Key rules and conventions

Keys are normalized to `/` separators, cannot be empty, and cannot contain `.` or `..` segments. Helpers define compatibility keys for current local-dev paths and future account/app prefixes. Future cloud-ready shapes should use forms like:

```text
accounts/{accountId}/apps/{appInstallationId}/sessions/{sessionId}/checkpoint.dom1
accounts/{accountId}/apps/{appInstallationId}/sessions/{sessionId}/manifest.json
accounts/{accountId}/apps/{appInstallationId}/scheduling/providers/{providerId}/bookings/{bookingId}/lifecycle.dom1
accounts/{accountId}/apps/{appInstallationId}/audit/{yyyy}/{mm}/events.jsonl
```

M16 preserves existing Ariadne and Scheduling data layouts for compatibility.

## Migrated call sites

- Ariadne/RustSimulator session directory and manifest paths now use object keys and the local adapter. Dominatus checkpoint bytes still go through `SaveFile.Write` at the translated local path.
- Scheduling lifecycle checkpoint and manifest paths now use object keys and the local adapter. Dominatus checkpoint bytes still go through `SaveFile.Write` at the translated local path.
- Capability names now include future object storage capabilities: `object.read`, `object.write`, `object.list`, and `object.delete`.

## Direct file access that remains

Scheduling product metadata remains in `SchedulingFileStore` as direct local files. These provider/resource/service/availability/hold/booking files are query/product metadata, not object/checkpoint storage. Migrating them now would risk expanding M16 into a query storage redesign.

Capability grant JSON and audit JSONL remain direct file access. Grants are policy metadata; audit append can later move once storage actuator/capability enforcement is explicit.

## Dominatus SaveFile/path limitation

Dominatus `SaveFile` is currently path-oriented. M16 does not replace Dominatus chunk persistence or chunk formats. The abstraction therefore translates object keys to safe local paths for the local adapter before calling `SaveFile.Write`/`SaveFile.Read`. A future Dominatus stream/object API would allow the platform object store to handle checkpoint bytes without exposing local paths to call sites.

## EventBus/actuator boundary model

Object storage should become a platform service/actuator boundary for app- or agent-requested side effects. A future Leviathan storage actuator, or a Dominatus storage actuator hosted by Leviathan, should accept commands such as:

- `ObjectPutCommand`
- `ObjectGetCommand`
- `ObjectExistsCommand`
- `ObjectAppendCommand`
- `ObjectListCommand`
- `ObjectDeleteCommand`

Successful or rejected operations should emit events such as:

- `ObjectWritten`
- `ObjectRead`
- `ObjectAppendWritten`
- `ObjectDeleted`
- `ObjectWriteRejected`

The EventBus should observe storage side effects as durable platform events with object key, account/app scope, content metadata, decision/correlation IDs, and no raw secret payloads. Internal platform persistence, including hidden runtime checkpoint writes, can stay behind server services and does not need to be exposed as app-agent commands.

## Capability integration

Future app/agent storage operations should require capability grants such as `object.read`, `object.write`, `object.list`, and `object.delete`, with scoped variants such as `app.object.write` if needed. Internal M16 platform persistence does not enforce capability checks because it is not externally requested app behavior.

Capability policy should gate cross-account/cross-app access by comparing request context, app installation scope, object prefix, and requested operation before any actuator performs the storage side effect.

## Cloud adapter requirements

Future S3/R2/Azure Blob/GCS adapters should implement the same contract without changing app logic. They must preserve key normalization, support conditional writes when possible, map ETag/version metadata, return content length and timestamps, implement prefix listing, and document consistency/concurrency behavior.

## Known limitations

- Dominatus checkpoint writes are still path-based under the local adapter.
- Append is local-file append and not a cross-cloud atomic append contract.
- Product/query metadata remains file-specific and intentionally outside the object abstraction.
- No storage actuator implementation exists yet; M16 defines the design boundary and object store service.

## Recommended M17

- Add a storage actuator command/event skeleton with EventBus observation.
- Run cloud adapter preflight for S3/R2/Azure/GCS semantics.
- Run product metadata/query-plane preflight.
- Continue Scheduling reschedule/reminder contract work.
