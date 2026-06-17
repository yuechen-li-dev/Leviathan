# M13 Account, Capability, and Storage Preflight

## Summary

M13 is a design preflight for the next Leviathan platform layer. It does not implement authentication, a database, payments, SMS, external calendar sync, live LLM calls, or marketplace features. The goal is to preserve the current app/platform separation while defining where account authority, capability grants, connected accounts, object storage, query storage, Semantic Kernel integrations, and future payment authority belong.

The headline decisions are:

- Leviathan owns identity, account/organization membership, app installation, capability grants, connected-account consent, and future payment authority.
- Apps own app-specific product data and domain workflows. Scheduling owns providers, resources, services, availability, holds, bookings, cancellation policy, and public booking semantics.
- Dominatus owns runtime/workflow truth: state machines, sessions, lifecycle checkpoints, blackboards, and actuation boundaries.
- Semantic Kernel is an optional integration/tool substrate behind authorized Dominatus actuators; it must not become the app architecture or the source of platform authority.
- Dominatus chunks and lifecycle checkpoints remain object-plane truth and should be generalized toward object-store adapters, not replaced by SQLite.
- A query/index/product metadata plane is eventually justified for users, accounts, installations, grants, provider indexes, bookings, entitlements, reporting, and payment ledgers, but SQLite/Postgres is not needed for M13 because the current milestone is a spec and no current query problem requires a database.

## Current Assumptions

Current Leviathan already separates platform app discovery from app-specific product APIs:

- The backend app manifest carries `appId`, display metadata, runtime id, frontend route, persistence scope, capability strings, and metadata. RustSimulator uses `ariadne/rust_simulator`; Scheduling uses `scheduling`.
- `/api/apps` exposes registered app manifests. RustSimulator also implements app session APIs through the generic `/api/apps/{appId}/sessions` family; Scheduling implements typed product APIs under `/api/apps/scheduling`.
- Scheduling provider/admin endpoints are intentionally unsafe and gated by `LEVIATHAN_ALLOW_UNSAFE_ADMIN=true`. When allowed, responses add `X-Leviathan-Unsafe-Admin: local-dev-only`.
- Public Scheduling endpoints are open: provider lookup by slug, public services, slot generation, holds, intake, confirmation, booking lookup, ICS export for confirmed bookings, and lifecycle/audit reads where ids are supplied.
- Scheduling persists app product data under `<data-root>/scheduling/providers/<providerId>/...` as JSON and JSONL files.
- Scheduling lifecycle checkpoints are Dominatus chunk files (`lifecycle.dom1`) stored beside holds or bookings, with safe summary manifests for operator/debug use.
- RustSimulator/Ariadne sessions persist Dominatus chunks as `checkpoint.dom1` beside a Leviathan `manifest.json` and a companion UI chunk.
- The current `Provider` effectively acts like a business/account stand-in in local demos, but it is only an app-specific Scheduling domain record. It must not become the platform account model.
- Future auth insertion is hardest around provider-admin Scheduling routes because they currently accept only provider ids and the unsafe env gate, not account membership, role, or capability checks.

## Identity / Account Model

Recommended future entities:

| Entity | Owner | Purpose |
| --- | --- | --- |
| `LeviathanUser` | Platform | A human or service principal that can authenticate. It has stable identity, login methods, display/contact fields, and security posture. |
| `LeviathanAccount` | Platform | The billing/ownership/security boundary. It can represent an individual, organization, business, household, or developer workspace. |
| `Organization` / `Business` / `ProviderOwner` | Platform concept, optional naming layer | A business-facing account subtype or profile. Do not encode Scheduling-only assumptions in platform core. |
| `Membership` / `AppRole` | Platform | Maps users to accounts and roles such as owner, admin, developer, operator, support, or app-specific roles delegated through app policy. |
| `AppInstallation` | Platform | Records that an app is enabled for an account, including app id, installation id, lifecycle status, installed-by user, data scope, and granted platform capabilities. |
| `ProviderProfile` | Scheduling app | A Scheduling-owned public/provider profile attached to one account/app installation. It contains slug, display name, timezone, public description, contact hints, and booking policy. |
| `ConnectedAccount` | Platform | OAuth/API/provider connection such as Microsoft Graph, Google Calendar, Stripe, email provider, SMS provider, or Home Assistant. Stores consent metadata and token references. |
| `CapabilityGrant` | Platform | Durable grant from an account/owner/admin to an app installation for a capability, scope, provider/integration, expiration, and audit policy. |
| `ApiSession` / `LoginSession` | Platform | Authenticated request/session context: user id, account selection, auth method, assurance, expiration, and effective grants. |

A user is the authenticated actor. An account is the ownership boundary. A Scheduling provider is not an account; it is an app-specific profile owned through a Scheduling app installation under a Leviathan account. One account can install many apps. Multiple apps share user/account identity and platform grants, but they do not share app-specific domain data unless a platform capability explicitly authorizes an integration.

Platform core should own users, accounts, memberships, app installations, connected accounts, capability grants, login sessions, audit envelope shape, and app registry contracts. App-specific data should remain with each app: Scheduling providers/resources/services/availability/bookings; RustSimulator authored sessions/transcripts; future app domain records.

Local/dev mode before real auth should model a single implicit developer/operator only for unsafe demos. It should be named `local-dev-unsafe`, not `admin`, in docs and responses wherever possible. It must not be described as production authorization.

## App Installation and Ownership Model

`AppInstallation` is the bridge between platform ownership and app state:

```text
LeviathanAccount
  ├─ memberships: LeviathanUser + role
  ├─ app installations
  │   ├─ scheduling installation
  │   │   └─ Scheduling ProviderProfile(s)
  │   └─ rust_simulator installation/session scope
  └─ capability grants / connected accounts
```

Rules:

- An app manifest describes app capability and runtime shape globally; an app installation records account-specific enablement.
- App installation ids should be stable and distinct from app ids. Example: `inst_...` for account `acct_...` and app `scheduling`.
- App-specific records should carry `accountId` and/or `appInstallationId` once auth exists. Until then, file layout can continue using provider ids but should not introduce more provider-as-account assumptions.
- Public routes such as `/book/{providerSlug}` resolve to Scheduling provider profiles and should never expose platform account internals.
- Provider-admin APIs should eventually derive provider authority from authenticated membership + app installation + app role/capability, not from a submitted `providerId` alone.

## Capability / Permission Model

Keep the first model small and explicit:

```text
CapabilityGrant {
  grantId,
  accountId,
  appInstallationId,
  capability,
  scope,
  provider/integration,
  connectedAccountId?,
  grantedByUserId,
  createdAt,
  expiresAt?,
  status,
  auditLevel,
  revocationPolicy
}
```

Representative capabilities:

| Capability | Owner / granter | Grantee | Scope | Provider/integration | Audit | Revocation | Level |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `calendar.read` | Account owner/admin or connected-account owner | App installation | Account, provider, resource, calendar id, date range | Microsoft Graph/Google/local later | Required for reads affecting availability | Stop future reads; keep historical audit | Platform |
| `calendar.write` | Account owner/admin + connected-account consent | App installation | Calendar id, event types, provider/resource | Graph/Google later | Required per write | Stop writes; do not delete historical events unless explicit | Platform |
| `graph.outlook.calendar` | Microsoft consent owner + account admin | App installation | Tenant/user mailbox/calendar ids | Microsoft Graph | Required, include Graph operation/correlation | Revoke token and deny actuator | Platform |
| `payment.checkout` | Account owner/admin with payment setup | App installation | Booking policy, amount bounds, currency, provider profile | Stripe/Block/PayPal later | Required, ledger-linked | Stop checkout creation | Platform |
| `payment.refund` | Account owner/admin, possibly higher assurance | App installation | Booking/payment ids, max amount, time window | Payment provider later | Required, ledger-linked | Stop refunds, preserve ledger | Platform |
| `notification.send` | Account owner/admin | App installation | Template ids, recipients classes | Provider-neutral | Required for external send | Stop sends; keep delivery logs | Platform |
| `email.send` | Account owner/admin + connected email consent | App installation | From address/domain, templates | Graph/SMTP/provider | Required | Revoke token/grant | Platform |
| `sms.send` | Account owner/admin + phone/provider setup | App installation | Approved templates, phone regions | SMS provider later | Required | Stop sends; preserve opt-out history | Platform |
| `file.read` / `file.write` | Account owner/admin | App installation | Object prefix, app scope, content class | Local/object storage | Required for cross-scope access | Deny new access | Platform for cross-app, app-level within app scope |
| `llm.call` | Account owner/admin/developer | App installation | Model/provider, budget, prompt class, data class | LLM provider | Required with request hash/cassette where possible | Stop calls; keep audit/cost records | Platform |
| `homeassistant.service.call` | Account owner/admin + connected HA owner | App installation | Service/domain/entity allowlist | Home Assistant | Required per service call | Deny actuator | Platform |
| `admin.provider.configure` | Account owner/admin | Scheduling app role | Provider ids/profile settings | Scheduling | Required for config mutation | Remove admin UI/API access | App-level grant mediated by platform |

The platform should evaluate platform capabilities before invoking cross-system actuators. Apps can define app roles and domain checks, but platform capabilities must gate external authority, connected accounts, payment authority, cross-app data, and dangerous actuation.

## Semantic Kernel and Microsoft Integration Boundary

Leviathan should use Semantic Kernel only as an integration/tool substrate when it provides useful connector abstractions, function catalogs, or Microsoft Graph tooling. Dominatus may call Semantic Kernel through allowlisted actuators when a workflow reaches an authorized actuation boundary. Neither Scheduling nor Semantic Kernel should directly own token storage, account consent, or app authorization.

Boundary rules:

- Leviathan owns connected account registration, OAuth consent metadata, token references, tenant/user binding, grant revocation, and policy checks.
- Dominatus owns workflow execution and records the state transition that requested an external action.
- Semantic Kernel exposes callable functions/plugins behind capability profiles, e.g. read Outlook availability or create calendar event.
- Scheduling requests access by declaring the needed capability (`graph.outlook.calendar`, possibly decomposed to `calendar.read` and `calendar.write`) for its app installation and provider/resource scope.
- A Dominatus actuator receives an already-authorized execution context containing app installation id, account id, capability grant id, connected account reference, allowed operation, idempotency key, and audit correlation id.
- Audit events should record requestor user/session, account, app installation, capability grant id, connected account id, actuator, external provider, operation, target resource/calendar/event ids where safe, result status, error class, idempotency key, and Dominatus checkpoint correlation.

Deferred: OAuth implementation, Microsoft Graph sync, webhook processing, token encryption/rotation, tenant admin consent UX, SK plugin registration, live LLM calls, recurrence reconciliation, and production operator tooling.

## Storage Model: Object Plane vs Query Plane

### Object/checkpoint plane

Object storage is the right persistence shape for:

- Dominatus chunks (`checkpoint.dom1`, `lifecycle.dom1`) as runtime/workflow truth.
- Lifecycle checkpoints and safe summary manifests.
- App session manifests that describe object-plane checkpoints.
- Audit snapshots and append-oriented JSONL traces when query/search is not required.
- Binary artifacts, cassettes, generated assets, debug bundles, and replay inputs/outputs.

The local file adapter should remain the development implementation. Future adapters can target S3, R2, Azure Blob, or GCS by providing object operations: put with conditional write/idempotency metadata, get by key/version, list by prefix, copy/move or logical status transitions, delete/tombstone, object metadata, content hash, and signed/internal URL support where appropriate.

Suggested generalized object key convention:

```text
accounts/{accountId}/apps/{appInstallationId}/sessions/{sessionId}/checkpoint.dom1
accounts/{accountId}/apps/{appInstallationId}/sessions/{sessionId}/manifest.json
accounts/{accountId}/apps/{appInstallationId}/scheduling/providers/{providerId}/bookings/{bookingId}/lifecycle.dom1
accounts/{accountId}/apps/{appInstallationId}/audit/{yyyy}/{mm}/events.jsonl
```

Local/dev can map the same convention under `LEVIATHAN_DATA_DIR`. Existing paths can remain until an adapter/migration milestone because M13 is a spec.

### Query/index/product metadata plane

Query/index storage is eventually appropriate for:

- Users, accounts, memberships, login sessions, app installations.
- Capability grants, connected account metadata, revocation state, and entitlements.
- Scheduling provider profiles, resources, services, availability rules, booking indexes, cancellation summaries, and reporting views.
- Payment settings, ledgers, reconciliation, provider payout settings, and subscription/entitlement state later.
- Audit search/export indexes, compliance reports, operational dashboards, and support tooling.

Local/dev JSON files remain acceptable for current Scheduling demos, RustSimulator sessions, small fixtures, append-only debug traces, and single-process development. SQLite is not needed now because M13 adds no production auth, no multi-user queries, no multi-process locking requirement, and no reporting/search feature that currently fails due to JSON files.

## Database Decision Criteria

Introduce SQLite/Postgres/etc. when at least one concrete current requirement exists:

- Multi-user authentication and account ownership queries need reliable lookup, uniqueness, and membership joins.
- Provider lists need search, filtering, pagination, slug uniqueness, or cross-account admin support.
- Booking reporting, analytics, exports, or operational dashboards need indexed queries.
- Multiple server processes or instances need cross-process locking, transactions, or lease semantics.
- Cross-app entitlements/capability grants need consistent authorization decisions.
- Payment ledger/reconciliation or provider payout settings require transactional integrity and auditability.
- Audit export/search becomes a product or compliance requirement.
- Production backup/restore, migration, retention, and data lifecycle policies need database-grade tooling.
- Concurrent writers across instances become real.

Do not introduce a database for:

- Dominatus runtime checkpoints or chunk saves.
- Single-session app state.
- Local/dev demo data.
- Append-only debug snapshots that do not need indexed search.
- Small provider fixtures.
- The mere existence of persistence.

## Payment Authority Boundary

Payments are platform authority, not arbitrary app code. Scheduling may define a `BookingPolicy` that says a service requires a deposit or prepayment, but Leviathan must own payment provider setup, connected payment accounts, payout settings, payment capability grants, risk controls, and ledger boundaries.

Future rules:

- No app talks directly to Stripe, Block/Square, PayPal, or another payment provider without a platform `payment.*` capability grant.
- Scheduling can request `payment.checkout` for a provider profile and policy; the platform authorizes and passes a constrained payment command to a Dominatus actuator.
- Refunds require a separate `payment.refund` capability and stronger audit/authorization than checkout creation.
- Webhooks, idempotency, reconciliation, disputes, partial captures, taxes, receipts, provider onboarding, and payout accounting are upstream prerequisites before production payments.
- `Dominatus.Actuators.Payments` is useful as a contract/fake-provider reference and test seam, but it is not production ready without real adapters, webhooks, persistence, and ledger guidance.

## Local / Dev Mode Policy

Until real auth exists:

- Local/dev mode may allow provider setup, resource/service/availability management, booking inspection, audit/lifecycle inspection, and cancellation for demos only.
- Unsafe routes must require `LEVIATHAN_ALLOW_UNSAFE_ADMIN=true` and should return controlled `403` errors when disabled.
- Unsafe responses should continue to include `X-Leviathan-Unsafe-Admin: local-dev-only`; future error bodies should consistently include an error code such as `unsafe_admin_disabled` and remediation copy.
- Public booking endpoints may remain open for demos, but docs must state that the server is not production safe.
- It should be impossible later to configure providers, connected accounts, payment settings, capability grants, refunds, external calendar writes, SMS sends, or provider-private reports without authenticated account membership and capability checks.
- Deployment docs should warn: do not expose a server with unsafe admin enabled; do not treat local JSON storage as production tenancy isolation; do not put real customer/payment/calendar data into local unsafe mode.

## App Modularity Rules

- App-specific domain models stay under the app module. Scheduling concepts must not leak into platform core.
- Platform owns registry, account, app installation, capability, connected account, session, audit-envelope, and storage-adapter contracts.
- Product APIs should live under `/api/apps/{appId}` or explicitly app-specific public routes such as `/book/{providerSlug}`.
- Frontend app code should live under `src/Leviathan.Web/src/apps/{appId}`.
- Shared Machina shell/dispatch/routing code remains platform-owned and should know manifests and routes, not app internals.
- Apps may use Dominatus when they need state machines, checkpoints, sessions, or actuation boundaries; apps that only need CRUD/query surfaces do not have to use Dominatus.
- App persistence scopes must be unique and must not collide. Future account/app-installation prefixes should prevent accidental cross-account sharing.
- Semantic Kernel, LLM, payment, calendar, email, SMS, and Home Assistant integrations must enter through platform-granted capabilities and Dominatus actuation boundaries, not ad hoc app calls.

## Future API Surface Sketch

Platform APIs to design later, not implement in M13:

```http
GET  /api/platform/me
GET  /api/platform/accounts
GET  /api/platform/accounts/{accountId}
GET  /api/platform/accounts/{accountId}/memberships
GET  /api/platform/accounts/{accountId}/apps
POST /api/platform/accounts/{accountId}/apps/{appId}/install
DELETE /api/platform/accounts/{accountId}/apps/{appInstallationId}

GET  /api/platform/capabilities
GET  /api/platform/accounts/{accountId}/capability-grants
POST /api/platform/accounts/{accountId}/capability-grants
DELETE /api/platform/accounts/{accountId}/capability-grants/{grantId}

GET  /api/platform/accounts/{accountId}/connected-accounts
POST /api/platform/accounts/{accountId}/connected-accounts/{provider}/authorize
DELETE /api/platform/accounts/{accountId}/connected-accounts/{connectedAccountId}

GET  /api/platform/storage/health
GET  /api/platform/audit
GET  /api/platform/audit?accountId=...&appInstallationId=...&capability=...
```

Scheduling future APIs:

```http
GET  /api/apps/scheduling/providers?accountId=...
POST /api/apps/scheduling/providers
GET  /api/apps/scheduling/providers/{providerId}
POST /api/apps/scheduling/providers/{providerId}/resources
POST /api/apps/scheduling/providers/{providerId}/services
POST /api/apps/scheduling/providers/{providerId}/availability-rules
GET  /api/apps/scheduling/providers/{providerId}/bookings
POST /api/apps/scheduling/bookings/{bookingId}/cancel
```

The future implementation should avoid trusting `accountId` query parameters alone; authenticated session context must determine effective accounts and roles.

## Scheduling Impact

Scheduling should stay app-specific. The most important future changes are additive:

- Add account/app-installation references to provider profiles when the identity shim exists.
- Replace the unsafe env-only admin boundary with authenticated membership + `admin.provider.configure` checks.
- Keep public booking routes open only for public provider profiles and public services.
- Keep resources, services, availability rules, holds, bookings, and cancellation policy in Scheduling.
- Keep Dominatus lifecycle checkpoints for booking workflows.
- Add capability requests only when external integrations appear: calendar read/write, notification/email/SMS, payment checkout/refund, or LLM-assisted workflows.
- Do not move Scheduling into platform core and do not make provider equal account.

## Risks

- Provider-as-account assumptions can harden if more routes accept raw provider ids without account context.
- Capability strings in app manifests are currently descriptive; future enforcement needs durable grants and request-time policy checks.
- Public booking endpoints are intentionally open; production readiness requires careful distinction between public booking data and provider-private data.
- Object storage adapters need idempotency, versioning, and repair policies to avoid partial checkpoint/manifest inconsistency.
- Calendar and payment integrations are deceptively large because consent, webhooks, retries, reconciliation, and audit matter more than the initial API call.
- Adding a database too early could blur runtime truth and product indexes; adding it too late could make auth/capability enforcement brittle.

## Recommended Roadmap

1. **M14: Pre-auth identity/ownership shim.** Add local account/app-installation records and wire Scheduling provider ownership in a no-real-auth mode. Keep unsafe mode explicit.
2. **M15: Capability model skeleton.** Define capability grant records, policy evaluation interfaces, audit envelopes, and app-declared requested capabilities without external providers.
3. **M16: Object storage adapter abstraction.** Generalize Dominatus/session/checkpoint object layout behind local-file adapter and specify S3/R2/Azure/GCS requirements.
4. **M17: Scheduling reschedule or reminder contract.** Choose the next product workflow that benefits from Dominatus lifecycle checkpoints, still without SMS/external calendar providers.
5. **M18: Payment/deposit contract prep.** Model booking policy/payment command boundaries against fake/provider-neutral contracts only after capability skeleton exists.
6. **M19+: Connected accounts and Microsoft Graph preflight.** Add OAuth/token/Graph design or skeleton only after platform authority and grants exist.

## Verification

M13 verification is repository health for a docs/spec-only milestone:

```bash
dotnet restore
dotnet build Leviathan.slnx
dotnet test
```

No frontend install/build/test is required because only documentation changed.
