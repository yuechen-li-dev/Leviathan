using Leviathan.Server.Platform.Capabilities;
using Leviathan.Server.Platform.Identity;
using Leviathan.Server.Platform.Storage;
using Leviathan.Server.Platform.Storage.Actuation;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Xunit;

namespace Leviathan.Server.Tests;

public sealed class ObjectStorageActuationTests
{
    [Fact]
    public async Task Put_writes_object_and_returns_metadata_without_local_path()
    {
        var (handler, sink, root) = CreateHandler();
        var result = await handler.ExecutePutAsync(new("safe/object.txt", Text: "hello", ContentType: "text/plain", IfNotExists: true), default);
        Assert.True(result.Ok, result.ErrorMessage);
        Assert.Equal("safe/object.txt", result.Key);
        Assert.Equal(5, result.Metadata?.ContentLength);
        Assert.DoesNotContain(root, result.ToString(), StringComparison.OrdinalIgnoreCase);
        Assert.Contains(sink.RecentEvents, e => e.Kind == "started" && e.Operation == "put");
        Assert.Contains(sink.RecentEvents, e => e.Kind == "completed" && e.Operation == "put");
    }

    [Fact]
    public async Task Get_returns_expected_text_bytes_and_metadata()
    {
        var (handler, _, _) = CreateHandler();
        await handler.ExecutePutAsync(new("safe/read.txt", Text: "read me", ContentType: "text/plain"), default);
        var result = await handler.ExecuteGetAsync(new("safe/read.txt"), default);
        Assert.True(result.Ok, result.ErrorMessage);
        Assert.Equal("read me", result.Text);
        Assert.Equal("read me", System.Text.Encoding.UTF8.GetString(result.Bytes!));
        Assert.Equal(7, result.Metadata?.ContentLength);
    }

    [Fact]
    public async Task Exists_returns_true_and_false()
    {
        var (handler, _, _) = CreateHandler();
        await handler.ExecutePutAsync(new("safe/existing.txt", Text: "x"), default);
        Assert.True((await handler.ExecuteExistsAsync(new("safe/existing.txt"), default)).Exists);
        Assert.False((await handler.ExecuteExistsAsync(new("safe/missing.txt"), default)).Exists);
    }

    [Fact]
    public async Task List_returns_prefix_results()
    {
        var (handler, _, _) = CreateHandler();
        await handler.ExecutePutAsync(new("safe/list/a.txt", Text: "a"), default);
        await handler.ExecutePutAsync(new("safe/list/b.txt", Text: "b"), default);
        await handler.ExecutePutAsync(new("safe/other/c.txt", Text: "c"), default);
        var result = await handler.ExecuteListAsync(new("safe/list"), default);
        Assert.True(result.Ok, result.ErrorMessage);
        Assert.Equal(["safe/list/a.txt", "safe/list/b.txt"], result.Items.Select(i => i.Key).Order().ToArray());
    }

    [Fact]
    public async Task Append_appends_to_object()
    {
        var (handler, _, _) = CreateHandler();
        await handler.ExecutePutAsync(new("safe/append.txt", Text: "one"), default);
        var result = await handler.ExecuteAppendAsync(new("safe/append.txt", Text: " two"), default);
        Assert.True(result.Ok, result.ErrorMessage);
        Assert.Equal("one two", (await handler.ExecuteGetAsync(new("safe/append.txt"), default)).Text);
    }

    [Fact]
    public async Task Delete_deletes_existing_object_and_reports_missing_as_not_deleted()
    {
        var (handler, _, _) = CreateHandler();
        await handler.ExecutePutAsync(new("safe/delete.txt", Text: "bye"), default);
        var deleted = await handler.ExecuteDeleteAsync(new("safe/delete.txt"), default);
        Assert.True(deleted.Ok, deleted.ErrorMessage);
        Assert.True(deleted.Deleted);
        Assert.False((await handler.ExecuteExistsAsync(new("safe/delete.txt"), default)).Exists);
        Assert.False((await handler.ExecuteDeleteAsync(new("safe/delete.txt"), default)).Deleted);
    }

    [Fact]
    public async Task Invalid_key_is_rejected_with_controlled_result()
    {
        var (handler, sink, _) = CreateHandler();
        var result = await handler.ExecuteGetAsync(new("../escape"), default);
        Assert.False(result.Ok);
        Assert.Equal("invalid_key", result.ErrorCode);
        Assert.Contains(sink.RecentEvents, e => e.Kind == "rejected" && e.ObjectKey == "<invalid>");
    }

    [Fact]
    public async Task If_not_exists_conflict_returns_controlled_result()
    {
        var (handler, _, _) = CreateHandler();
        await handler.ExecutePutAsync(new("safe/conflict.txt", Text: "one"), default);
        var result = await handler.ExecutePutAsync(new("safe/conflict.txt", Text: "two", IfNotExists: true), default);
        Assert.False(result.Ok);
        Assert.Equal("conflict", result.ErrorCode);
    }

    [Fact]
    public async Task Missing_read_returns_controlled_not_found_result()
    {
        var (handler, _, _) = CreateHandler();
        var result = await handler.ExecuteGetAsync(new("safe/not-found.txt"), default);
        Assert.False(result.Ok);
        Assert.Equal("not_found", result.ErrorCode);
    }

    [Fact]
    public async Task Trusted_internal_mode_allows_operation_without_capability_grant()
    {
        var (handler, _, _) = CreateHandler();
        var result = await handler.ExecutePutAsync(new("safe/trusted.txt", Text: "ok", Context: new(AccountId: "acct", AppId: "app", AppInstallationId: "inst")), default);
        Assert.True(result.Ok, result.ErrorMessage);
    }


    [Fact]
    public async Task Policy_enforced_put_denies_without_context_and_does_not_write()
    {
        var (handler, sink, _) = CreatePolicyHandler(FakeCapabilityPolicy.Allow(LeviathanCapabilityNames.ObjectWrite));
        var result = await handler.ExecutePutAsync(new("safe/denied.txt", Text: "nope"), default);
        Assert.False(result.Ok);
        Assert.Equal("capability_denied", result.ErrorCode);
        Assert.Equal("missing_actuation_context", result.Decision?.ReasonCode);
        Assert.False((await handler.ExecuteExistsAsync(new("safe/denied.txt", Context: TestContext(LeviathanCapabilityNames.ObjectRead)), default)).Exists);
        Assert.Contains(sink.RecentEvents, e => e.Kind == "denied" && e.CapabilityAllowed == false && e.CapabilityReasonCode == "missing_actuation_context");
    }

    [Fact]
    public async Task Policy_enforced_put_allows_with_matching_grant_metadata()
    {
        var (handler, sink, _) = CreatePolicyHandler(FakeCapabilityPolicy.Allow(LeviathanCapabilityNames.ObjectWrite, "grant_write"));
        var result = await handler.ExecutePutAsync(new("safe/allowed.txt", Text: "yes", Context: TestContext(LeviathanCapabilityNames.ObjectWrite)), default);
        Assert.True(result.Ok, result.ErrorMessage);
        Assert.Equal("grant_write", result.Decision?.GrantId);
        Assert.True(result.Decision?.Allowed);
        Assert.Contains(sink.RecentEvents, e => e.Kind == "completed" && e.CapabilityName == LeviathanCapabilityNames.ObjectWrite && e.CapabilityAllowed == true && e.CapabilityGrantId == "grant_write" && e.AccountId == "acct_local_dev" && e.AppInstallationId == "inst_local_dev_scheduling" && e.ActorUserId == "user_local_dev");
    }

    [Fact]
    public async Task Policy_enforced_get_list_delete_require_operation_capabilities()
    {
        var policy = new FakeCapabilityPolicy(new Dictionary<string, LeviathanCapabilityDecision>
        {
            [LeviathanCapabilityNames.ObjectWrite] = FakeCapabilityPolicy.Decision(LeviathanCapabilityNames.ObjectWrite, true, "grant_write"),
            [LeviathanCapabilityNames.ObjectRead] = FakeCapabilityPolicy.Decision(LeviathanCapabilityNames.ObjectRead, true, "grant_read"),
            [LeviathanCapabilityNames.ObjectList] = FakeCapabilityPolicy.Decision(LeviathanCapabilityNames.ObjectList, true, "grant_list"),
            [LeviathanCapabilityNames.ObjectDelete] = FakeCapabilityPolicy.Decision(LeviathanCapabilityNames.ObjectDelete, true, "grant_delete"),
        });
        var (handler, _, _) = CreatePolicyHandler(policy);
        await handler.ExecutePutAsync(new("safe/map.txt", Text: "x", Context: TestContext(LeviathanCapabilityNames.ObjectWrite)), default);
        Assert.Equal("object.read", (await handler.ExecuteGetAsync(new("safe/map.txt", Context: TestContext(LeviathanCapabilityNames.ObjectRead)), default)).Decision?.CapabilityName);
        Assert.Equal("object.list", (await handler.ExecuteListAsync(new("safe", Context: TestContext(LeviathanCapabilityNames.ObjectList)), default)).Decision?.CapabilityName);
        Assert.Equal("object.delete", (await handler.ExecuteDeleteAsync(new("safe/map.txt", Context: TestContext(LeviathanCapabilityNames.ObjectDelete)), default)).Decision?.CapabilityName);
        Assert.Equal(new[] { "object.write", "object.read", "object.list", "object.delete" }, policy.SeenCapabilities);
    }

    [Fact]
    public async Task Policy_enforced_invalid_key_is_rejected_safely_before_policy_call()
    {
        var policy = FakeCapabilityPolicy.Allow(LeviathanCapabilityNames.ObjectRead);
        var (handler, sink, _) = CreatePolicyHandler(policy);
        var result = await handler.ExecuteGetAsync(new("../escape", Context: TestContext(LeviathanCapabilityNames.ObjectRead)), default);
        Assert.False(result.Ok);
        Assert.Equal("invalid_key", result.ErrorCode);
        Assert.Empty(policy.SeenCapabilities);
        Assert.Contains(sink.RecentEvents, e => e.Kind == "rejected" && e.ObjectKey == "<invalid>");
    }

    private static (ObjectStorageActuationHandler Handler, InMemoryObjectStorageOperationEventSink Sink, string Root) CreateHandler()
    {
        var root = Path.Combine(Path.GetTempPath(), "leviathan-object-actuation-tests", Guid.NewGuid().ToString("n"));
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["LEVIATHAN_DATA_DIR"] = root }).Build();
        var store = new LocalFileLeviathanObjectStore(config, new TestEnvironment(), Options.Create(new LeviathanObjectStoreOptions { RootPath = root }));
        var sink = new InMemoryObjectStorageOperationEventSink();
        return (new ObjectStorageActuationHandler(store, sink), sink, root);
    }


    private static ObjectStorageCapabilityContext TestContext(string capability) => new(
        AccountId: "acct_local_dev",
        AppId: "scheduling",
        AppInstallationId: "inst_local_dev_scheduling",
        CorrelationId: $"corr_{capability}");

    private static (ObjectStorageActuationHandler Handler, InMemoryObjectStorageOperationEventSink Sink, string Root) CreatePolicyHandler(FakeCapabilityPolicy policy)
    {
        var root = Path.Combine(Path.GetTempPath(), "leviathan-object-actuation-tests", Guid.NewGuid().ToString("n"));
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["LEVIATHAN_DATA_DIR"] = root }).Build();
        var store = new LocalFileLeviathanObjectStore(config, new TestEnvironment(), Options.Create(new LeviathanObjectStoreOptions { RootPath = root }));
        var sink = new InMemoryObjectStorageOperationEventSink();
        return (new ObjectStorageActuationHandler(store, sink, new ObjectStorageActuationOptions { SecurityMode = ObjectStorageActuationSecurityMode.PolicyEnforced }, policy, new TestActuationContextResolver()), sink, root);
    }

    private sealed class TestActuationContextResolver : ILeviathanActuationContextResolver
    {
        public LeviathanActuationContext? Resolve(ObjectStorageCapabilityContext? commandContext) => commandContext is null ? null : new(
            new(commandContext.AccountId ?? "acct_local_dev"),
            new(commandContext.AppInstallationId ?? "inst_local_dev_scheduling"),
            commandContext.AppId ?? "scheduling",
            LeviathanRequestContextAccessor.LocalDevUserId,
            "req_test",
            commandContext.CorrelationId,
            UnsafeLocalDev: true,
            TrustedInternal: commandContext.TrustedInternal);
    }

    private sealed class FakeCapabilityPolicy(IReadOnlyDictionary<string, LeviathanCapabilityDecision> decisions) : ILeviathanCapabilityPolicy
    {
        private readonly List<string> _seen = [];
        public string[] SeenCapabilities => _seen.ToArray();
        public static FakeCapabilityPolicy Allow(string capability, string grantId = "grant_ok") => new(new Dictionary<string, LeviathanCapabilityDecision> { [capability] = Decision(capability, true, grantId) });
        public static LeviathanCapabilityDecision Decision(string capability, bool allowed, string? grantId = null, string reason = "allowed") => new(allowed, allowed ? reason : "capability_grant_missing", grantId is null ? null : new(grantId), new(DateTimeOffset.UtcNow, "acct_local_dev", "inst_local_dev_scheduling", "scheduling", capability, "test", "object", "safe", allowed, allowed ? reason : "capability_grant_missing", grantId, "corr", "req"));
        public Task<LeviathanCapabilityDecision> Evaluate(LeviathanRequestContext? context, LeviathanCapabilityCheck check)
        {
            _seen.Add(check.CapabilityName.Value);
            return Task.FromResult(decisions.TryGetValue(check.CapabilityName.Value, out var d) ? d : Decision(check.CapabilityName.Value, false));
        }
    }

    private sealed class TestEnvironment : IWebHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Tests";
        public string ApplicationName { get; set; } = "Leviathan.Tests";
        public string WebRootPath { get; set; } = Path.GetTempPath();
        public Microsoft.Extensions.FileProviders.IFileProvider WebRootFileProvider { get; set; } = new Microsoft.Extensions.FileProviders.NullFileProvider();
        public string ContentRootPath { get; set; } = Path.GetTempPath();
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = new Microsoft.Extensions.FileProviders.NullFileProvider();
    }
}
