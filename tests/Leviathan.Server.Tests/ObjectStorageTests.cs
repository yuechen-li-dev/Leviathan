using Leviathan.Server.Platform.Storage;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Xunit;

namespace Leviathan.Server.Tests;

public sealed class ObjectStorageTests
{
    [Fact]
    public async Task Put_get_exists_and_list_work_under_prefix()
    {
        var store = CreateStore();
        var key = new LeviathanObjectKey("accounts/acct/apps/inst/sessions/s1/manifest.json");
        await store.PutAsync(key, "{\"ok\":true}"u8.ToArray(), new("application/json"));

        Assert.True(await store.ExistsAsync(key));
        var read = await store.GetAsync(key);
        Assert.NotNull(read);
        Assert.Equal("{\"ok\":true}", System.Text.Encoding.UTF8.GetString(read.Content));
        Assert.Equal(read.Content.Length, read.Metadata.ContentLength);
        Assert.False(string.IsNullOrWhiteSpace(read.Metadata.ContentHash));

        var listed = new List<LeviathanObjectInfo>();
        await foreach (var item in store.ListAsync(new LeviathanObjectKey("accounts/acct/apps/inst"))) listed.Add(item);
        Assert.Contains(listed, i => i.Key == key);
    }

    [Fact]
    public async Task Overwrite_and_if_not_exists_are_enforced()
    {
        var store = CreateStore();
        var key = new LeviathanObjectKey("sessions/s1/checkpoint.dom1");
        await store.PutAsync(key, "one"u8.ToArray());
        await Assert.ThrowsAsync<LeviathanObjectConflictException>(() => store.PutAsync(key, "two"u8.ToArray(), options: new(Overwrite: false)));
        await Assert.ThrowsAsync<LeviathanObjectConflictException>(() => store.PutAsync(key, "two"u8.ToArray(), options: new(IfNotExists: true)));
        await store.PutAsync(key, "two"u8.ToArray());
        var read = await store.GetAsync(key);
        Assert.Equal("two", System.Text.Encoding.UTF8.GetString(read!.Content));
    }

    [Theory]
    [InlineData("../escape")]
    [InlineData("safe/../../escape")]
    [InlineData("./escape")]
    [InlineData("")]
    public void Invalid_keys_are_rejected(string value) => Assert.Throws<ArgumentException>(() => new LeviathanObjectKey(value));

    [Fact]
    public async Task Atomic_replace_does_not_leave_temp_as_final_and_append_jsonl_works()
    {
        var store = CreateStore();
        var key = new LeviathanObjectKey("audit/2026/06/events.jsonl");
        await store.PutAsync(key, "first"u8.ToArray());
        await store.PutAsync(key, "second"u8.ToArray());
        Assert.Equal("second", await File.ReadAllTextAsync(store.PathFor(key)));
        Assert.Empty(Directory.EnumerateFiles(Path.GetDirectoryName(store.PathFor(key))!, "*.tmp"));

        await store.AppendAsync(key, "\nthird"u8.ToArray());
        Assert.Equal("second\nthird", await File.ReadAllTextAsync(store.PathFor(key)));
    }

    private static LocalFileLeviathanObjectStore CreateStore()
    {
        var root = Path.Combine(Path.GetTempPath(), "leviathan-object-tests", Guid.NewGuid().ToString("n"));
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["LEVIATHAN_DATA_DIR"] = root }).Build();
        return new LocalFileLeviathanObjectStore(config, new TestEnvironment(), Options.Create(new LeviathanObjectStoreOptions { RootPath = root }));
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
