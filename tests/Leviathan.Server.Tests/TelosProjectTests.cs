using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Xunit;

namespace Leviathan.Server.Tests;

public sealed class TelosProjectTests
{
    [Fact]
    public async Task Published_revision_is_public_and_immutable_while_private_projects_remain_isolated()
    {
        var dataDir = Path.Combine(Path.GetTempPath(), "leviathan-discovery-tests", Guid.NewGuid().ToString("n"));
        const string published = "Model Published { Units: mm Box Body { Size: [10mm, 10mm, 10mm] } }";
        const string privateSource = "private next revision";
        const string png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==";
        try
        {
            using var server = new TelosFactory(dataDir);
            using var anonymous = server.CreateClient();
            Assert.Empty((await anonymous.GetFromJsonAsync<JsonElement[]>("/api/helios/publications", TestContext.Current.CancellationToken))!);
            using var owner = server.CreateClient();
            var token = await Csrf(owner);
            Assert.Equal(HttpStatusCode.OK, (await Post(owner, "/api/auth/register", new { email = "publisher@example.test", password = "Publisher-Password-2026!", displayName = "Publisher" }, token)).StatusCode);
            token = await Csrf(owner);
            var created = await Post(owner, "/api/projects", new { appId = "helios", name = "Published box", source = published }, token);
            Assert.Equal(HttpStatusCode.Created, created.StatusCode);
            using var createdJson = await Body(created);
            var projectId = createdJson.RootElement.GetProperty("id").GetString()!;
            var revisionId = createdJson.RootElement.GetProperty("revisionId").GetString()!;
            Assert.Equal(HttpStatusCode.NotFound, (await Post(owner, $"/api/projects/{projectId}/publish", new { expectedRevisionId = "wrong", title = "Box", description = "Public", category = "Mechanical", tags = new[] { "box" }, previewPngBase64 = png }, token)).StatusCode);
            var publishedResponse = await Post(owner, $"/api/projects/{projectId}/publish", new { expectedRevisionId = revisionId, title = "Box", description = "Public", category = "Mechanical", tags = new[] { "box" }, previewPngBase64 = png }, token);
            Assert.Equal(HttpStatusCode.OK, publishedResponse.StatusCode);
            using var publishedJson = await Body(publishedResponse);
            var publicId = publishedJson.RootElement.GetProperty("id").GetString()!;
            Assert.DoesNotContain(projectId, await anonymous.GetStringAsync("/api/helios/publications", TestContext.Current.CancellationToken));
            var detail = await anonymous.GetFromJsonAsync<JsonElement>($"/api/helios/publications/{publicId}", TestContext.Current.CancellationToken);
            Assert.Equal(published, detail.GetProperty("source").GetString());
            Assert.Equal(revisionId, detail.GetProperty("publishedRevisionId").GetString());
            Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync($"/api/helios/publications/{publicId}/preview", TestContext.Current.CancellationToken)).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync($"/api/projects/{projectId}", TestContext.Current.CancellationToken)).StatusCode);
            var saved = await Put(owner, $"/api/projects/{projectId}", new { expectedRevisionId = revisionId, source = privateSource }, token);
            Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
            var unchanged = await anonymous.GetFromJsonAsync<JsonElement>($"/api/helios/publications/{publicId}", TestContext.Current.CancellationToken);
            Assert.Equal(published, unchanged.GetProperty("source").GetString());
            Assert.DoesNotContain(privateSource, await anonymous.GetStringAsync("/api/helios/publications", TestContext.Current.CancellationToken));
            using var other = server.CreateClient();
            var otherToken = await Csrf(other);
            Assert.Equal(HttpStatusCode.OK, (await Post(other, "/api/auth/register", new { email = "forker@example.test", password = "Forker-Password-2026!", displayName = "Forker" }, otherToken)).StatusCode);
            otherToken = await Csrf(other);
            Assert.Equal(HttpStatusCode.NotFound, (await Post(other, $"/api/projects/{projectId}/publish", new { expectedRevisionId = revisionId, title = "Stolen", previewPngBase64 = png }, otherToken)).StatusCode);
            var forked = await Post(other, $"/api/helios/publications/{publicId}/fork", new { }, otherToken);
            Assert.Equal(HttpStatusCode.Created, forked.StatusCode);
            using var forkedJson = await Body(forked);
            Assert.Equal(published, forkedJson.RootElement.GetProperty("source").GetString());
            Assert.NotEqual(projectId, forkedJson.RootElement.GetProperty("id").GetString());
            Assert.Equal(HttpStatusCode.NoContent, (await Delete(owner, $"/api/projects/{projectId}", token)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/api/helios/publications/{publicId}", TestContext.Current.CancellationToken)).StatusCode);
        }
        finally { SqliteConnection.ClearAllPools(); if (Directory.Exists(dataDir)) Directory.Delete(dataDir, recursive: true); }
    }
    [Fact]
    public async Task Authenticated_project_survives_restart_and_rejects_stale_and_other_account_access()
    {
        var dataDir = Path.Combine(Path.GetTempPath(), "leviathan-telos-tests", Guid.NewGuid().ToString("n"));
        string projectId;
        string savedRevision;
        const string source = "Model Reopen { Units: mm Box Body { Size: [4mm, 5mm, 6mm] } }";
        try
        {
            using (var server = new TelosFactory(dataDir))
            {
                using var alice = server.CreateClient();
                var token = await Csrf(alice);
                var register = await Post(alice, "/api/auth/register", new { email = "alice@example.test", password = "Alice-Correct-Password-2026", displayName = "Alice" }, token);
                Assert.Equal(HttpStatusCode.OK, register.StatusCode);
                token = await Csrf(alice);
                var created = await Post(alice, "/api/projects", new { appId = "helios", name = "Reopen", source = "initial" }, token);
                Assert.Equal(HttpStatusCode.Created, created.StatusCode);
                using var createdJson = await Body(created);
                projectId = createdJson.RootElement.GetProperty("id").GetString()!;
                var initialRevision = createdJson.RootElement.GetProperty("revisionId").GetString()!;
                var saved = await Put(alice, $"/api/projects/{projectId}", new { expectedRevisionId = initialRevision, source }, token);
                Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
                using var savedJson = await Body(saved);
                savedRevision = savedJson.RootElement.GetProperty("revisionId").GetString()!;
                var stale = await Put(alice, $"/api/projects/{projectId}", new { expectedRevisionId = initialRevision, source = "stale" }, token);
                Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);

                using var bob = server.CreateClient();
                var bobToken = await Csrf(bob);
                Assert.Equal(HttpStatusCode.OK, (await Post(bob, "/api/auth/register", new { email = "bob@example.test", password = "Bob-Correct-Password-2026", displayName = "Bob" }, bobToken)).StatusCode);
                bobToken = await Csrf(bob);
                Assert.Equal(HttpStatusCode.NotFound, (await bob.GetAsync($"/api/projects/{projectId}", TestContext.Current.CancellationToken)).StatusCode);
                Assert.Equal(HttpStatusCode.NotFound, (await Put(bob, $"/api/projects/{projectId}", new { expectedRevisionId = savedRevision, source = "intrusion" }, bobToken)).StatusCode);
                Assert.Equal(HttpStatusCode.NotFound, (await Delete(bob, $"/api/projects/{projectId}", bobToken)).StatusCode);
            }

            using (var restarted = new TelosFactory(dataDir))
            using (var alice = restarted.CreateClient())
            {
                var token = await Csrf(alice);
                Assert.Equal(HttpStatusCode.NoContent, (await Post(alice, "/api/auth/login", new { email = "alice@example.test", password = "Alice-Correct-Password-2026" }, token)).StatusCode);
                var reopened = await alice.GetAsync($"/api/projects/{projectId}", TestContext.Current.CancellationToken);
                Assert.Equal(HttpStatusCode.OK, reopened.StatusCode);
                using var json = await Body(reopened);
                Assert.Equal(source, json.RootElement.GetProperty("source").GetString());
                Assert.Equal(savedRevision, json.RootElement.GetProperty("revisionId").GetString());
            }
        }
        finally { SqliteConnection.ClearAllPools(); if (Directory.Exists(dataDir)) Directory.Delete(dataDir, recursive: true); }
    }

    [Fact]
    public async Task Project_mutation_requires_session_and_antiforgery()
    {
        var dataDir = Path.Combine(Path.GetTempPath(), "leviathan-telos-tests", Guid.NewGuid().ToString("n"));
        try
        {
            using var server = new TelosFactory(dataDir);
            using var client = server.CreateClient();
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/projects", TestContext.Current.CancellationToken)).StatusCode);
            var token = await Csrf(client);
            Assert.Equal(HttpStatusCode.OK, (await Post(client, "/api/auth/register", new { email = "csrf@example.test", password = "Csrf-Correct-Password-2026", displayName = "CSRF" }, token)).StatusCode);
            var missingToken = await client.PostAsJsonAsync("/api/projects", new { appId = "helios", name = "Denied", source = "source" }, TestContext.Current.CancellationToken);
            Assert.Equal(HttpStatusCode.BadRequest, missingToken.StatusCode);
        }
        finally { SqliteConnection.ClearAllPools(); if (Directory.Exists(dataDir)) Directory.Delete(dataDir, recursive: true); }
    }

    private static async Task<string> Csrf(HttpClient client)
    {
        using var response = await client.GetAsync("/api/auth/csrf", TestContext.Current.CancellationToken);
        response.EnsureSuccessStatusCode();
        using var json = await Body(response);
        return json.RootElement.GetProperty("token").GetString()!;
    }
    private static async Task<JsonDocument> Body(HttpResponseMessage response) => JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
    private static Task<HttpResponseMessage> Post(HttpClient client, string path, object body, string token) => Send(client, HttpMethod.Post, path, body, token);
    private static Task<HttpResponseMessage> Put(HttpClient client, string path, object body, string token) => Send(client, HttpMethod.Put, path, body, token);
    private static Task<HttpResponseMessage> Delete(HttpClient client, string path, string token) => Send(client, HttpMethod.Delete, path, null, token);
    private static async Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string path, object? body, string token)
    {
        using var request = new HttpRequestMessage(method, path);
        request.Headers.Add("X-CSRF-TOKEN", token);
        if (body is not null) request.Content = JsonContent.Create(body);
        return await client.SendAsync(request, TestContext.Current.CancellationToken);
    }
    private sealed class TelosFactory(string dataDir) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder) => builder.UseSetting("LEVIATHAN_DATA_DIR", dataDir).UseSetting("LEVIATHAN_ALLOW_UNSAFE_ADMIN", "false");
    }
}
