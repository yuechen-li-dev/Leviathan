using System.Text.Json;
using Leviathan.Server.Platform.Projects;
using Xunit;

namespace Leviathan.Server.Tests;

public sealed class DesktopAuthorTests
{
    private static readonly JsonElement Empty = JsonSerializer.SerializeToElement(new { });
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
        await Assert.ThrowsAsync<LocalAiException>(() => connections.Run(pairing, "other", "antigravity", Empty, HeliosAuthorEndpoints.Tools, channel, ct));
        await Assert.ThrowsAsync<LocalAiException>(() => connections.Run(pairing, "owner", "claude-code", Empty, HeliosAuthorEndpoints.Tools, channel, ct));
        var running = connections.Run(pairing, "owner", "antigravity", Empty, HeliosAuthorEndpoints.Tools, channel, ct);
        Assert.False(connections.Revoke(pairing, "other"));
        await Assert.ThrowsAsync<LocalAiException>(() => connections.Run(pairing, "owner", "antigravity", Empty, HeliosAuthorEndpoints.Tools, channel, ct));
        Assert.True(connections.Revoke(pairing, "owner"));
        await Assert.ThrowsAsync<LocalAiException>(() => running);
        Assert.Null(connections.Resolve(pairing));
    }
    [Fact]
    public async Task Current_candidate_must_build_and_edits_invalidate_finish_admission()
    {
        var channel = new Channel(); var ct = TestContext.Current.CancellationToken; var empty = JsonSerializer.SerializeToElement(new { });
        var candidate = new DesktopAuthorConnections.Candidate(Empty, HeliosAuthorEndpoints.Tools, channel, ct);
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
        var candidate = new DesktopAuthorConnections.Candidate(Empty, HeliosAuthorEndpoints.Tools, channel, ct);
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
    [Fact]
    public void Task_context_is_structured_and_reads_a_task_typed_only_in_the_native_chat()
    {
        HeliosAuthorRequest Request(params object[] input) => new("", "part.firmament", ["part.firmament", "lib.firmament"], "",
            input.Select(i => JsonSerializer.SerializeToElement(i)).ToArray(), new() { ["part.firmament"] = "abc" }, ApplyMode: "auto", BudgetMinutes: 20);
        var now = DateTimeOffset.Parse("2026-10-26T12:00:00Z");
        var typed = DesktopAuthorConnections.TaskContext(Request(new { role = "user", content = "First" }, new { role = "assistant", content = "Tool build: {}" },
            new { role = "assistant", content = "Done first" }, new { role = "user", content = " Add holes " }), [], now);
        Assert.Equal("Add holes", typed.GetProperty("task").GetString());
        Assert.Equal("helios", typed.GetProperty("taskSource").GetString());
        Assert.Equal(JsonValueKind.Null, typed.GetProperty("requirements").ValueKind);
        Assert.Equal(["part.firmament", "lib.firmament"], typed.GetProperty("project").GetProperty("files").EnumerateArray().Select(f => f.GetProperty("path").GetString()));
        Assert.Equal("abc", typed.GetProperty("project").GetProperty("files")[0].GetProperty("sha256").GetString());
        Assert.StartsWith("auto:", typed.GetProperty("application").GetString());
        Assert.Equal(now.AddMinutes(20), typed.GetProperty("budget").GetProperty("endsAt").GetDateTimeOffset());
        // Earlier turns stay readable; host tool logs are dropped.
        Assert.Equal(["First", "Done first"], typed.GetProperty("earlierConversation").EnumerateArray().Select(t => t.GetProperty("content").GetString()));
        Assert.Contains(typed.GetProperty("rules").EnumerateArray(), r => r.GetString()!.StartsWith("Do not claim edits", StringComparison.Ordinal));

        var chat = DesktopAuthorConnections.TaskContext(Request(new { role = "user", content = "" }) with { ApplyMode = "review", BudgetMinutes = null }, [], now);
        Assert.Equal(JsonValueKind.Null, chat.GetProperty("task").ValueKind);
        Assert.Equal("native-chat", chat.GetProperty("taskSource").GetString());
        Assert.StartsWith("review:", chat.GetProperty("application").GetString());
        Assert.Equal(JsonValueKind.Null, chat.GetProperty("budget").ValueKind);
        Assert.Empty(chat.GetProperty("earlierConversation").EnumerateArray());
    }
    [Fact]
    public async Task A_task_that_ends_without_finish_leaves_its_reason_for_the_native_client()
    {
        var connections = new DesktopAuthorConnections(); var ct = TestContext.Current.CancellationToken;
        var pairing = connections.Pair("owner", "claude-code");
        using var stop = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var running = connections.Run(pairing, "owner", "claude-code", Empty, HeliosAuthorEndpoints.Tools, new Ended(), stop.Token);
        stop.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => running);
        Assert.Equal("Agent time budget reached.", connections.Resolve(pairing)!.LastEnded);
    }
    private sealed class Ended : IAuthorAgentChannel
    {
        public Task Event(object value, CancellationToken ct) => Task.CompletedTask;
        public Task<JsonElement> Invoke(string name, JsonElement arguments, CancellationToken ct) => throw new NotSupportedException();
        public string? EndReason => "Agent time budget reached.";
    }
}
