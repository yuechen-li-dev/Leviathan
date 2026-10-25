using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Leviathan.Server.Platform.Projects;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Leviathan.Server.Tests;

public sealed class LocalAuthorEndpointTests
{
    private sealed class Connection(bool loopback) : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app => {
            app.Use((context, following) => { context.Connection.RemoteIpAddress = IPAddress.Parse(loopback ? "127.0.0.1" : "192.0.2.5"); return following(); }); next(app);
        };
    }
    private sealed class Provider(string selected = "openai") : HttpMessageHandler
    {
        public int Calls;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) {
            ++Calls;
            if (selected == "openai") Assert.Equal("local-test-secret", request.Headers.Authorization!.Parameter);
            else Assert.Equal("local-test-secret", request.Headers.GetValues(selected == "anthropic" ? "x-api-key" : "x-goog-api-key").Single());
            if (request.Method == HttpMethod.Get) {
                Assert.Equal("https://api.openai.com/v1/models", request.RequestUri!.ToString());
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("private-provider-body") });
            }
            var body = selected switch {
                "openai" => """{"id":"r1","status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"Done"}]}],"usage":{}}""",
                "anthropic" => """{"id":"a1","stop_reason":"end_turn","content":[{"type":"text","text":"Done"}],"usage":{}}""",
                _ => """{"candidates":[{"finishReason":"STOP","content":{"role":"model","parts":[{"text":"Done"}]}}],"usageMetadata":{}}"""
            };
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json") });
        }
    }
    private sealed class Server(string directory, bool local, bool loopback, Provider provider) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder) {
            builder.UseEnvironment("Development").UseSetting("LEVIATHAN_DATA_DIR", Path.Combine(directory, "data"))
                .UseSetting("LEVIATHAN_ALLOW_UNSAFE_ADMIN", "false").UseSetting("HELIOS_LOCAL_AI", local.ToString())
                .UseSetting("urls", "http://localhost:5189").UseSetting("HELIOS_CONFIG_FILE", Path.Combine(directory, "helios.toml"))
                .UseSetting("OPENAI_API_KEY", "host-fallback-secret");
            builder.ConfigureTestServices(services => {
                services.AddSingleton<IStartupFilter>(new Connection(loopback));
                foreach (var name in new[] { "helios-openai", "helios-anthropic", "helios-gemini" }) services.AddHttpClient(name).ConfigurePrimaryHttpMessageHandler(() => provider);
            });
        }
    }
    private static async Task<string> Token(HttpClient client) => (await client.GetFromJsonAsync<JsonElement>("/api/auth/csrf", TestContext.Current.CancellationToken)).GetProperty("token").GetString()!;
    private static async Task<HttpResponseMessage> Post(HttpClient client, string path, object value, string token) {
        using var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(value) }; request.Headers.Add("X-CSRF-TOKEN", token);
        return await client.SendAsync(request, TestContext.Current.CancellationToken);
    }
    private static async Task<string> Register(HttpClient client) {
        using var result = await Post(client, "/api/auth/register", new { email = "local@example.test", password = "Fixture-Password-2026!", displayName = "Engineer" }, await Token(client));
        result.EnsureSuccessStatusCode(); return await Token(client);
    }

    [Fact]
    public async Task Local_keys_flow_through_the_existing_gateway_and_checks_are_authenticated_and_redacted()
    {
        var directory = Path.Combine(Path.GetTempPath(), "helios-local-endpoints", Guid.NewGuid().ToString("N")); Directory.CreateDirectory(directory);
        try {
            var file = Path.Combine(directory, "helios.toml"); File.WriteAllText(file, "[providers.openai]\napiKey = 'local-test-secret'");
            var provider = new Provider(); using var server = new Server(directory, true, true, provider); using var client = server.CreateClient();
            var status = await client.GetFromJsonAsync<JsonElement>("/api/helios/author/status", TestContext.Current.CancellationToken);
            Assert.True(status.GetProperty("configured").GetBoolean()); Assert.DoesNotContain("secret", status.GetRawText());
            using var unauthorized = await client.PostAsJsonAsync("/api/helios/author/local/test", new { provider = "openai" }, TestContext.Current.CancellationToken);
            Assert.Equal(HttpStatusCode.Unauthorized, unauthorized.StatusCode);
            var token = await Register(client);
            using var csrf = await client.PostAsJsonAsync("/api/helios/author/local/test", new { provider = "openai" }, TestContext.Current.CancellationToken);
            Assert.Equal(HttpStatusCode.BadRequest, csrf.StatusCode);
            using var checkedKey = await Post(client, "/api/helios/author/local/test", new { provider = "openai" }, token);
            checkedKey.EnsureSuccessStatusCode(); var body = await checkedKey.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
            Assert.DoesNotContain("private-provider-body", body); Assert.DoesNotContain("secret", body); Assert.Equal(1, provider.Calls);
            File.WriteAllText(file, "[providers.openai]\napiKey = 'secret-unclosed");
            status = await client.GetFromJsonAsync<JsonElement>("/api/helios/author/status", TestContext.Current.CancellationToken); Assert.False(status.GetProperty("configured").GetBoolean());
            using var invalid = await Post(client, "/api/helios/author/respond", new { model = "gpt-6.1-sol", root = "part.firmament", documents = new[] { "part.firmament" }, requirements = "Keep", input = new[] { new { role = "user", content = "Inspect" } } }, token);
            Assert.Equal(HttpStatusCode.ServiceUnavailable, invalid.StatusCode); Assert.DoesNotContain("secret", await invalid.Content.ReadAsStringAsync(TestContext.Current.CancellationToken)); Assert.Equal(1, provider.Calls);
        } finally { SqliteConnection.ClearAllPools(); Directory.Delete(directory, true); }
    }
    [Theory]
    [InlineData("openai", "gpt-6.1-sol")] [InlineData("anthropic", "claude-sonnet-5-5")] [InlineData("gemini", "gemini-3.8-flash")]
    public async Task Each_TOML_provider_key_reaches_its_existing_Dominatus_conversation_client(string providerId, string model)
    {
        var directory = Path.Combine(Path.GetTempPath(), "helios-local-endpoints", Guid.NewGuid().ToString("N")); Directory.CreateDirectory(directory);
        try {
            File.WriteAllText(Path.Combine(directory, "helios.toml"), $"[providers.{providerId}]\napiKey = 'local-test-secret'");
            var provider = new Provider(providerId); using var server = new Server(directory, true, true, provider); using var client = server.CreateClient(); var token = await Register(client);
            using var response = await Post(client, "/api/helios/author/respond", new { model, root = "part.firmament", documents = new[] { "part.firmament" }, requirements = "Keep", input = new[] { new { role = "user", content = "Inspect" } } }, token);
            response.EnsureSuccessStatusCode(); var result = await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
            Assert.Equal("Done", result.GetProperty("turn").GetProperty("text").GetString()); Assert.DoesNotContain("secret", result.GetRawText()); Assert.Equal(1, provider.Calls);
        } finally { SqliteConnection.ClearAllPools(); Directory.Delete(directory, true); }
    }

    [Theory]
    [InlineData(false, true)] [InlineData(true, false)]
    public async Task Remote_or_disabled_hosts_cannot_access_machine_settings_or_start_agents(bool enabled, bool loopback)
    {
        var directory = Path.Combine(Path.GetTempPath(), "helios-local-endpoints", Guid.NewGuid().ToString("N")); Directory.CreateDirectory(directory);
        try {
            File.WriteAllText(Path.Combine(directory, "helios.toml"), "broken secret TOML");
            using var server = new Server(directory, enabled, loopback, new Provider()); using var client = server.CreateClient(); var token = await Register(client);
            var status = await client.GetFromJsonAsync<JsonElement>("/api/helios/author/status", TestContext.Current.CancellationToken);
            Assert.Equal(JsonValueKind.Null, status.GetProperty("local").ValueKind);
            foreach (var path in new[] { "/test", "/open-config", "/ticket" }) {
                using var response = await Post(client, "/api/helios/author/local" + path, new { provider = "codex" }, token); Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
            }
        } finally { SqliteConnection.ClearAllPools(); Directory.Delete(directory, true); }
    }
}
