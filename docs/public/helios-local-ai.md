# Helios local AI host

Leviathan can connect Helios to an installed Codex client, Claude Code/Antigravity native chat, or machine-local provider keys. Enable this only for a local desktop/development host. The hosted account, installation and CSRF checks remain in force.

The Helios standalone bundle enables the local profile automatically. Run its
`Helios` launcher; it opens the bundled frontend in your browser and signs that
browser into a local identity through a launch capability. No registration,
PostgreSQL, S3 or development environment is needed. The host uses local SQLite
and filesystem storage, binds only to `127.0.0.1`, rejects foreign origins/hosts,
and retains the normal authenticated project and CSRF contracts. **Quit Helios**
stops the host and its active AI tasks. This is separate from the cloud profile,
which still requires its production infrastructure and HTTPS cookies.

The following commands are for source-workspace development, not for running a
downloaded standalone bundle.

```powershell
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:HELIOS_LOCAL_AI = 'true'
$env:LEVIATHAN_DATA_DIR = Join-Path $PWD 'artifacts/local/helios-data'
dotnet run --project src/Leviathan.Server --no-launch-profile --urls http://127.0.0.1:5189
```

The server requires explicit loopback URLs when local AI is enabled, including any configured Kestrel endpoints. Local settings and agent operations also require a loopback peer and host name. Keep the Helios development frontend on loopback too. The server does not trust forwarded addresses to establish machine-local authority.

Configuration lives in the OS application-data directory at `Aetheris/Helios/helios.toml`, overridable with `HELIOS_CONFIG_FILE`. The public [Helios connection guide](../../../HeliosCAD/docs/public/ai-connections.md) describes the TOML fields and user workflow. Only this host reads credentials. API provider calls still use the maintained Dominatus conversation clients. Credential tests query provider catalogs without requesting inference and return redacted status.

The installed-agent boundary is `ILocalAuthorAgent`. The Codex adapter uses newline-delimited app-server RPC over a task-scoped child process. It requires a ChatGPT account, obtains the model catalog from that client, and does not read auth files or fall back to API credentials. Codex owns its agent loop; Helios owns the candidate tools, revision checks and application transaction. The adapter disables shell execution, inherited MCP connectors, hooks and plugins for the candidate task. Unknown interactive requests fail without granting more permissions.

The browser obtains a short-lived, user-bound, single-use connection ticket through an authenticated CSRF-protected POST. The WebSocket channel carries Helios task events and candidate tool results; vendor RPC stays inside the adapter. A closed channel or cancellation ends the child process tree. No daemon or scheduled cleanup is installed. Other installed-agent adapters can implement the same boundary without changing project/tool authority or adopting ACP as a core schema.

Claude Code, Claude Desktop local MCP and Antigravity use `DesktopAuthorConnections` and the official managed MCP SDK. Their native clients own the agent loop, subscription and model choice. An authenticated local browser creates an eight-hour, owner/client-bound capability through `/api/helios/author/local/pair`; it can explicitly revoke it through `/unpair`. Native requests use the capability in the Authorization header on `/api/helios/author/local/mcp`, not a browser cookie. Local-origin/peer checks cover the entire MCP route subtree.

The MCP endpoint is stateless at the wire level and exposes the existing `AuthorTools()` schema plus `task_context` and `finish_task`. Candidate lifetimes remain in the existing authenticated WebSocket task. Idle native clients receive no project source. Calls serialize within that candidate; edits invalidate successful-build admission, and finishing requires another successful build. Browser Stop, host shutdown, pairing revocation and cancellation of an in-flight native request close the candidate. These modes own no desktop processes and do not terminate user applications. The MCP capability authenticates tool access, not the user's provider account or subscription entitlement.

Claude Code project MCP and ordinary Claude Desktop Chat are separate setup surfaces. The Desktop entry launches this server executable with `--helios-desktop-mcp --endpoint <loopback-url>` and `HELIOS_DESKTOP_CAPABILITY` in its environment. The early stdio mode does not start Kestrel, initialize the application database or read provider credentials. `DesktopMcpStdio` uses the official SDK client/server to relay schemas and tool calls unchanged to the HTTP endpoint. The Desktop host owns this reusable helper process; stdin EOF closes it and releases its upstream transport. Do not use a cloud connector URL or assume a Cowork VM shares the Windows loopback interface. See the public connection guide for exact client setup and support boundaries.

Local AI settings and process-launching endpoints are disabled by default on a
normal server and enabled by the explicit standalone launcher profile. Do not
publicly proxy a local host. The hosted environment-credential path remains
supported separately. Desktop MCP stdio mode runs before local profile startup;
it never acquires the launcher lease, starts another web host, or opens a browser.
