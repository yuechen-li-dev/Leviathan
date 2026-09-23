# Telos X0: identity and project persistence

## Verdict

**Meaningful progression.** The real browser path now supports ASP.NET Identity sign-up/sign-in, personal accounts, a Helios installation, account-scoped projects, immutable source revisions, stale-save conflict, browser return, server restart, rebuild, and STEP export. The PostgreSQL migration and S3-compatible adapter are implemented but have not been run against live PostgreSQL/S3 here. The Docker engine is stopped and no deployment host, domain, or object-store credentials were available, so this is not a production deployment claim.

## Ownership

| Authority | Owner |
| --- | --- |
| User credentials, cookies, account, membership, installation, project metadata, revision pointer, project audit | Leviathan |
| Firmament source bytes | Leviathan object store, scoped to account/installation/project |
| Firmament semantics, editor, 3D viewport, rebuild, STEP export | HeliosCAD through public Aetheris Web SDK |
| Existing Ariadne and Scheduling Dominatus checkpoints | Existing local path-based persistence |

The project API is generic text-source storage. Leviathan registers the Helios app manifest but contains no CAD geometry or Firmament parser.

## Authentication and tenancy

`/api/auth/register`, `/login`, `/logout`, `/me`, and `/csrf` use ASP.NET Core Identity with its password hasher, sign-in manager, lockout, and cookie middleware. Registration creates an opaque user ID, personal account, Owner membership, and active Helios installation in one relational transaction. Requests derive the default account from the authenticated user and recheck membership. Project queries also require an active installation and scope every lookup by account. The browser does not submit ownership IDs.

Cookie mutations require the ASP.NET antiforgery token in `X-CSRF-TOKEN`. The browser refreshes its token after sign-in or registration because the authenticated principal changes. Production uses Secure, HttpOnly `__Host-` cookies and a same-origin HTTPS Caddy edge. Development uses separate cookie names compatible with HTTP localhost. Production refuses `LEVIATHAN_ALLOW_UNSAFE_ADMIN=true`; the existing unsafe Scheduling path remains explicit in Development. Production CORS has no wildcard policy; optional `LEVIATHAN_ALLOWED_ORIGINS` is an explicit allowlist.

The first account path does not yet include email verification, password recovery email delivery, account switching, or organization administration. Use a protected deployment and add delivery/recovery before inviting broad public sign-ups.

## Query and object planes

EF Core owns users/Identity tables, accounts, memberships, app installations, projects, revisions, and project audit records. Production selects Npgsql via `LEVIATHAN_POSTGRES_CONNECTION` and applies checked-in PostgreSQL migrations at startup. Development without that setting uses SQLite `EnsureCreated` in a fresh local data directory; SQLite is not the production schema authority and does not upgrade an older development database in place.

Source is stored under `accounts/{accountId}/apps/{installationId}/projects/{projectId}/source/{revisionId}` through `ILeviathanObjectStore`. Every revision has SHA-256 and an immutable object key. Save writes the object first, then conditionally updates the relational revision pointer in a transaction. A stale expected revision returns 409. If the object write succeeds but the DB update fails, the old pointer remains authoritative and the new object is an unreachable orphan; it cannot overwrite a committed revision. Project delete is a soft tombstone. Successful create/open/save/delete each write a bounded relational audit record and structured log.

Local development uses `LocalFileLeviathanObjectStore`. Production selects `S3LeviathanObjectStore` when `LEVIATHAN_S3_BUCKET` is set, using the AWS .NET SDK against an HTTPS S3-compatible endpoint. Required settings are `LEVIATHAN_S3_ENDPOINT`, `LEVIATHAN_S3_BUCKET`, `LEVIATHAN_S3_ACCESS_KEY`, `LEVIATHAN_S3_SECRET_KEY`, and optionally `LEVIATHAN_S3_REGION` (default `auto`). Existing Dominatus path-based checkpoint code still resolves the local adapter explicitly; its migration to cloud object storage remains separate.

## APIs and health

`GET /api/projects`, `POST /api/projects`, `GET /api/projects/{id}`, `PUT /api/projects/{id}`, and `DELETE /api/projects/{id}` serve the current account. The create body has `appId`, `name`, and `source`; save has `expectedRevisionId` and `source`. Reads verify the object hash. `/health/live` reports process liveness; `/health/ready` checks database connectivity and object-store listing without exposing a key or credential.

## Qualification and remaining gate

- `dotnet test tests/Leviathan.Server.Tests/Leviathan.Server.Tests.csproj`: 51/51 pass, including old Scheduling/Ariadne/object-storage tests and new restart, tenancy, stale-save, and CSRF witnesses.
- HeliosCAD `npm test`: 26/26 editor component tests pass; `npm run build` passes.
- HeliosCAD `npm run test:e2e`: Chrome passes sign-up → create → source edit → save → fresh browser context/sign-in → exact source reopen → rebuild → STEP download. The .NET test independently restarts the server against the same data root and reopens the saved source.
- `docker compose config --quiet`: production Compose parses with placeholder configuration. Docker image build, live PostgreSQL migration, S3 round trip, TLS/DNS, and deployment have not been verified because the Docker daemon is stopped and no target or object-store credentials were provided.
- `dotnet ef migrations script --idempotent` generated PostgreSQL DDL containing the Identity, Projects, and ProjectAudits tables; the script was not applied to a live database.

The remaining deployment gate is a real host/domain and S3-compatible bucket with credentials. Run the production Compose stack there, exercise `/health/ready`, then repeat the browser witness against the public HTTPS URL before calling X0 accepted.

## Reuse audit

Owned source reused: Leviathan request-context and app-installation shapes, app registry, `ILeviathanObjectStore`, local file adapter, Aetheris public SDK and X1 Helios editor. Owned source modified: Leviathan server and the copied Helios product shell. Commodity components: ASP.NET Core Identity, antiforgery, EF Core, Npgsql, SQLite for local tests, AWS S3 SDK, React/Vite/Three.js, and Playwright. No custom password hashing, auth protocol, CAD kernel, relational mapper, or parallel object-store contract was added.
