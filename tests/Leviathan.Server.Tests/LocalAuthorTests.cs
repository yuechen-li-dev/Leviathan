using System.Diagnostics;
using System.Text.Json;
using Leviathan.Server.Platform.Projects;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace Leviathan.Server.Tests;

public sealed class LocalAuthorTests
{
    private static string Temporary() { var path = Path.Combine(Path.GetTempPath(), "helios-local-tests", Guid.NewGuid().ToString("N")); Directory.CreateDirectory(path); return path; }
    private static HeliosLocalAi Config(string file, bool enabled = true, string url = "http://127.0.0.1:5189") => new(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
        ["HELIOS_LOCAL_AI"] = enabled.ToString(), ["HELIOS_CONFIG_FILE"] = file, ["urls"] = url
    }).Build());

    [Fact]
    public void Local_configuration_reloads_rejects_typos_and_never_echoes_credentials()
    {
        var directory = Temporary(); var file = Path.Combine(directory, "helios.toml");
        try {
            var config = Config(file); config.ValidateBinding();
            File.WriteAllText(file, "defaultProvider = 'codex'\n[providers.openai]\napiKey = 'first-secret'\n[providers.anthropic]\napiKey = 'second-secret'");
            Assert.Equal("codex", config.Read().DefaultProvider); Assert.Equal("first-secret", config.Read().Keys["openai"]);
            Assert.DoesNotContain("secret", JsonSerializer.Serialize(config.Read()));
            File.WriteAllText(file, "[providers.gemini]\napiKey = 'reloaded'"); Assert.Equal("reloaded", config.Read().Keys["gemini"]);
            File.WriteAllText(file, "[providers.openai]\napiKeey = 'do-not-echo'");
            Assert.DoesNotContain("do-not-echo", Assert.Throws<LocalAiException>(() => config.Read()).Message);
            File.WriteAllText(file, "[providers.openai]\napiKey = 'do-not-echo");
            Assert.DoesNotContain("do-not-echo", Assert.Throws<LocalAiException>(() => config.Read()).Message);
            File.WriteAllText(file, "[providers.openai]\napiKey = 'one'\napiKeyEnv = 'OPENAI_API_KEY'"); Assert.Throws<LocalAiException>(() => config.Read());
            File.WriteAllText(file, "[providers.openai]\napiKeyEnv = 'HELIOS_TEST_UNSET_CREDENTIAL_5AB91'"); Assert.Empty(config.Read().Keys["openai"]);
            Assert.Empty(Config(file, false).Read().Keys);
            Assert.Throws<InvalidOperationException>(() => Config(file, url: "http://0.0.0.0:5189").ValidateBinding());
        } finally { Directory.Delete(directory, true); }
    }

    private sealed class Peer : IAsyncDisposable
    {
        public string Directory { get; } = Temporary();
        public string Executable => Path.Combine(Directory, "Leviathan.AgentPeer" + (OperatingSystem.IsWindows() ? ".exe" : ""));
        public Peer(string? mode = null)
        {
            var configuration = new DirectoryInfo(AppContext.BaseDirectory).Parent!.Name;
            var root = File.Exists(Path.Combine(AppContext.BaseDirectory, "Leviathan.AgentPeer.dll"))
                ? AppContext.BaseDirectory : Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../Leviathan.AgentPeer/bin", configuration, "net10.0"));
            foreach (var file in System.IO.Directory.GetFiles(root)) File.Copy(file, Path.Combine(Directory, Path.GetFileName(file)));
            if (mode is not null) File.WriteAllText(Path.Combine(Directory, mode), "");
        }
        public void Reaped() {
            var id = int.Parse(File.ReadAllText(Path.Combine(Directory, "peer.pid")));
            try { using var process = Process.GetProcessById(id); Assert.True(process.HasExited); } catch (ArgumentException) { }
        }
        public async ValueTask DisposeAsync()
        {
            // Windows image/scanner handles can briefly outlive process exit.
            // Reaped() still proves shutdown; only temporary file cleanup retries.
            for (var attempt = 0; ; attempt++) {
                try { System.IO.Directory.Delete(Directory, true); return; }
                catch (Exception error) when (OperatingSystem.IsWindows() && attempt < 9 && (error is IOException or UnauthorizedAccessException)) {
                    await Task.Delay(TimeSpan.FromMilliseconds(50 * (attempt + 1)));
                }
            }
        }
    }
    private sealed class Channel : IAuthorAgentChannel
    {
        public List<string> Calls { get; } = [];
        public List<JsonElement> Events { get; } = [];
        public Task Event(object value, CancellationToken ct) { Events.Add(JsonSerializer.SerializeToElement(value)); return Task.CompletedTask; }
        public Task<JsonElement> Invoke(string name, JsonElement arguments, CancellationToken ct) { Calls.Add(name); return Task.FromResult(JsonSerializer.SerializeToElement(new { ok = true, result = new { accepted = true } })); }
    }
    [Fact]
    public async Task Codex_process_authentication_tool_roundtrip_and_completion_are_real_and_reaped()
    {
        await using var peer = new Peer(); var agent = new CodexAuthorAgent(); var ct = TestContext.Current.CancellationToken;
        var probe = await agent.Probe(peer.Executable, ct); Assert.True(probe.Connected); Assert.Equal("fixture-model", probe.Models.Single().Id); peer.Reaped();
        var channel = new Channel();
        await agent.Run(peer.Executable, "fixture-model", "Keep geometry", "Revise width", HeliosAuthorEndpoints.Tools, channel, ct);
        Assert.Equal(new[] { "read_file", "edit_file", "build" }, channel.Calls);
        Assert.Equal("complete", channel.Events.Last().GetProperty("type").GetString()); peer.Reaped();
    }
    [Fact]
    public async Task Api_key_accounts_and_failed_turns_never_report_success()
    {
        var agent = new CodexAuthorAgent(); var ct = TestContext.Current.CancellationToken;
        await using (var peer = new Peer("apikey")) { await Assert.ThrowsAsync<LocalAiException>(() => agent.Probe(peer.Executable, ct)); peer.Reaped(); }
        await using (var peer = new Peer("custom-api-route")) { await Assert.ThrowsAsync<LocalAiException>(() => agent.Probe(peer.Executable, ct)); peer.Reaped(); }
        await using (var peer = new Peer("failed")) {
            var channel = new Channel();
            var error = await Assert.ThrowsAsync<LocalAiException>(() => agent.Run(peer.Executable, "fixture-model", "", "", HeliosAuthorEndpoints.Tools, channel, ct));
            Assert.DoesNotContain("fixture-secret", error.Message); Assert.DoesNotContain(channel.Events, e => e.GetProperty("type").GetString() == "complete"); peer.Reaped();
        }
    }
    [Fact]
    public async Task Cancelling_a_waiting_model_reaps_the_child()
    {
        await using var peer = new Peer("hold"); using var timeout = CancellationTokenSource.CreateLinkedTokenSource(TestContext.Current.CancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(2));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => new CodexAuthorAgent().Run(peer.Executable, "fixture-model", "", "", HeliosAuthorEndpoints.Tools, new Channel(), timeout.Token));
        peer.Reaped();
    }
    [Fact]
    public void Connection_tickets_are_one_time_and_owner_bound()
    {
        var tickets = new LocalAuthorTickets(); var ticket = tickets.Issue("a");
        Assert.False(tickets.Consume(ticket, "b")); Assert.False(tickets.Consume(ticket, "a"));
        ticket = tickets.Issue("a"); Assert.True(tickets.Consume(ticket, "a")); Assert.False(tickets.Consume(ticket, "a"));
    }
}
