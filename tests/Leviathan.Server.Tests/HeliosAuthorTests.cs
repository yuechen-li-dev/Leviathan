using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Leviathan.Server.Tests;

public sealed class HeliosAuthorTests
{
    [Fact]
    public async Task Uploaded_evidence_is_account_scoped_and_callable_through_the_admitted_SK_gateway()
    {
        var directory = Path.Combine(Path.GetTempPath(), "helios-evidence-tests", Guid.NewGuid().ToString("N"));
        try
        {
            using var server = new Server(directory, new Provider(), false); using var client = server.CreateClient();
            var token = await Csrf(client);
            (await Post(client, "/api/auth/register", new { email = "evidence@example.test", password = "Author-Password-2026!", displayName = "Engineer" }, token)).EnsureSuccessStatusCode();
            token = await Csrf(client);
            var upload = new { name = "motor.md", contentBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes("Mounting pitch is 31 mm.")) };
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/helios/author/references", upload, TestContext.Current.CancellationToken)).StatusCode);
            using var uploaded = await Post(client, "/api/helios/author/references", upload, token); uploaded.EnsureSuccessStatusCode();
            var reference = await uploaded.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
            var id = reference.GetProperty("id").GetString()!;
            object Search(string selected) => new { name = "engineering__search_references", arguments = new { query = "pitch" }, referenceIds = new[] { selected }, root = "plate.firmament", documentHashes = new { }, requirements = "Keep pitch" };
            using var result = await Post(client, "/api/helios/author/tools/invoke", Search(id), token); result.EnsureSuccessStatusCode();
            var found = await result.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
            Assert.Equal(reference.GetProperty("sha256").GetString(), found.GetProperty("matches")[0].GetProperty("sha256").GetString());
            Assert.Equal("line:1", found.GetProperty("matches")[0].GetProperty("locator").GetString());
            using var foreignClient = server.CreateClient(); var foreignToken = await Csrf(foreignClient);
            (await Post(foreignClient, "/api/auth/register", new { email = "other@example.test", password = "Author-Password-2026!", displayName = "Other" }, foreignToken)).EnsureSuccessStatusCode();
            foreignToken = await Csrf(foreignClient);
            Assert.Equal(HttpStatusCode.BadRequest, (await Post(foreignClient, "/api/helios/author/tools/invoke", Search(id), foreignToken)).StatusCode);
            var listed = await foreignClient.GetFromJsonAsync<JsonElement>("/api/helios/author/references", TestContext.Current.CancellationToken);
            Assert.Empty(listed.EnumerateArray());
        }
        finally { SqliteConnection.ClearAllPools(); if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }
    private sealed class Provider : HttpMessageHandler
    {
        public List<JsonElement> Requests { get; } = [];
        public bool Fail { get; set; }
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Assert.Equal("application/json", request.Content!.Headers.ContentType!.MediaType);
            using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct));
            Requests.Add(body.RootElement.Clone());
            if (Fail) return new(HttpStatusCode.TooManyRequests) { Content = new StringContent("fixture-secret private-source") };
            if (request.RequestUri!.Host == "api.anthropic.com")
            {
                Assert.Equal("https://api.anthropic.com/v1/messages", request.RequestUri.ToString());
                Assert.Equal("fixture-anthropic", request.Headers.GetValues("x-api-key").Single());
                Assert.Equal("2023-06-01", request.Headers.GetValues("anthropic-version").Single());
                var continued = body.RootElement.GetProperty("messages").GetArrayLength() > 1;
                return new(HttpStatusCode.OK) { Content = new StringContent(continued
                    ? """{"id":"a2","stop_reason":"end_turn","content":[{"type":"text","text":"Done"}],"usage":{}}"""
                    : """{"id":"a1","stop_reason":"tool_use","content":[{"type":"thinking","thinking":"private","signature":"opaque-claude"},{"type":"tool_use","id":"c1","name":"build","input":{}}],"usage":{}}""", Encoding.UTF8, "application/json") };
            }
            if (request.RequestUri.Host == "generativelanguage.googleapis.com")
            {
                Assert.StartsWith("https://generativelanguage.googleapis.com/v1beta/models/", request.RequestUri.ToString());
                Assert.EndsWith(":generateContent", request.RequestUri.ToString());
                Assert.Empty(request.RequestUri.Query);
                Assert.Equal("fixture-gemini", request.Headers.GetValues("x-goog-api-key").Single());
                var continued = body.RootElement.GetProperty("contents").GetArrayLength() > 1;
                return new(HttpStatusCode.OK) { Content = new StringContent(continued
                    ? """{"candidates":[{"finishReason":"STOP","content":{"role":"model","parts":[{"text":"Done"}]}}],"usageMetadata":{}}"""
                    : """{"candidates":[{"finishReason":"STOP","content":{"role":"model","parts":[{"functionCall":{"id":"c1","name":"build","args":{}},"thoughtSignature":"opaque-gemini"}]}}],"usageMetadata":{}}""", Encoding.UTF8, "application/json") };
            }
            Assert.Equal("https://api.openai.com/v1/responses", request.RequestUri.ToString());
            Assert.Equal("fixture-not-real", request.Headers.Authorization!.Parameter);
            return new(HttpStatusCode.OK) { Content = new StringContent("""{"id":"r1","status":"completed","output":[{"type":"reasoning","encrypted_content":"opaque","summary":[]},{"type":"function_call","call_id":"c1","name":"build","arguments":"{}"}],"usage":{"input_tokens":20,"output_tokens":5}}""", Encoding.UTF8, "application/json") };
        }
    }
    private sealed class Server(string directory, Provider provider, bool configured) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development").UseSetting("LEVIATHAN_DATA_DIR", directory)
                .UseSetting("LEVIATHAN_ALLOW_UNSAFE_ADMIN", "false").UseSetting("OPENAI_API_KEY", configured ? "fixture-not-real" : "")
                .UseSetting("ANTHROPIC_API_KEY", configured ? "fixture-anthropic" : "").UseSetting("GEMINI_API_KEY", configured ? "fixture-gemini" : "");
            builder.ConfigureTestServices(services => {
                foreach (var name in new[] { "helios-openai", "helios-anthropic", "helios-gemini" })
                    services.AddHttpClient(name).ConfigurePrimaryHttpMessageHandler(() => provider);
            });
        }
    }
    private static async Task<string> Csrf(HttpClient client)
    {
        var value = await client.GetFromJsonAsync<JsonElement>("/api/auth/csrf", TestContext.Current.CancellationToken);
        return value.GetProperty("token").GetString()!;
    }
    private static async Task<HttpResponseMessage> Post(HttpClient client, string path, object body, string token)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body) };
        request.Headers.Add("X-CSRF-TOKEN", token);
        return await client.SendAsync(request, TestContext.Current.CancellationToken);
    }
    private static object Request(string model) => new { model, root = "part.firmament", documents = new[] { "part.firmament", "parts/rod.firmament" }, requirements = "Preserve mounting interfaces", input = new[] { new { role = "user", content = "Inspect the part" } } };

    [Fact]
    public async Task Authenticated_gateway_preserves_models_tools_context_and_provider_items()
    {
        var directory = Path.Combine(Path.GetTempPath(), "helios-author-tests", Guid.NewGuid().ToString("N"));
        try
        {
            var provider = new Provider(); using var server = new Server(directory, provider, true);
            using var client = server.CreateClient();
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/helios/author/respond", Request("gpt-6.1-sol"), TestContext.Current.CancellationToken)).StatusCode);
            var token = await Csrf(client);
            (await Post(client, "/api/auth/register", new { email = "author@example.test", password = "Author-Password-2026!", displayName = "Author" }, token)).EnsureSuccessStatusCode();
            token = await Csrf(client);
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/helios/author/respond", Request("gpt-6.1-sol"), TestContext.Current.CancellationToken)).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await Post(client, "/api/helios/author/respond", Request("invented-model"), token)).StatusCode);
            foreach (var model in new[] { "gpt-6-astra", "gpt-6.1-sol", "gpt-6-luna" })
            {
                using var result = await Post(client, "/api/helios/author/respond", Request(model), token); result.EnsureSuccessStatusCode();
                var json = await result.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
                Assert.Equal("opaque", json.GetProperty("turn").GetProperty("output")[0].GetProperty("encrypted_content").GetString());
                Assert.Equal("build", json.GetProperty("turn").GetProperty("calls")[0].GetProperty("name").GetString());
                var sent = provider.Requests[^1];
                Assert.Equal(model, sent.GetProperty("model").GetString()); Assert.False(sent.GetProperty("store").GetBoolean());
                Assert.Contains("Preserve mounting interfaces", sent.GetProperty("instructions").GetString());
                Assert.Contains("parts/rod.firmament", sent.GetProperty("instructions").GetString());
            }
            Assert.Equal(3, provider.Requests.Count);
        }
        finally { SqliteConnection.ClearAllPools(); if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }

    [Fact]
    public async Task Missing_key_is_explicit_and_does_not_call_provider()
    {
        var directory = Path.Combine(Path.GetTempPath(), "helios-author-tests", Guid.NewGuid().ToString("N"));
        try
        {
            var provider = new Provider(); using var server = new Server(directory, provider, false); using var client = server.CreateClient();
            var status = await client.GetFromJsonAsync<JsonElement>("/api/helios/author/status", TestContext.Current.CancellationToken);
            Assert.False(status.GetProperty("configured").GetBoolean());
            var token = await Csrf(client);
            (await Post(client, "/api/auth/register", new { email = "unconfigured@example.test", password = "Author-Password-2026!", displayName = "Author" }, token)).EnsureSuccessStatusCode();
            token = await Csrf(client);
            foreach (var model in new[] { "gpt-6.1-sol", "claude-opus-5-5", "gemini-4-argon" })
            {
                using var result = await Post(client, "/api/helios/author/respond", Request(model), token);
                Assert.Equal(HttpStatusCode.ServiceUnavailable, result.StatusCode); Assert.Empty(provider.Requests);
                Assert.Contains("author_provider_not_configured", await result.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
            }
            Assert.All(status.GetProperty("providers").EnumerateArray(), p => Assert.False(p.GetProperty("configured").GetBoolean()));
        }
        finally { SqliteConnection.ClearAllPools(); if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }

    [Theory]
    [InlineData("claude-opus-5-5", false)] [InlineData("claude-sonnet-5-5", false)] [InlineData("claude-haiku-5-5", false)]
    [InlineData("gemini-4-argon", true)] [InlineData("gemini-3.8-flash", true)]
    public async Task Native_providers_complete_authenticated_tool_roundtrips_without_cross_routing(string model, bool gemini)
    {
        var directory = Path.Combine(Path.GetTempPath(), "helios-author-tests", Guid.NewGuid().ToString("N"));
        try
        {
            var provider = new Provider(); using var server = new Server(directory, provider, true); using var client = server.CreateClient();
            var status = await client.GetFromJsonAsync<JsonElement>("/api/helios/author/status", TestContext.Current.CancellationToken);
            Assert.Equal(3, status.GetProperty("providers").GetArrayLength());
            var token = await Csrf(client);
            (await Post(client, "/api/auth/register", new { email = "native@example.test", password = "Author-Password-2026!", displayName = "Author" }, token)).EnsureSuccessStatusCode();
            token = await Csrf(client);
            using var first = await Post(client, "/api/helios/author/respond", Request(model), token); first.EnsureSuccessStatusCode();
            var turn = (await first.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken)).GetProperty("turn");
            Assert.Equal("build", turn.GetProperty("calls")[0].GetProperty("name").GetString());
            var output = turn.GetProperty("output")[0];
            Assert.Equal(gemini ? "gemini" : "anthropic", output.GetProperty("provider").GetString());
            Assert.Equal(model, output.GetProperty("model").GetString());
            var initial = JsonSerializer.SerializeToElement(new { role = "user", content = "Inspect" });
            var result = JsonSerializer.SerializeToElement(new { type = "function_call_output", call_id = "c1", output = "{\"ok\":true,\"result\":{\"accepted\":true}}" });
            using var second = await Post(client, "/api/helios/author/respond", new { model, root = "part.firmament", documents = new[] { "part.firmament" }, requirements = "Keep holes", input = new[] { initial, output, result } }, token);
            second.EnsureSuccessStatusCode();
            Assert.Equal("Done", (await second.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken)).GetProperty("turn").GetProperty("text").GetString());
            var sent = provider.Requests[^1];
            var messages = sent.GetProperty(gemini ? "contents" : "messages");
            Assert.Equal(output.GetProperty("message").GetRawText(), messages[1].GetRawText());
            Assert.Contains("Keep holes", sent.GetProperty(gemini ? "systemInstruction" : "system").ToString());
            provider.Fail = true;
            using var failed = await Post(client, "/api/helios/author/respond", Request(model), token);
            Assert.Equal(HttpStatusCode.BadGateway, failed.StatusCode);
            var failure = await failed.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
            Assert.Contains("author_provider_failed", failure); Assert.DoesNotContain("fixture-secret", failure); Assert.DoesNotContain("private-source", failure);
        }
        finally { SqliteConnection.ClearAllPools(); if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }
}
