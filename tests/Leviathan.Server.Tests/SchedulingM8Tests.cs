using System.Net;
using System.Net.Http.Json;
using Leviathan.Server.Ariadne;
using Leviathan.Server.Apps.Scheduling.Api;
using Leviathan.Server.Apps.Scheduling.Domain;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace Leviathan.Server.Tests;

public sealed class SchedulingM8Tests
{
    [Fact]
    public async Task Registry_exposes_rust_simulator_and_scheduling()
    {
        using var fixture = new LeviathanFactory();
        var apps = await fixture.CreateClient().GetFromJsonAsync<LeviathanAppManifest[]>("/api/apps");
        Assert.Contains(apps!, a => a.AppId == "rust_simulator");
        var scheduling = Assert.Single(apps!, a => a.AppId == "scheduling");
        Assert.Equal("scheduling.resource-booking", scheduling.Kind);
        Assert.Equal("/apps/scheduling", scheduling.FrontendRoute);
        Assert.Equal("scheduling", scheduling.PersistenceScope);
    }

    [Fact]
    public async Task Claim_engine_blocks_same_resource_and_allows_different_resource()
    {
        using var fixture = new LeviathanFactory();
        var client = fixture.CreateClient();
        var setup = await CreateSetup(client, "m8-demo", twoResources: true);
        var from = DateTimeOffset.Parse("2030-01-07T09:00:00Z");
        var to = DateTimeOffset.Parse("2030-01-07T12:00:00Z");
        var slots = await client.GetFromJsonAsync<BookableSlotDto[]>($"/api/apps/scheduling/public/m8-demo/slots?serviceId={setup.ServiceId}&from={Uri.EscapeDataString(from.ToString("O"))}&to={Uri.EscapeDataString(to.ToString("O"))}&timeZone=UTC");
        Assert.Contains(slots!, s => s.ResourceId == setup.ResourceId);

        var hold = await Hold(client, setup.ProviderId, setup.ServiceId, setup.ResourceId, from, from.AddMinutes(30));
        var blocked = await client.PostAsJsonAsync("/api/apps/scheduling/holds", new CreateHoldRequest(setup.ProviderId, setup.ServiceId, setup.ResourceId, from, from.AddMinutes(30), "UTC"));
        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);

        var intake = await client.PostAsJsonAsync($"/api/apps/scheduling/holds/{hold.HoldId}/intake", new SubmitIntakeRequest(hold.ClaimToken, "Ada", "ada@example.test", null, "notes"));
        intake.EnsureSuccessStatusCode();
        var bookingResponse = await client.PostAsJsonAsync("/api/apps/scheduling/bookings/confirm", new ConfirmBookingRequest(hold.HoldId, hold.ClaimToken, null));
        bookingResponse.EnsureSuccessStatusCode();
        var booking = (await bookingResponse.Content.ReadFromJsonAsync<Booking>())!;
        Assert.Equal("confirmed", booking.Status);

        var overlappingAfterBooking = await client.PostAsJsonAsync("/api/apps/scheduling/holds", new CreateHoldRequest(setup.ProviderId, setup.ServiceId, setup.ResourceId, from, from.AddMinutes(30), "UTC"));
        Assert.Equal(HttpStatusCode.Conflict, overlappingAfterBooking.StatusCode);

        var differentResource = await Hold(client, setup.ProviderId, setup.ServiceId, setup.SecondResourceId!, from, from.AddMinutes(30));
        Assert.Equal("active", differentResource.Status);

        var auditResponse = await client.GetAsync($"/api/apps/scheduling/bookings/{booking.Id.Value}/audit?providerId={setup.ProviderId}");
        var auditBody = await auditResponse.Content.ReadAsStringAsync();
        Assert.True(auditResponse.IsSuccessStatusCode, auditBody);
        var audit = System.Text.Json.JsonSerializer.Deserialize<BookingAuditEvent[]>(auditBody, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web));
        Assert.Contains(audit!, e => e.EventType == "booking_confirmed");
        Assert.True(File.Exists(Path.Combine(fixture.DataDir, "scheduling", "providers", setup.ProviderId, "bookings", booking.Id.Value, "booking.json")));
    }

    [Fact]
    public async Task Expired_hold_releases_slot_in_store_path()
    {
        using var fixture = new LeviathanFactory();
        var client = fixture.CreateClient();
        var setup = await CreateSetup(client, "m8-expire", twoResources: false);
        var start = DateTimeOffset.Parse("2030-01-07T10:00:00Z");
        var hold = await Hold(client, setup.ProviderId, setup.ServiceId, setup.ResourceId, start, start.AddMinutes(30));
        var path = Path.Combine(fixture.DataDir, "scheduling", "providers", setup.ProviderId, "holds", "active", hold.HoldId + ".json");
        var json = await File.ReadAllTextAsync(path);
        await File.WriteAllTextAsync(path, json.Replace(hold.ExpiresAt.ToString("O"), DateTimeOffset.UtcNow.AddMinutes(-1).ToString("O")));
        var released = await Hold(client, setup.ProviderId, setup.ServiceId, setup.ResourceId, start, start.AddMinutes(30));
        Assert.Equal("active", released.Status);
    }

    private static async Task<(string ProviderId, string ServiceId, string ResourceId, string? SecondResourceId)> CreateSetup(HttpClient client, string slug, bool twoResources)
    {
        var provider = (await (await client.PostAsJsonAsync("/api/apps/scheduling/providers", new CreateProviderRequest(slug, "M8 Demo", "UTC", null, null))).Content.ReadFromJsonAsync<Provider>())!;
        var resource = (await (await client.PostAsJsonAsync("/api/apps/scheduling/resources", new CreateResourceRequest(provider.Id.Value, "Room A", "room", "UTC"))).Content.ReadFromJsonAsync<BookableResource>())!;
        BookableResource? second = null;
        if (twoResources) second = (await (await client.PostAsJsonAsync("/api/apps/scheduling/resources", new CreateResourceRequest(provider.Id.Value, "Room B", "room", "UTC"))).Content.ReadFromJsonAsync<BookableResource>())!;
        var service = (await (await client.PostAsJsonAsync("/api/apps/scheduling/services", new CreateServiceRequest(provider.Id.Value, "Consult", null, 30))).Content.ReadFromJsonAsync<SchedulingService>())!;
        await client.PostAsJsonAsync($"/api/apps/scheduling/services/{service.Id.Value}/resources", new AssignResourceRequest(provider.Id.Value, resource.Id.Value));
        if (second is not null) await client.PostAsJsonAsync($"/api/apps/scheduling/services/{service.Id.Value}/resources", new AssignResourceRequest(provider.Id.Value, second.Id.Value));
        await client.PostAsJsonAsync("/api/apps/scheduling/availability-rules", new CreateAvailabilityRuleRequest(provider.Id.Value, resource.Id.Value, "UTC", [DayOfWeek.Monday], "09:00", "12:00", null, null));
        if (second is not null) await client.PostAsJsonAsync("/api/apps/scheduling/availability-rules", new CreateAvailabilityRuleRequest(provider.Id.Value, second.Id.Value, "UTC", [DayOfWeek.Monday], "09:00", "12:00", null, null));
        return (provider.Id.Value, service.Id.Value, resource.Id.Value, second?.Id.Value);
    }
    private static async Task<HoldResponse> Hold(HttpClient client, string providerId, string serviceId, string resourceId, DateTimeOffset start, DateTimeOffset end)
    {
        var response = await client.PostAsJsonAsync("/api/apps/scheduling/holds", new CreateHoldRequest(providerId, serviceId, resourceId, start, end, "UTC"));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<HoldResponse>())!;
    }
    private sealed class LeviathanFactory : WebApplicationFactory<Program>
    {
        public string DataDir { get; } = Path.Combine(Path.GetTempPath(), "leviathan-tests", Guid.NewGuid().ToString("n"));
        protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder) => builder.UseSetting("LEVIATHAN_DATA_DIR", DataDir);
    }
}
