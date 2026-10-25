using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text.Json;
using Leviathan.Server.Platform.Identity;
using Leviathan.Server.Platform.Persistence;
using Leviathan.Server.Platform.Storage;
using Microsoft.EntityFrameworkCore;

namespace Leviathan.Server.Platform.Projects;

public sealed class LocalAuthorTickets
{
    private readonly ConcurrentDictionary<string, (string Owner, DateTimeOffset Expires)> tickets = new();
    private readonly SemaphoreSlim slots = new(2);
    public string Issue(string owner)
    {
        foreach (var pair in tickets.Where(p => p.Value.Expires < DateTimeOffset.UtcNow)) tickets.TryRemove(pair.Key, out _);
        if (tickets.Count >= 64) throw new LocalAiException("Too many pending connections. Wait briefly and retry.");
        var ticket = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        tickets[ticket] = (owner, DateTimeOffset.UtcNow.AddSeconds(30)); return ticket;
    }
    public bool Consume(string ticket, string owner) => tickets.TryRemove(ticket, out var entry) && entry.Owner == owner && entry.Expires >= DateTimeOffset.UtcNow;
    public Task<bool> Enter(CancellationToken ct) => slots.WaitAsync(0, ct);
    public void Leave() => slots.Release();
}

public static class LocalAuthorEndpoints
{
    public static void MapLocalAuthorEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/helios/author/local").RequireAuthorization();
        group.MapPost("/open-config", async (HttpContext http, HeliosLocalAi local, LeviathanDbContext db, CancellationToken ct) => {
            if (await Actor(http, local, db, ct) is null) return Results.Forbid();
            try { local.OpenFolder(); return Results.Ok(new { message = "Configuration folder opened. Edit helios.toml, then reload connections." }); }
            catch { return Results.Json(new { error = "author_config_open_failed", message = "Could not open the configuration folder. Use the displayed path to create or edit helios.toml." }, statusCode: 503); }
        }).AddEndpointFilter<LeviathanCsrfFilter>();
        group.MapPost("/test", async (LocalConnectionRequest request, HttpContext http, HeliosLocalAi local, ILocalAuthorAgent agent,
            IHttpClientFactory clients, LeviathanDbContext db, CancellationToken ct) => {
            if (await Actor(http, local, db, ct) is null) return Results.Forbid();
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct); timeout.CancelAfter(TimeSpan.FromSeconds(20));
            try {
                var settings = local.Read();
                if (request.Provider == "codex") return Results.Ok(await agent.Probe(settings.CodexExecutable, timeout.Token));
                var provider = HeliosAuthorEndpoints.Providers.FirstOrDefault(p => p.Id == request.Provider);
                if (provider is null) return Results.BadRequest(new { error = "author_provider_unsupported" });
                var key = local.Key(provider.Id, provider.CredentialVariable, http);
                if (string.IsNullOrWhiteSpace(key)) throw new LocalAiException("No key configured for this provider in helios.toml or the host environment.");
                using var query = new HttpRequestMessage(HttpMethod.Get, provider.Id switch {
                    "openai" => "https://api.openai.com/v1/models", "anthropic" => "https://api.anthropic.com/v1/models",
                    _ => "https://generativelanguage.googleapis.com/v1beta/models" });
                if (provider.Id == "anthropic") { query.Headers.Add("x-api-key", key); query.Headers.Add("anthropic-version", "2023-06-01"); }
                else if (provider.Id == "gemini") query.Headers.Add("x-goog-api-key", key);
                else query.Headers.Authorization = new("Bearer", key);
                using var result = await clients.CreateClient("helios-" + provider.Id).SendAsync(query, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
                if (!result.IsSuccessStatusCode) throw new LocalAiException("Provider rejected the credential check. Check the key, permissions and connection. No inference was requested.");
                return Results.Ok(new LocalAgentProbe(true, "API credential accepted. A completed task will verify selected-model access and quota.", []));
            }
            catch (LocalAiException ex) { return Results.Json(new { error = "author_connection_failed", message = ex.Message }, statusCode: 503); }
            catch (Exception ex) when (ex is not OutOfMemoryException) { return Results.Json(new { error = "author_connection_failed", message = "Connection check failed. Check the client installation, account and network. No API fallback was attempted." }, statusCode: 503); }
        }).AddEndpointFilter<LeviathanCsrfFilter>();
        group.MapPost("/ticket", async (HttpContext http, HeliosLocalAi local, LeviathanDbContext db, LocalAuthorTickets tickets, CancellationToken ct) => {
            var actor = await Actor(http, local, db, ct); if (actor is null) return Results.Forbid();
            try { _ = local.Read(); return Results.Ok(new { ticket = tickets.Issue(actor.UserId.Value) }); }
            catch (LocalAiException ex) { return Results.Json(new { error = "author_connection_failed", message = ex.Message }, statusCode: 503); }
        }).AddEndpointFilter<LeviathanCsrfFilter>();
        group.MapGet("/run", Run);
        group.MapPost("/pair", async (LocalConnectionRequest request, HttpContext http, HeliosLocalAi local, LeviathanDbContext db, DesktopAuthorConnections connections, CancellationToken ct) => {
            var actor = await Actor(http, local, db, ct); if (actor is null) return Results.Forbid();
            if (!DesktopAuthorConnections.Supports(request.Provider)) return Results.BadRequest(new { error = "author_client_unsupported" });
            try {
                var token = connections.Pair(actor.UserId.Value, request.Provider, request.PairingToken);
                var url = $"{http.Request.Scheme}://{http.Request.Host}{DesktopAuthorConnections.Endpoint}";
                var headers = new { Authorization = "Bearer " + token };
                object entry;
                if (request.Provider == "claude-desktop") {
                    var executable = Environment.ProcessPath!;
                    var prefix = Path.GetFileNameWithoutExtension(executable).Equals("dotnet", StringComparison.OrdinalIgnoreCase)
                        ? new[] { typeof(Program).Assembly.Location } : Array.Empty<string>();
                    entry = new { command = executable, args = prefix.Concat(new[] { DesktopMcpStdio.Flag, "--endpoint", url }).ToArray(),
                        env = new Dictionary<string, string> { ["HELIOS_DESKTOP_CAPABILITY"] = token } };
                }
                else entry = request.Provider == "claude-code" ? new { type = "http", url, headers } : new { serverUrl = url, headers };
                return Results.Ok(new { token, expiresAt = connections.Expires(token), client = request.Provider, configuration = new { mcpServers = new Dictionary<string, object> { ["helios"] = entry } },
                    message = "Pairing ready. Add this MCP configuration in your native client. Account and model selection stay there. Access is limited to an active Helios task; pairing expires in eight hours." });
            } catch (LocalAiException ex) { return Results.Json(new { error = "author_pairing_failed", message = ex.Message }, statusCode: 503); }
        }).AddEndpointFilter<LeviathanCsrfFilter>();
        group.MapPost("/unpair", async (DesktopUnpairRequest request, HttpContext http, HeliosLocalAi local, LeviathanDbContext db, DesktopAuthorConnections connections, CancellationToken ct) => {
            var actor = await Actor(http, local, db, ct); if (actor is null) return Results.Forbid();
            connections.Revoke(request.Token ?? "", actor.UserId.Value); return Results.NoContent();
        }).AddEndpointFilter<LeviathanCsrfFilter>();
        app.MapMcp(DesktopAuthorConnections.Endpoint).AllowAnonymous(); // Authenticated by the local capability middleware, not a browser cookie.
    }

    private static async Task<LeviathanRequestContext?> Actor(HttpContext http, HeliosLocalAi local, LeviathanDbContext db, CancellationToken ct)
    {
        if (!local.IsLocal(http) || http.Items[typeof(LeviathanRequestContext)] is not LeviathanRequestContext actor) return null;
        return await db.Installations.AnyAsync(i => i.AccountId == actor.AccountId.Value && i.AppId == "helios" && i.Status == "active", ct) ? actor : null;
    }

    private static async Task Run(HttpContext http, HeliosLocalAi local, LeviathanDbContext db, ILeviathanObjectStore objects,
        LocalAuthorTickets tickets, ILocalAuthorAgent agent, DesktopAuthorConnections desktop, IHostApplicationLifetime host, CancellationToken ct)
    {
        var actor = await Actor(http, local, db, ct);
        if (actor is null || !http.WebSockets.IsWebSocketRequest || !Uri.TryCreate(http.Request.Headers.Origin, UriKind.Absolute, out var origin)
            || !origin.IsLoopback || !tickets.Consume(http.Request.Query["ticket"].ToString(), actor.UserId.Value))
        { http.Response.StatusCode = 403; return; }
        if (!await tickets.Enter(ct)) { http.Response.StatusCode = 429; return; }
        try
        {
            using var socket = await http.WebSockets.AcceptWebSocketAsync();
            using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(ct, host.ApplicationStopping); lifetime.CancelAfter(TimeSpan.FromMinutes(60));
            // Receive continuously so Stop, tab closure and disconnection also cancel model waits.
            var channel = new LocalAuthorChannel(socket, lifetime);
            Task? receiving = null;
            try
            {
                using var startTimeout = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token); startTimeout.CancelAfter(TimeSpan.FromSeconds(15));
                var start = await channel.Receive(startTimeout.Token);
                var request = start.Deserialize<HeliosAuthorRequest>(new JsonSerializerOptions(JsonSerializerDefaults.Web))
                    ?? throw new LocalAiException("Invalid agent task.");
                if (request.Input is not { Length: > 0 } || request.Documents is not { Length: > 0 } || request.Requirements is null
                    || !request.Documents.Contains(request.Root, StringComparer.Ordinal)
                    || (request.Agent == "codex" ? string.IsNullOrWhiteSpace(request.Model) : !DesktopAuthorConnections.Supports(request.Agent)))
                    throw new LocalAiException("Invalid agent task context.");
                var references = await EngineeringToolEndpoints.Load(objects, actor, request.ReferenceIds ?? [], lifetime.Token);
                var context = JsonSerializer.Serialize(new { request.Root, request.Documents, request.DocumentHashes, request.Requirements,
                    references = references.Select(r => new { r.Id, r.Name, r.Sha256, tables = r.Tables.Select(t => new { t.Name, t.Columns }) }) });
                receiving = channel.Listen();
                var instructions = HeliosAuthorEndpoints.Instructions + "\nWorkspace context:\n" + context;
                if (request.Agent == "codex")
                    await agent.Run(local.Read().CodexExecutable, request.Model, instructions, JsonSerializer.Serialize(request.Input), HeliosAuthorEndpoints.AuthorTools(), channel, lifetime.Token);
                else
                    await desktop.Run(request.PairingToken ?? "", actor.UserId.Value, request.Agent, instructions, JsonSerializer.Serialize(request.Input), HeliosAuthorEndpoints.AuthorTools(), channel, lifetime.Token);
            }
            catch (Exception ex) when (ex is not OutOfMemoryException)
            {
                if (socket.State == WebSocketState.Open) {
                    using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                    try { await channel.Event(new { type = "error", message = ex is LocalAiException ? ex.Message : "Agent connection ended without a completed task. Candidate changes were not applied." }, deadline.Token); } catch { }
                }
            }
            finally {
                if (socket.State == WebSocketState.Open) { using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(2)); try { await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "Task ended", deadline.Token); } catch { } }
                if (receiving is not null) { try { await receiving.WaitAsync(TimeSpan.FromSeconds(2)); } catch (TimeoutException) { lifetime.Cancel(); await receiving; } }
            }
        }
        finally { tickets.Leave(); }
    }
}

public sealed record LocalConnectionRequest(string Provider, string? PairingToken = null);
public sealed record DesktopUnpairRequest(string Token);

internal sealed class LocalAuthorChannel(WebSocket socket, CancellationTokenSource lifetime) : IAuthorAgentChannel
{
    private readonly ConcurrentDictionary<string, TaskCompletionSource<JsonElement>> pending = new();
    public async Task Event(object value, CancellationToken ct) => await socket.SendAsync(JsonSerializer.SerializeToUtf8Bytes(value).AsMemory(), WebSocketMessageType.Text, true, ct);
    public async Task<JsonElement> Receive(CancellationToken ct)
    {
        using var data = new MemoryStream(); var buffer = new byte[8192];
        ValueWebSocketReceiveResult message;
        do {
            message = await socket.ReceiveAsync(buffer.AsMemory(), ct);
            if (message.MessageType != WebSocketMessageType.Text) throw new LocalAiException("Agent connection closed or sent an unsupported message.");
            data.Write(buffer, 0, message.Count);
            if (data.Length > 4_000_000) throw new LocalAiException("Agent message exceeds the workspace budget.");
        } while (!message.EndOfMessage);
        using var json = JsonDocument.Parse(data.ToArray()); return json.RootElement.Clone();
    }
    public async Task Listen()
    {
        try { while (!lifetime.IsCancellationRequested) {
            var message = await Receive(lifetime.Token);
            if (message.GetProperty("type").GetString() == "cancel") { lifetime.Cancel(); break; }
            if (message.GetProperty("type").GetString() != "tool_result" || !pending.TryRemove(message.GetProperty("id").GetString()!, out var completion))
                throw new LocalAiException("Unexpected tool response.");
            completion.TrySetResult(message.GetProperty("output"));
        } }
        catch (Exception) { lifetime.Cancel(); }
        finally { foreach (var item in pending.Values) item.TrySetCanceled(); }
    }
    public async Task<JsonElement> Invoke(string name, JsonElement arguments, CancellationToken ct)
    {
        var id = Guid.NewGuid().ToString("N");
        var completion = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously); pending[id] = completion;
        try { await Event(new { type = "tool", id, name, arguments }, ct); return await completion.Task.WaitAsync(ct); }
        finally { pending.TryRemove(id, out _); }
    }
}
