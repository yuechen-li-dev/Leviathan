using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ModelContextProtocol.AspNetCore;
using ModelContextProtocol.Protocol;

namespace Leviathan.Server.Platform.Projects;

/// <summary>Native clients own chat, login and inference. This adapter grants only an active Helios candidate.</summary>
public sealed class DesktopAuthorConnections
{
    public const string Endpoint = "/api/helios/author/local/mcp";
    public static bool Supports(string client) => client is "claude-code" or "claude-desktop" or "antigravity";
    public static string Label(string client) => client switch { "claude-code" => "Claude Code", "claude-desktop" => "Claude Desktop", _ => "Antigravity" };
    private readonly ConcurrentDictionary<string, Pairing> pairings = new();
    private static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    public string Pair(string owner, string client, string? existing = null)
    {
        if (!Supports(client)) throw new LocalAiException("Unsupported desktop client.");
        if (existing is not null && Resolve(existing) is { } known && known.Owner == owner && known.Client == client) return existing;
        foreach (var item in pairings.Where(p => p.Value.Expires < DateTimeOffset.UtcNow && p.Value.Active is null)) pairings.TryRemove(item.Key, out _);
        if (pairings.Count >= 64) throw new LocalAiException("Too many desktop connections. Close unused Helios sessions and retry later.");
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        pairings[Hash(token)] = new(owner, client); return token;
    }

    internal Pairing? Resolve(string token) => pairings.TryGetValue(Hash(token), out var pairing) && pairing.Expires > DateTimeOffset.UtcNow ? pairing : null;
    public DateTimeOffset? Expires(string token) => Resolve(token)?.Expires;
    public bool Revoke(string token, string owner)
    {
        var key = Hash(token);
        if (!pairings.TryGetValue(key, out var pairing) || pairing.Owner != owner || !pairings.TryRemove(key, out _)) return false;
        pairing.Active?.Cancel(); return true;
    }

    public async Task Run(string token, string owner, string client, string instructions, string input, JsonElement[] tools, IAuthorAgentChannel channel, CancellationToken ct)
    {
        var pairing = Resolve(token);
        if (pairing is null || pairing.Owner != owner || pairing.Client != client) throw new LocalAiException("Desktop connection expired or belongs to another session. Connect this client again.");
        var task = new Candidate(instructions, input, tools, channel, ct);
        if (Interlocked.CompareExchange(ref pairing.Active, task, null) is not null) throw new LocalAiException("This desktop connection already has an active task.");
        try {
            await channel.Event(new { type = "activity", text = $"Waiting for {Label(client)}. Use the Helios MCP tools in your native chat." }, ct);
            var summary = await task.Completion.Task.WaitAsync(ct);
            ct.ThrowIfCancellationRequested();
            await channel.Event(new { type = "complete", text = summary }, ct);
        }
        finally { Interlocked.CompareExchange(ref pairing.Active, null, task); task.Close(); }
    }

    internal sealed class Pairing(string owner, string client)
    {
        public string Owner { get; } = owner;
        public string Client { get; } = client;
        public DateTimeOffset Expires { get; } = DateTimeOffset.UtcNow.AddHours(8);
        public Candidate? Active;
    }

    internal sealed class Candidate(string instructions, string input, JsonElement[] schemas, IAuthorAgentChannel channel, CancellationToken ct)
    {
        public TaskCompletionSource<string> Completion { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly CancellationTokenSource lifetime = CancellationTokenSource.CreateLinkedTokenSource(ct);
        private readonly SemaphoreSlim gate = new(1);
        private bool built;
        private int closed;
        public void Close() { Interlocked.Exchange(ref closed, 1); lifetime.Cancel(); lifetime.Dispose(); }
        public void Cancel() { Completion.TrySetException(new LocalAiException("Desktop task cancelled. Candidate changes were not applied.")); }
        public async Task<CallToolResult> Invoke(string name, JsonElement arguments, CancellationToken request)
        {
            using var cancellation = CancellationTokenSource.CreateLinkedTokenSource(request, lifetime.Token);
            var token = cancellation.Token;
            var acquired = false;
            try {
                await gate.WaitAsync(token); acquired = true;
                if (Volatile.Read(ref closed) != 0 || Completion.Task.IsCompleted) return Result(false, "This candidate task has ended. Start a new task in Helios.");
                if (name == "task_context") return Result(true, new { instructions, conversation = input,
                    workflow = "Use candidate tools, build successfully, then call finish_task. The Helios host owns application and checkpoints." });
                if (name == "finish_task") {
                    if (!built) return Result(false, "Build the current candidate successfully before finishing this task.");
                    if (!arguments.TryGetProperty("summary", out var summary) || summary.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(summary.GetString()) || summary.GetString()!.Length > 16000)
                        return Result(false, "Supply a concise task summary.");
                    Completion.TrySetResult(summary.GetString()!);
                    return Result(true, "Candidate submitted to Helios for final validation and review/application. This tool does not claim it has been applied.");
                }
                if (!schemas.Any(s => s.GetProperty("name").GetString() == name)) return Result(false, "Unknown Helios candidate tool.");
                var output = await channel.Invoke(name, arguments, token);
                token.ThrowIfCancellationRequested();
                var ok = output.TryGetProperty("ok", out var success) && success.ValueKind == JsonValueKind.True;
                if (name == "edit_file" && ok) built = false;
                if (name == "build") built = ok && output.TryGetProperty("result", out var result) && result.TryGetProperty("accepted", out var accepted) && accepted.ValueKind == JsonValueKind.True;
                return new() { IsError = !ok, Content = [new TextContentBlock { Text = output.GetRawText() }] };
            }
            catch (OperationCanceledException) when (request.IsCancellationRequested && !ct.IsCancellationRequested) {
                Completion.TrySetException(new LocalAiException("Desktop tool request cancelled. Candidate changes were not applied.")); throw;
            }
            finally { if (acquired) gate.Release(); }
        }
    }

    private static CallToolResult Result(bool ok, object result) => new() { IsError = !ok,
        Content = [new TextContentBlock { Text = JsonSerializer.Serialize(new { ok, result }) }] };

    public static void AddServices(IServiceCollection services)
    {
        services.AddSingleton<DesktopAuthorConnections>();
        services.AddMcpServer(options => options.ServerInfo = new() { Name = "helios", Version = "2.0.0" })
            .WithHttpTransport(options => options.SessionMode = HttpServerSessionMode.Stateless)
            .WithListToolsHandler((context, ct) => ValueTask.FromResult(new ListToolsResult { Tools =
                HeliosAuthorEndpoints.AuthorTools().Select(t => new Tool { Name = t.GetProperty("name").GetString()!, Description = t.GetProperty("description").GetString(), InputSchema = t.GetProperty("parameters") })
                .Concat(new[] {
                    new Tool { Name = "task_context", Description = "Read the active Helios task, requirements and workflow before using candidate tools.", InputSchema = JsonSerializer.SerializeToElement(new { type = "object", properties = new { }, additionalProperties = false }) },
                    new Tool { Name = "finish_task", Description = "Submit the successfully built candidate to Helios. The host owns the final apply/review transaction.", InputSchema = JsonSerializer.SerializeToElement(new { type = "object", properties = new { summary = new { type = "string" } }, required = new[] { "summary" }, additionalProperties = false }) }
                }).ToList() }))
            .WithCallToolHandler(async (context, ct) => {
                var http = context.Services!.GetRequiredService<IHttpContextAccessor>().HttpContext;
                var pairing = http?.Items[typeof(Pairing)] as Pairing;
                var task = pairing?.Active;
                if (task is null) return Result(false, "No active Helios candidate. Start a desktop task in the Helios AI Author panel.");
                var parameters = context.Params!;
                return await task.Invoke(parameters.Name, JsonSerializer.SerializeToElement(parameters.Arguments ?? new Dictionary<string, JsonElement>()), ct);
            });
    }

    public static void UseAuthorization(WebApplication app)
    {
        app.Use(async (http, next) => {
            if (http.Request.Path.StartsWithSegments(Endpoint)) {
                var local = http.RequestServices.GetRequiredService<HeliosLocalAi>();
                var header = http.Request.Headers.Authorization.ToString();
                var pairing = header.StartsWith("Bearer ", StringComparison.Ordinal) && header.Length < 256
                    ? http.RequestServices.GetRequiredService<DesktopAuthorConnections>().Resolve(header[7..]) : null;
                var origin = http.Request.Headers.Origin.ToString();
                if (!local.IsLocal(http) || pairing is null || (origin.Length > 0 && (!Uri.TryCreate(origin, UriKind.Absolute, out var uri) || !uri.IsLoopback))) {
                    http.Response.StatusCode = 401; return;
                }
                http.Items[typeof(Pairing)] = pairing;
            }
            await next(http);
        });
    }
}
