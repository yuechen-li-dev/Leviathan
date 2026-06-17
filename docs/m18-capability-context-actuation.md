# M18 Capability Context for Dominatus Actuation

## Purpose

M18 connects Leviathan request/app-installation/capability context to Dominatus object-storage actuation. The goal is not real auth; it is to prove the seam where Dominatus commands that touch platform resources can be authorized by Leviathan-owned capability policy.

## Dominatus actuation policy survey

Dominatus Core already has a small actuation policy hook on `ActuatorHost`:

- `IActuationPolicy.Evaluate(AiCtx, IActuationCommand)` returns allow/deny before handlers run.
- `ActuatorHost.AddPolicy` installs synchronous host-level policies.
- `ActuationPolicies` provides `AllowAll`, `DenyAll`, command-type blocks, predicates, score/consideration gates, and `AllOf` composition.
- Handler registration remains simple (`ActuatorHost.Register<TCommand>`), and handler results publish `ActuationCompleted` events.

This machinery is useful as a coarse Dominatus-side gate, especially for deterministic allowlists and command blocking. It does not directly fit Leviathan grants because Leviathan capability evaluation is asynchronous, account/app-installation scoped, grant-backed, and audit-writing. M18 therefore reuses the Dominatus handler boundary and leaves the existing host policy stack available for coarse gates, while keeping grant evaluation Leviathan-owned inside the object-storage handler.

What remains Leviathan-owned:

- request/app-installation/account context resolution;
- capability names and grant semantics;
- capability policy evaluation;
- capability audit envelopes;
- safe denial results for platform resource operations.

## Actuation context model

`LeviathanActuationContext` contains:

- account id;
- app installation id;
- app id;
- actor/user id;
- request id;
- correlation id;
- local-dev flag;
- explicit trusted-internal flag;
- optional capability grant id.

`LeviathanActuationContextResolver` derives request-driven context from `ILeviathanRequestContextAccessor` and the command's app/app-installation identifiers. Command-supplied account/user values are validated against the current request context and are not trusted as authority. Tests can provide an explicit resolver. Platform-internal work must either avoid actuation or set trusted internal context explicitly.

## Object command capability mapping

Object actuation uses this mapping:

| Command | Operation | Required capability |
| --- | --- | --- |
| `ObjectPutCommand` | `put` | `object.write` |
| `ObjectAppendCommand` | `append` | `object.write` |
| `ObjectGetCommand` | `get` | `object.read` |
| `ObjectExistsCommand` | `exists` | `object.read` |
| `ObjectListCommand` | `list` | `object.list` |
| `ObjectDeleteCommand` | `delete` | `object.delete` |

The requested target is currently the safe object key under target kind `object` and account scope. Invalid keys are rejected safely before policy evaluation.

## Trusted internal vs policy-enforced mode

`ObjectStorageActuationSecurityMode.TrustedInternal` preserves M17-style behavior for platform-internal/test paths. It is explicit and records a `trusted_internal` decision in result/event metadata.

`ObjectStorageActuationSecurityMode.PolicyEnforced` requires a resolved Leviathan actuation context and calls `ILeviathanCapabilityPolicy`. Missing context or missing policy returns a controlled denied result rather than pretending security was enforced.

## Denial behavior

Denied object operations return typed results with:

- `Ok = false`;
- `ErrorCode = capability_denied`;
- safe message: `Object operation was denied by Leviathan capability policy.`;
- `ObjectCapabilityDecision` metadata containing capability, allowed=false, reason code, grant id when applicable, and correlation id.

Denied operations do not perform storage writes/deletes/appends.

## Event/audit metadata

Object operation events now include capability decision metadata:

- capability name;
- allowed/denied flag;
- reason code;
- grant id when allowed;
- account id;
- app id;
- app installation id;
- actor user id;
- correlation id;
- operation;
- safe object key;
- result status/error code.

The handler calls `ILeviathanCapabilityPolicy`, so policy-enforced operations also flow through the M15 capability audit envelope/store path. Object events mirror enough of that shape for local diagnostics without adding a durable audit product.

## Known limitations

- This is local-dev/pre-auth only; no login/OAuth is introduced.
- Object keys currently use account scope for capability checks; narrower object-prefix grants are deferred.
- Dominatus `IActuationPolicy` remains synchronous, so it is not used for async grant evaluation in M18.
- Only object-storage actuation is wired through this seam.
- Trusted-internal mode is still available for internal/platform tests and must not be treated as app/user enforcement.

## Recommended M19

Good next milestones:

- Scheduling reschedule workflow.
- Reminder/notification contract without provider integration.
- Object storage cloud adapter preflight.
- Product metadata/query-plane preflight.
