using System.Text.Json;
using Leviathan.Server.Platform.Projects;
using Xunit;

namespace Leviathan.Server.Tests;

public sealed class DesktopAuthorTests
{
    private sealed class Channel(bool block = false) : IAuthorAgentChannel
    {
        public TaskCompletionSource Entered { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public List<string> Calls { get; } = [];
        public Task Event(object value, CancellationToken ct) => Task.CompletedTask;
        public async Task<JsonElement> Invoke(string name, JsonElement arguments, CancellationToken ct) {
            Calls.Add(name); Entered.TrySetResult();
            if (block) await Task.Delay(Timeout.Infinite, ct);
            return JsonSerializer.SerializeToElement(new { ok = true, result = new { accepted = true } });
        }
    }
    [Fact]
    public async Task Pairings_are_client_and_owner_bound_reusable_and_revocable()
    {
        var connections = new DesktopAuthorConnections(); var channel = new Channel(); var ct = TestContext.Current.CancellationToken;
        var pairing = connections.Pair("owner", "antigravity");
        Assert.Equal(pairing, connections.Pair("owner", "antigravity", pairing));
        await Assert.ThrowsAsync<LocalAiException>(() => connections.Run(pairing, "other", "antigravity", "", "", HeliosAuthorEndpoints.Tools, channel, ct));
        await Assert.ThrowsAsync<LocalAiException>(() => connections.Run(pairing, "owner", "claude-code", "", "", HeliosAuthorEndpoints.Tools, channel, ct));
        var running = connections.Run(pairing, "owner", "antigravity", "", "", HeliosAuthorEndpoints.Tools, channel, ct);
        Assert.False(connections.Revoke(pairing, "other"));
        await Assert.ThrowsAsync<LocalAiException>(() => connections.Run(pairing, "owner", "antigravity", "", "", HeliosAuthorEndpoints.Tools, channel, ct));
        Assert.True(connections.Revoke(pairing, "owner"));
        await Assert.ThrowsAsync<LocalAiException>(() => running);
        Assert.Null(connections.Resolve(pairing));
    }
    [Fact]
    public async Task Current_candidate_must_build_and_edits_invalidate_finish_admission()
    {
        var channel = new Channel(); var ct = TestContext.Current.CancellationToken; var empty = JsonSerializer.SerializeToElement(new { });
        var candidate = new DesktopAuthorConnections.Candidate("Keep intent", "Task", HeliosAuthorEndpoints.Tools, channel, ct);
        try {
            var finish = JsonSerializer.SerializeToElement(new { summary = "Done" });
            Assert.True((await candidate.Invoke("finish_task", finish, ct)).IsError);
            Assert.False((await candidate.Invoke("build", empty, ct)).IsError);
            await candidate.Invoke("edit_file", empty, ct);
            Assert.True((await candidate.Invoke("finish_task", finish, ct)).IsError);
            await candidate.Invoke("build", empty, ct);
            Assert.False((await candidate.Invoke("finish_task", finish, ct)).IsError);
            Assert.Equal("Done", await candidate.Completion.Task);
            Assert.True((await candidate.Invoke("edit_file", empty, ct)).IsError);
        } finally { candidate.Close(); }
    }
    [Fact]
    public async Task Cancelling_an_inflight_native_tool_aborts_the_candidate_and_releases_waiters()
    {
        var ct = TestContext.Current.CancellationToken;
        using var request = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var channel = new Channel(true);
        var candidate = new DesktopAuthorConnections.Candidate("", "", HeliosAuthorEndpoints.Tools, channel, ct);
        try {
            var pending = candidate.Invoke("build", JsonSerializer.SerializeToElement(new { }), request.Token);
            await channel.Entered.Task.WaitAsync(ct); request.Cancel();
            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => pending);
            await Assert.ThrowsAsync<LocalAiException>(() => candidate.Completion.Task);
            Assert.True((await candidate.Invoke("build", JsonSerializer.SerializeToElement(new { }), ct)).IsError);
        } finally { candidate.Close(); }
    }
    [Fact]
    public void Tool_arguments_are_checked_against_the_advertised_schema()
    {
        static Dictionary<string, JsonElement> Args(object value) =>
            JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(JsonSerializer.Serialize(value))!;
        Assert.Null(DesktopAuthorConnections.ArgumentError("read_file", Args(new { path = "part.firmament" })));
        Assert.Null(DesktopAuthorConnections.ArgumentError("task_context", Args(new { })));
        Assert.Equal("read_file does not accept 'name'. Accepted: path.",
            DesktopAuthorConnections.ArgumentError("read_file", Args(new { name = "part.firmament" })));
        Assert.Equal("edit_file requires 'before', 'after'. Accepted: path, before, after.",
            DesktopAuthorConnections.ArgumentError("edit_file", Args(new { path = "part.firmament" })));
        Assert.Equal("finish_task: 'summary' must be a string.",
            DesktopAuthorConnections.ArgumentError("finish_task", Args(new { summary = 3 })));
        Assert.Equal("Unknown tool 'write_file'. Call tools/list for the available tools.",
            DesktopAuthorConnections.ArgumentError("write_file", Args(new { })));
        // Every advertised tool accepts exactly its declared required fields.
        foreach (var tool in DesktopAuthorConnections.McpTools())
        {
            var required = tool.InputSchema.TryGetProperty("required", out var r) ? r.EnumerateArray().Select(x => x.GetString()!).ToArray() : [];
            Assert.Null(DesktopAuthorConnections.ArgumentError(tool.Name, required.ToDictionary(k => k, _ => JsonSerializer.SerializeToElement("x"))));
        }
    }
}
