using System.Text.Json;

// Offline vendor-protocol peer: validates real process/RPC lifetime, never contacts a provider.
File.WriteAllText(Path.Combine(AppContext.BaseDirectory, "peer.pid"), Environment.ProcessId.ToString());
bool Mode(string name) => File.Exists(Path.Combine(AppContext.BaseDirectory, name));
async Task Send(object value) => await Console.Out.WriteLineAsync(JsonSerializer.Serialize(value));
var stage = 0;
while (await Console.In.ReadLineAsync() is { } line)
{
    using var doc = JsonDocument.Parse(line); var message = doc.RootElement;
    if (!message.TryGetProperty("method", out var method))
    {
        if (!message.GetProperty("result").GetProperty("success").GetBoolean()) throw new Exception("Tool failed.");
        ++stage;
        if (stage == 1) await Send(new { id = "tool2", method = "item/tool/call", @params = new { tool = "edit_file", arguments = new { path = "part.firmament", before = "20mm", after = "30mm" } } });
        else if (stage == 2) await Send(new { id = "tool3", method = "item/tool/call", @params = new { tool = "build", arguments = new { } } });
        else {
            await Send(new { method = "item/agentMessage/delta", @params = new { delta = "Revised and built." } });
            await Send(new { method = "item/completed", @params = new { item = new { type = "agentMessage", id = "final", text = "Revised and built." } } });
            await Send(new { method = "turn/completed", @params = new { turn = new { status = Mode("failed") ? "failed" : "completed", error = "fixture-secret-do-not-leak" } } });
        }
        continue;
    }
    if (method.GetString() == "initialized") continue;
    var id = message.GetProperty("id"); object result = new { };
    switch (method.GetString())
    {
        case "initialize": result = new { userAgent = "offline-codex-peer" }; break;
        case "account/read": result = new { account = new { type = Mode("apikey") ? "apiKey" : "chatgpt" } }; break;
        case "model/list": result = new { data = new[] { new { model = "fixture-model", displayName = "Offline Codex" } }, nextCursor = (string?)null }; break;
        case "config/read": result = new { config = new { mcp_servers = new { untrusted = new { enabled = true } },
            model_providers = Mode("custom-api-route") ? new Dictionary<string, object> { ["openai"] = new { env_key = "CUSTOM_API_KEY" } } : new Dictionary<string, object>() } }; break;
        case "thread/start":
            var p = message.GetProperty("params");
            if (p.GetProperty("sandbox").GetString() != "read-only" || !p.GetProperty("ephemeral").GetBoolean()
                || p.GetProperty("config").GetProperty("mcp_servers.untrusted.enabled").GetBoolean()
                || p.GetProperty("dynamicTools").GetArrayLength() < 6) throw new Exception("Unsafe thread.");
            result = new { thread = new { id = "offline-thread" } }; break;
        case "turn/start":
            await Send(new { id, result = new { turn = new { id = "turn" } } });
            if (Mode("hold")) { await Task.Delay(Timeout.Infinite); }
            await Send(new { id = "tool1", method = "item/tool/call", @params = new { tool = "read_file", arguments = new { path = "part.firmament" } } }); continue;
    }
    await Send(new { id, result });
}
