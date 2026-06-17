# M15 Capability Model Skeleton

## Purpose

M15 adds Leviathan-owned capability records, local grants, policy evaluation, and safe audit envelopes. It creates the authority membrane for future integrations without calling Stripe, Graph, Semantic Kernel, SMS, email, calendars, LLMs, Home Assistant, or any other external provider.

## What M15 is

- Platform-owned capability names and grant records.
- A local file-backed capability grant store with a deterministic local-dev Scheduling bootstrap grant.
- A policy evaluator that turns request context, app installation, app declaration, grant status, scope, and operation metadata into allowed/denied decisions.
- Safe audit envelopes recorded in memory and JSONL under the local data root.
- Scheduling admin/provider endpoints now require `admin.provider.configure` in addition to the M14 unsafe local-dev context and ownership checks.
- Minimal local-dev/debug endpoints for well-known capabilities, grants, and recent decisions.

## What M15 is not

M15 is not production authorization. It does not add login, OAuth, roles, a database, payments, SMS, email providers, external calendar sync, Microsoft Graph, Semantic Kernel provider calls, live LLM calls, marketplace/social features, or direct app-to-provider calls.

## Capability model

The platform capability model lives in `Platform/Capabilities` and includes:

- `LeviathanCapabilityName`
- `LeviathanCapabilityGrantId`
- `LeviathanCapabilityGrant`
- `LeviathanCapabilityScope`
- `LeviathanCapabilityDecision`
- `LeviathanCapabilityAuditEnvelope`
- `CapabilityGrantStatus`
- `CapabilityAuditLevel`
- `ILeviathanCapabilityStore`
- `LeviathanLocalCapabilityStore`
- `ILeviathanCapabilityPolicy`
- `LeviathanCapabilityPolicy`

Well-known capability names include:

- `admin.provider.configure`
- `calendar.read`
- `calendar.write`
- `graph.outlook.calendar`
- `payment.checkout`
- `payment.refund`
- `notification.send`
- `email.send`
- `sms.send`
- `file.read`
- `file.write`
- `llm.call`
- `homeassistant.service.call`

Only `admin.provider.configure` is wired into a real endpoint path in M15.

## Grant fields

A grant includes:

- grant id
- account id
- app installation id
- app id
- capability name
- scope
- optional connected account id
- granted by user id
- created at
- optional expires at
- status (`Enabled`, `Disabled`, `Revoked`)
- audit level
- optional revocation reason

## Local-dev grant store

The local store reads JSON grants from:

```text
<data-root>/platform/accounts/<account-id>/capability-grants/*.json
```

It also bootstraps a deterministic local-dev grant for Scheduling:

- grant id: `grant_local_dev_scheduling_admin_provider_configure`
- account id: `acct_local_dev`
- app installation id: `inst_local_dev_scheduling`
- app id: `scheduling`
- capability: `admin.provider.configure`
- scope: account
- status: enabled

Tests can disable this bootstrap with `LEVIATHAN_LOCAL_DEV_BOOTSTRAP_CAPABILITIES=false`.

## Policy evaluator behavior

The evaluator denies when:

- request context is missing;
- an admin capability is checked while unsafe local-dev admin is disabled;
- the app does not declare the capability;
- no active matching grant exists;
- the matching grant is expired or revoked.

It allows when an enabled, unexpired grant matches account id, app installation id, capability name, and scope. Account-level scope covers M15 Scheduling admin operations. Request-body account, app installation, or grant values are not authoritative.

## Scheduling integration

Scheduling's manifest now declares `admin.provider.configure`. Admin/provider endpoints check this capability before mutation or admin reads, then retain the M14 ownership checks. Public booking and public provider endpoints remain public and do not require platform capability grants.

Integrated operations include provider list/fetch/create, resource creation, service creation/assignment, availability rule creation, and provider-side booking list.

## Audit envelope

Every policy decision creates an envelope with:

- occurred at
- account id
- app installation id
- app id
- capability
- operation
- target kind/id
- allowed/denied
- reason
- grant id when allowed
- correlation/request id

Recent decisions are retained in memory. Decisions with an account id are appended to:

```text
<data-root>/platform/accounts/<account-id>/audit/capability-events-YYYY-MM.jsonl
```

## Manifest declarations vs grants

App manifests declare possible/requested capabilities. A declaration alone does not grant authority. Grants authorize actual use after the policy evaluator confirms request context, app installation, capability declaration, status, expiration, and scope.

Scheduling still has product capability labels such as booking and local audit support, but `admin.provider.configure` is the platform authority capability for provider-admin mutation.

## Local/debug endpoints

- `GET /api/platform/capabilities`
- `GET /api/platform/local-dev/capability-grants`
- `GET /api/platform/local-dev/capability-decisions/recent`
- `GET /api/platform/local-dev/context` now includes local-dev capability grants.

Local-dev grant/decision endpoints are unavailable unless `LEVIATHAN_ALLOW_UNSAFE_ADMIN=true`.

## Known limitations

- No production auth, login, role model, OAuth, consent UI, or membership model.
- File storage is local-development storage only.
- No grant CRUD UI/API.
- Scope matching is intentionally small: account scope plus exact future provider scope.
- Audit is JSONL/in-memory diagnostic infrastructure, not a full audit product.

## Recommended M16

Object storage adapter abstraction for Dominatus chunks and app artifacts, with the local-file adapter retained and S3/R2/Azure/GCS requirements documented.

## M17 object storage actuator seam

M17 introduces object storage commands that carry optional account/app-installation/correlation context and map operations to the existing `object.read`, `object.write`, `object.list`, and `object.delete` capability names. Real enforcement is deferred until Leviathan request context reliably flows into Dominatus actuation handlers; the initial handler is registered in trusted-internal mode and documents this explicitly rather than faking security.

## M18 update: actuation capability seam

Object-storage actuation now uses the M15 capability policy in policy-enforced mode. The actuation handler resolves account/app-installation/request context, evaluates object capabilities through `ILeviathanCapabilityPolicy`, writes the existing capability audit envelope via the capability store, and mirrors the decision metadata on object operation events. Dominatus host actuation policies remain available for coarse synchronous gates; Leviathan continues to own grants and authorization decisions.


## M20 payment capability note

Scheduling now declares future `payment.checkout` and `payment.refund` capability needs. M20 does not perform external payment actuation; payment provider authority remains platform-owned and future real checkout/refund commands must be capability-gated before reaching Dominatus actuators.
