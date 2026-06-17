using Xunit;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Leviathan.Server.Ariadne;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Leviathan.Server.Tests;

public sealed class AriadnePersistenceTests
{

    [Fact]
    public async Task App_registry_exposes_rust_simulator_manifest_and_app_aware_sessions()
    {
        using var fixture = new LeviathanFactory();
        var client = fixture.CreateClient();

        var apps = await client.GetFromJsonAsync<LeviathanAppManifest[]>("/api/apps");
        var manifest = Assert.Single(Assert.IsAssignableFrom<IEnumerable<LeviathanAppManifest>>(apps));
        Assert.Equal("rust_simulator", manifest.AppId);
        Assert.Equal("Rust Simulator", manifest.DisplayName);
        Assert.Equal("ariadne/rust_simulator", manifest.PersistenceScope);
        Assert.Equal("/apps/rust-simulator", manifest.FrontendRoute);

        var createdResponse = await client.PostAsync("/api/apps/rust_simulator/sessions", null);
        createdResponse.EnsureSuccessStatusCode();
        var created = (await createdResponse.Content.ReadFromJsonAsync<CreateAriadneSessionResponse>())!;
        var screen = await client.GetFromJsonAsync<AriadneScreenDto>($"/api/apps/rust_simulator/sessions/{created.SessionId}/screen");

        Assert.NotNull(screen);
        Assert.Equal("rust_simulator", screen.AppId);
    }

    [Fact]
    public async Task Creating_session_writes_manifest_and_checkpoint()
    {
        using var fixture = new LeviathanFactory();
        var created = await CreateSession(fixture.CreateClient());

        Assert.True(File.Exists(fixture.CheckpointPath(created.SessionId)));
        Assert.True(File.Exists(fixture.ManifestPath(created.SessionId)));
    }

    [Fact]
    public async Task New_manager_instance_restores_session_from_disk_and_continues()
    {
        using var fixtureA = new LeviathanFactory();
        var clientA = fixtureA.CreateClient();
        var created = await CreateSession(clientA);
        var advanced = await Continue(clientA, created.Screen);
        Assert.True(File.Exists(fixtureA.CheckpointPath(created.SessionId)));

        using var fixtureB = new LeviathanFactory(fixtureA.DataDir);
        var clientB = fixtureB.CreateClient();
        var restored = await clientB.GetFromJsonAsync<AriadneScreenDto>($"/api/ariadne/sessions/{created.SessionId}/screen");

        Assert.NotNull(restored);
        Assert.Equal(created.SessionId, restored.SessionId);
        Assert.True(restored.WasRestored);
        Assert.True(restored.Transcript.Count >= advanced.Transcript.Count);
        Assert.True(restored.Revision >= advanced.Revision);

        var continued = await Continue(clientB, restored);
        Assert.Equal(created.SessionId, continued.SessionId);
    }

    [Fact]
    public async Task Session_listing_reports_safe_persisted_metadata()
    {
        using var fixture = new LeviathanFactory();
        var created = await CreateSession(fixture.CreateClient());

        var sessions = await fixture.CreateClient().GetFromJsonAsync<AriadneSessionListItemDto[]>("/api/ariadne/sessions");

        var listed = Assert.Single(Assert.IsAssignableFrom<IEnumerable<AriadneSessionListItemDto>>(sessions), s => s.SessionId == created.SessionId);
        Assert.Equal("rust_simulator", listed.AppId);
        Assert.True(listed.HasCheckpoint);
        Assert.True(listed.HasManifest);
        Assert.True(listed.UpdatedAt >= listed.CreatedAt);
    }

    [Fact]
    public async Task Corrupt_checkpoint_returns_controlled_problem_response()
    {
        using var fixture = new LeviathanFactory();
        var created = await CreateSession(fixture.CreateClient());
        await File.WriteAllTextAsync(fixture.CheckpointPath(created.SessionId), "not a dominatus checkpoint");

        using var restarted = new LeviathanFactory(fixture.DataDir);
        var response = await restarted.CreateClient().GetAsync($"/api/ariadne/sessions/{created.SessionId}/screen");

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("could not be restored", body);
    }

    [Fact]
    public async Task Unknown_session_returns_not_found()
    {
        using var fixture = new LeviathanFactory();
        var response = await fixture.CreateClient().GetAsync("/api/ariadne/sessions/missing-session/screen");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    private static async Task<CreateAriadneSessionResponse> CreateSession(HttpClient client)
    {
        var response = await client.PostAsJsonAsync("/api/ariadne/sessions", new CreateAriadneSessionRequest("rust_simulator"));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CreateAriadneSessionResponse>())!;
    }

    private static async Task<AriadneScreenDto> Continue(HttpClient client, AriadneScreenDto screen)
    {
        Assert.NotNull(screen.Prompt);
        HttpResponseMessage response = screen.Prompt.Kind switch
        {
            "line" => await client.PostAsJsonAsync($"/api/ariadne/sessions/{screen.SessionId}/advance", new AdvancePromptRequest(screen.Prompt.Id, screen.Revision)),
            "choice" => await client.PostAsJsonAsync($"/api/ariadne/sessions/{screen.SessionId}/choose", new ChoosePromptRequest(screen.Prompt.Id, screen.Revision, screen.Prompt.Choices[0].Key)),
            "text-input" => await client.PostAsJsonAsync($"/api/ariadne/sessions/{screen.SessionId}/input", new InputPromptRequest(screen.Prompt.Id, screen.Revision, "test input")),
            _ => throw new InvalidOperationException($"Unknown prompt kind '{screen.Prompt.Kind}'.")
        };
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<AriadneScreenDto>())!;
    }

    private sealed class LeviathanFactory : WebApplicationFactory<Program>
    {
        public LeviathanFactory(string? dataDir = null)
        {
            DataDir = dataDir ?? Path.Combine(Path.GetTempPath(), "leviathan-tests", Guid.NewGuid().ToString("n"));
        }

        public string DataDir { get; }
        public string CheckpointPath(string sessionId) => Path.Combine(DataDir, "ariadne", "rust_simulator", "sessions", sessionId, "checkpoint.dom1");
        public string ManifestPath(string sessionId) => Path.Combine(DataDir, "ariadne", "rust_simulator", "sessions", sessionId, "manifest.json");

        protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
        {
            builder.UseSetting("LEVIATHAN_DATA_DIR", DataDir);
        }
    }
}
