using System.Diagnostics;
using System.Text.Json;

namespace Leviathan.Server.Platform.Projects;

public sealed record LocalAgentProbe(bool Connected, string Message, HeliosAuthorModel[] Models);
public interface IAuthorAgentChannel
{
    Task Event(object value, CancellationToken ct);
    Task<JsonElement> Invoke(string name, JsonElement arguments, CancellationToken ct);
}
public interface ILocalAuthorAgent
{
    Task<LocalAgentProbe> Probe(string executable, CancellationToken ct);
    Task Run(string executable, string model, string instructions, string input, JsonElement[] tools, IAuthorAgentChannel channel, CancellationToken ct);
}

/// <summary>Owns one child for one task. Vendor RPC stays here; Helios owns tool effects.</summary>
public sealed class CodexAuthorAgent : ILocalAuthorAgent
{
    public async Task<LocalAgentProbe> Probe(string executable, CancellationToken ct)
    {
        await using var rpc = await CodexRpc.Start(executable, ct);
        await RequireSubscription(rpc, ct);
        var models = new List<HeliosAuthorModel>();
        string? cursor = null;
        do
        {
            var page = await rpc.Call("model/list", new { limit = 100, includeHidden = false, cursor }, ct);
            models.AddRange(page.GetProperty("data").EnumerateArray().Select(m => new HeliosAuthorModel(
                m.GetProperty("model").GetString()!, m.GetProperty("displayName").GetString()!)));
            cursor = page.TryGetProperty("nextCursor", out var next) && next.ValueKind == JsonValueKind.String ? next.GetString() : null;
        } while (cursor is not null);
        return new(true, "Codex · ChatGPT subscription. Model availability and quota are checked when a task runs.", models.DistinctBy(m => m.Id).ToArray());
    }

    private static async Task<JsonElement> RequireSubscription(CodexRpc rpc, CancellationToken ct)
    {
        var account = await rpc.Call("account/read", new { refreshToken = false }, ct);
        if (!account.TryGetProperty("account", out var value) || value.ValueKind != JsonValueKind.Object
            || !value.TryGetProperty("type", out var type) || type.GetString() != "chatgpt")
            throw new LocalAiException("Sign in to Codex with ChatGPT first (codex login). This connection requires a subscription account and never falls back to an API key.");
        var effective = await rpc.Call("config/read", new { includeLayers = false }, ct);
        if (effective.GetProperty("config").TryGetProperty("model_providers", out var providers) && providers.ValueKind == JsonValueKind.Object
            && providers.TryGetProperty("openai", out var custom) && custom.ValueKind == JsonValueKind.Object && custom.EnumerateObject().Any())
            throw new LocalAiException("Codex has a custom OpenAI provider configuration. Use a standard ChatGPT login profile for this subscription connection; custom API routes are not admitted.");
        return effective;
    }

    public async Task Run(string executable, string model, string instructions, string input, JsonElement[] tools, IAuthorAgentChannel channel, CancellationToken ct)
    {
        string completedText;
        await using (var rpc = await CodexRpc.Start(executable, ct))
            completedText = await RunTurn(rpc, model, instructions, input, tools, channel, ct);
        // A task is terminal only after its process and pipes have been released.
        await channel.Event(new { type = "complete", text = completedText }, ct);
    }

    private static async Task<string> RunTurn(CodexRpc rpc, string model, string instructions, string input, JsonElement[] tools, IAuthorAgentChannel channel, CancellationToken ct)
    {
        var effective = await RequireSubscription(rpc, ct);
        // Do not inherit the user's connectors, hooks or filesystem tools into a CAD candidate.
        var config = new Dictionary<string, object?>();
        if (effective.GetProperty("config").TryGetProperty("mcp_servers", out var servers) && servers.ValueKind == JsonValueKind.Object)
            foreach (var server in servers.EnumerateObject()) config[$"mcp_servers.{server.Name}.enabled"] = false;
        var thread = await rpc.Call("thread/start", new {
            model, modelProvider = "openai", cwd = rpc.Directory, approvalPolicy = "never", sandbox = "read-only", ephemeral = true,
            baseInstructions = instructions, config,
            dynamicTools = tools.Select(t => new { type = "function", name = t.GetProperty("name").GetString(),
                description = t.GetProperty("description").GetString(), inputSchema = t.GetProperty("parameters") })
        }, ct);
        var threadId = thread.GetProperty("thread").GetProperty("id").GetString()!;
        var allowed = tools.Select(t => t.GetProperty("name").GetString()!).ToHashSet(StringComparer.Ordinal);
        var messages = new Dictionary<string, string>();
        async Task<bool> Handle(JsonElement message)
        {
            if (!message.TryGetProperty("method", out var method)) return false;
            var name = method.GetString();
            var p = message.GetProperty("params");
            if (message.TryGetProperty("id", out var requestId))
            {
                if (name == "item/tool/call")
                {
                    var tool = p.GetProperty("tool").GetString()!;
                    if (!allowed.Contains(tool) || (p.TryGetProperty("namespace", out var ns) && ns.ValueKind != JsonValueKind.Null))
                        throw new LocalAiException("Codex requested a tool outside this Helios candidate.");
                    var result = await channel.Invoke(tool, p.GetProperty("arguments"), ct);
                    await rpc.Send(new { id = requestId, result = new { contentItems = new[] { new { type = "inputText", text = result.GetRawText() } },
                        success = result.TryGetProperty("ok", out var ok) && ok.ValueKind == JsonValueKind.True } }, ct);
                }
                else
                {
                    await rpc.Send(new { id = requestId, error = new { code = -32601, message = "Use the Helios candidate tools. This integration does not grant additional host permissions." } }, ct);
                    throw new LocalAiException("Codex requested an unsupported interaction. No additional host permissions were granted.");
                }
            }
            else if (name == "item/agentMessage/delta")
                await channel.Event(new { type = "text", text = p.GetProperty("delta").GetString() }, ct);
            else if (name == "item/completed" && p.GetProperty("item").GetProperty("type").GetString() == "agentMessage")
            {
                var item = p.GetProperty("item"); messages[item.GetProperty("id").GetString()!] = item.GetProperty("text").GetString()!;
            }
            else if (name == "turn/completed")
            {
                if (p.GetProperty("turn").GetProperty("status").GetString() != "completed")
                    throw new LocalAiException("Codex did not complete this task. Check account quota, model access and the client version; the candidate was not applied.");
                return true;
            }
            return false;
        }
        rpc.Notification = Handle;
        await rpc.Call("turn/start", new { threadId, input = new[] { new { type = "text", text = input } } }, ct);
        while (!await Handle(await rpc.Read(ct))) { }
        return string.Join("\n\n", messages.Values);
    }
}

/// <summary>Minimal sequential JSON-RPC transport, with bounded lifetime and no stderr disclosure.</summary>
internal sealed class CodexRpc : IAsyncDisposable
{
    private readonly Process process;
    private readonly Task drain;
    private int sequence;
    public string Directory { get; }
    public Func<JsonElement, Task<bool>>? Notification { get; set; }
    private CodexRpc(Process process, string directory)
    {
        this.process = process; Directory = directory;
        drain = Task.Run(async () => { var buffer = new char[4096]; while (await process.StandardError.ReadAsync(buffer) > 0) { } });
    }
    public static async Task<CodexRpc> Start(string executable, CancellationToken ct)
    {
        var directory = Path.Combine(Path.GetTempPath(), "helios-agent", Guid.NewGuid().ToString("N"));
        System.IO.Directory.CreateDirectory(directory);
        var start = new ProcessStartInfo(executable) { UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, WorkingDirectory = directory };
        start.ArgumentList.Add("app-server"); start.ArgumentList.Add("--listen"); start.ArgumentList.Add("stdio://");
        foreach (var setting in new[] { "model_provider=\"openai\"", "forced_login_method=\"chatgpt\"", "web_search=\"disabled\"",
            "features.shell_tool=false", "features.unified_exec=false", "features.code_mode=false",
            "features.apps=false", "features.plugins=false", "features.hooks=false", "features.multi_agent=false",
            "features.browser_use=false", "features.computer_use=false", "features.view_image=false", "features.memories=false" })
        { start.ArgumentList.Add("-c"); start.ArgumentList.Add(setting); }
        foreach (var variable in new[] { "OPENAI_API_KEY", "CODEX_API_KEY", "OPENAI_BASE_URL" }) start.Environment.Remove(variable);
        Process? process = null; CodexRpc? rpc = null;
        try
        {
            process = Process.Start(start) ?? throw new LocalAiException("Cannot start Codex.");
            rpc = new(process, directory);
            await rpc.Call("initialize", new { clientInfo = new { name = "helios", title = "Helios by Aetheris", version = "2.0.0" },
                capabilities = new { experimentalApi = true } }, ct);
            await rpc.Send(new { method = "initialized" }, ct);
            return rpc;
        }
        catch (Exception error)
        {
            if (rpc is not null) await rpc.DisposeAsync();
            else { process?.Dispose(); System.IO.Directory.Delete(directory, true); }
            if (error is System.ComponentModel.Win32Exception)
                throw new LocalAiException("Cannot start the native Codex client. Install it or set agents.codex.executable in helios.toml to its executable path.");
            throw;
        }
    }
    public async Task Send(object value, CancellationToken ct)
    { await process.StandardInput.WriteLineAsync(JsonSerializer.Serialize(value).AsMemory(), ct); await process.StandardInput.FlushAsync(ct); }
    public async Task<JsonElement> Read(CancellationToken ct)
    {
        var line = await process.StandardOutput.ReadLineAsync(ct);
        if (line is null) throw new LocalAiException("Codex exited before completing the connection. Check the executable and supported client version.");
        if (line.Length > 4_000_000) throw new LocalAiException("Codex exceeded the message size limit.");
        using var document = JsonDocument.Parse(line); return document.RootElement.Clone();
    }
    public async Task<JsonElement> Call(string method, object parameters, CancellationToken ct)
    {
        var id = ++sequence; await Send(new { id, method, @params = parameters }, ct);
        while (true)
        {
            var message = await Read(ct);
            if (!message.TryGetProperty("method", out _) && message.TryGetProperty("id", out var response) && response.ValueKind == JsonValueKind.Number && response.GetInt32() == id)
            {
                if (message.TryGetProperty("error", out _)) throw new LocalAiException($"Codex rejected {method}. Update the client or check its account/configuration. No API fallback was attempted.");
                return message.GetProperty("result");
            }
            if (Notification is not null && await Notification(message)) throw new LocalAiException("Codex ended before acknowledging the task.");
            if (Notification is null && message.TryGetProperty("method", out _) && message.TryGetProperty("id", out var requestId))
            {
                await Send(new { id = requestId, error = new { code = -32601, message = "Complete interactive setup in Codex first." } }, ct);
                throw new LocalAiException("Codex requested interactive setup. Complete sign-in in Codex, then test this connection again.");
            }
        }
    }
    public async ValueTask DisposeAsync()
    {
        try { if (!process.HasExited) process.Kill(entireProcessTree: true); await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5)); await drain.WaitAsync(TimeSpan.FromSeconds(5)); }
        finally { process.Dispose(); if (System.IO.Directory.Exists(Directory)) System.IO.Directory.Delete(Directory, true); }
    }
}
