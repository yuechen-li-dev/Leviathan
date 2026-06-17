# M14 Pre-Auth Identity and Ownership Shim

## Purpose

M14 adds a local-development-only Leviathan ownership shape before real authentication exists. The goal is to stop treating a Scheduling provider id as the conceptual source of mutation authority while preserving the existing unsafe local admin workflow for demos.

## What M14 is

- A deterministic local-dev actor: `user_local_dev`.
- A deterministic local-dev account: `acct_local_dev`.
- A deterministic Scheduling app installation: `inst_local_dev_scheduling`.
- A request-context accessor that returns the local-dev context only when `LEVIATHAN_ALLOW_UNSAFE_ADMIN=true`.
- Scheduling provider ownership fields that reference the platform account and app installation.
- Admin/provider mutation checks that derive ownership from request context, not request-body account ids.

## What M14 is not

M14 is not production authorization. It does not add login, passwords, OAuth, memberships, databases, payments, SMS, calendar sync, social features, marketplace features, or live LLM calls.

## Local-dev identity model

When unsafe admin mode is enabled, the platform creates a request context with:

- actor kind: `local-dev`
- user id: `user_local_dev`
- account id: `acct_local_dev`
- unsafe local-dev flag: `true`
- request id: the ASP.NET trace identifier

`GET /api/platform/local-dev/context` exposes this safe debug context while unsafe mode is enabled. It returns `unsafe_admin_disabled` with HTTP 403 when unsafe mode is disabled.

## App installation model

M14 adds a minimal platform app installation record with:

- `AppInstallationId`
- `AccountId`
- `AppId`
- `Status`
- `InstalledAt`
- `InstalledBy`
- `PersistenceScope`

For M14 this is computed deterministically in memory. No database or platform account CRUD is introduced.

## Provider ownership model

Scheduling providers now carry optional platform ownership fields:

- `AccountId`
- `AppInstallationId`

Provider creation assigns these fields from the current local-dev request context and the deterministic Scheduling app installation. Extra request-body fields such as `accountId` or `appInstallationId` are ignored because ownership is not accepted from caller input.

## Request context flow

Public booking endpoints do not require a platform context. Admin/provider endpoints require:

1. `LEVIATHAN_ALLOW_UNSAFE_ADMIN=true`;
2. a local-dev request context;
3. provider ownership matching `acct_local_dev` and `inst_local_dev_scheduling` when a provider already exists.

Providers owned by another account/app installation are hidden from admin list/fetch/mutation with safe not-found behavior.

## Admin gate behavior

The unsafe admin gate remains explicit. Disabled unsafe admin responses use:

- HTTP 403
- error code: `unsafe_admin_disabled`
- copy explaining that the API is local-dev only and requires `LEVIATHAN_ALLOW_UNSAFE_ADMIN=true`

Successful unsafe admin responses continue to include `X-Leviathan-Unsafe-Admin: local-dev-only`.

## Public vs admin endpoints

Public Scheduling endpoints continue to resolve providers by public slug without admin context. They return public provider/service/slot data and remain suitable for local demo booking flows.

Admin endpoints for provider setup, resource creation, service creation, resource assignment, availability rules, booking lists, and provider fetch/list require the unsafe local-dev context and ownership checks.

## Migration/backfill behavior

Existing local/dev provider JSON records may not include `AccountId` or `AppInstallationId`. M14 treats missing ownership as legacy local-dev data and backfills it in admin responses/checks to `acct_local_dev` and `inst_local_dev_scheduling`. This keeps old demo data usable without a database migration. The backfill is intentionally lightweight and does not rewrite every old file on read.

## Tests added

M14 backend coverage verifies:

- local-dev context exists when unsafe admin is enabled;
- provider creation assigns local account/app installation automatically;
- request-body account/app installation ids are ignored as authority;
- admin list/fetch hides records owned by another owner;
- legacy provider records are backfilled in admin reads;
- public provider lookup by slug remains open;
- unsafe admin disabled blocks context and provider mutation with `unsafe_admin_disabled`;
- existing registry, booking, cancellation, timezone, lifecycle, and persistence tests continue to pass.

## Known limitations

- There is still no real authentication, membership, role, or capability policy evaluator.
- Ownership is deterministic local-dev structure, not production tenancy isolation.
- Legacy ownership backfill is runtime handling rather than a durable migration.
- Public booking endpoints still accept provider/resource/service ids where existing flows require them.
- Local JSON storage remains single-process development storage.

## Recommended M15

Add a capability model skeleton: capability records, grants, a policy evaluator, app-requested capabilities, and an audit envelope, still without external providers.
