using System.Net;
using System.Net.Http.Json;
using Leviathan.Server.Ariadne;
using Leviathan.Server.Apps.Scheduling.Api;
using Leviathan.Server.Apps.Scheduling.Domain;
using Leviathan.Server.Apps.Scheduling.Runtime;
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
        var confirmedAudit = Assert.Single(audit!, e => e.EventType == "booking_confirmed");
        Assert.Equal("UTC", confirmedAudit.Data["timeZoneId"]);
        Assert.Equal("accepted", confirmedAudit.Data["decision"]);
        Assert.True(File.Exists(Path.Combine(fixture.DataDir, "scheduling", "providers", setup.ProviderId, "bookings", booking.Id.Value, "booking.json")));
    }


    [Fact]
    public async Task Los_Angeles_rule_expands_to_correct_utc_and_customer_timezone_only_changes_display()
    {
        using var fixture = new LeviathanFactory();
        var client = fixture.CreateClient();
        var setup = await CreateSetup(client, "m9-la", twoResources: false, timeZone: "America/Los_Angeles");
        var from = DateTimeOffset.Parse("2030-07-01T00:00:00Z");
        var to = DateTimeOffset.Parse("2030-07-02T00:00:00Z");
        var slots = await client.GetFromJsonAsync<BookableSlotDto[]>($"/api/apps/scheduling/public/m9-la/slots?serviceId={setup.ServiceId}&from={Uri.EscapeDataString(from.ToString("O"))}&to={Uri.EscapeDataString(to.ToString("O"))}&timeZone=America%2FNew_York");
        var slot = Assert.Single(slots!, s => s.StartsAtUtc == DateTimeOffset.Parse("2030-07-01T16:00:00Z"));
        Assert.Equal("America/Los_Angeles", slot.ProviderTimeZoneId);
        Assert.Equal("America/New_York", slot.DisplayTimeZoneId);
        Assert.Contains("America/New_York", slot.DisplayLabel);
    }

    [Fact]
    public async Task Invalid_timezone_returns_controlled_error_and_admin_gate_blocks_without_opt_in()
    {
        using var gated = new LeviathanFactory(allowUnsafeAdmin: false);
        var forbidden = await gated.CreateClient().PostAsJsonAsync("/api/apps/scheduling/providers", new CreateProviderRequest("blocked", "Blocked", "UTC", null, null));
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);

        using var fixture = new LeviathanFactory();
        var bad = await fixture.CreateClient().PostAsJsonAsync("/api/apps/scheduling/providers", new CreateProviderRequest("bad-tz", "Bad", "Not/AZone", null, null));
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        var error = await bad.Content.ReadFromJsonAsync<SchedulingError>();
        Assert.Equal("invalid_timezone", error!.Error);
    }

    [Fact]
    public async Task Corrupt_booking_file_fails_claim_safely()
    {
        using var fixture = new LeviathanFactory();
        var client = fixture.CreateClient();
        var setup = await CreateSetup(client, "m9-corrupt", twoResources: false);
        var bookingDir = Path.Combine(fixture.DataDir, "scheduling", "providers", setup.ProviderId, "bookings", "broken");
        Directory.CreateDirectory(bookingDir);
        await File.WriteAllTextAsync(Path.Combine(bookingDir, "booking.json"), "{ not json");
        var response = await client.PostAsJsonAsync("/api/apps/scheduling/holds", new CreateHoldRequest(setup.ProviderId, setup.ServiceId, setup.ResourceId, DateTimeOffset.Parse("2030-01-07T09:00:00Z"), DateTimeOffset.Parse("2030-01-07T09:30:00Z"), "UTC"));
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
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
        var stored = (await System.Text.Json.JsonSerializer.DeserializeAsync<Hold>(File.OpenRead(path), new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web)))!;
        await File.WriteAllTextAsync(path, System.Text.Json.JsonSerializer.Serialize(stored with { ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1) }, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web)));
        var released = await Hold(client, setup.ProviderId, setup.ServiceId, setup.ResourceId, start, start.AddMinutes(30));
        Assert.Equal("active", released.Status);
    }


    [Fact]
    public async Task Dominatus_lifecycle_checkpoints_advance_and_restore_summary()
    {
        using var fixture = new LeviathanFactory();
        var client = fixture.CreateClient();
        var setup = await CreateSetup(client, "m10-life", twoResources: false);
        var start = DateTimeOffset.Parse("2030-01-07T09:00:00Z");

        var hold = await Hold(client, setup.ProviderId, setup.ServiceId, setup.ResourceId, start, start.AddMinutes(30));
        var holdCheckpoint = Path.Combine(fixture.DataDir, "scheduling", "providers", setup.ProviderId, "holds", "active", hold.HoldId, "lifecycle.dom1");
        Assert.True(File.Exists(holdCheckpoint));
        var holdLifecycle = await client.GetFromJsonAsync<SchedulingLifecycleSummary>($"/api/apps/scheduling/holds/{hold.HoldId}/lifecycle?providerId={setup.ProviderId}");
        Assert.Equal("AwaitingIntake", holdLifecycle!.CurrentWorkflowState);
        Assert.True(holdLifecycle.HasCheckpoint);

        var intake = await client.PostAsJsonAsync($"/api/apps/scheduling/holds/{hold.HoldId}/intake", new SubmitIntakeRequest(hold.ClaimToken, "Ada", "ada@example.test", null, null));
        intake.EnsureSuccessStatusCode();
        var intakeLifecycle = await client.GetFromJsonAsync<SchedulingLifecycleSummary>($"/api/apps/scheduling/holds/{hold.HoldId}/lifecycle?providerId={setup.ProviderId}");
        Assert.Equal("IntakeSubmitted", intakeLifecycle!.CurrentWorkflowState);
        Assert.False(string.IsNullOrWhiteSpace(intakeLifecycle.LastAuditEventId));

        var bookingResponse = await client.PostAsJsonAsync("/api/apps/scheduling/bookings/confirm", new ConfirmBookingRequest(hold.HoldId, hold.ClaimToken, null));
        bookingResponse.EnsureSuccessStatusCode();
        var booking = (await bookingResponse.Content.ReadFromJsonAsync<Booking>())!;
        var bookingCheckpoint = Path.Combine(fixture.DataDir, "scheduling", "providers", setup.ProviderId, "bookings", booking.Id.Value, "lifecycle.dom1");
        Assert.True(File.Exists(bookingCheckpoint));
        var bookingLifecycle = await client.GetFromJsonAsync<SchedulingLifecycleSummary>($"/api/apps/scheduling/bookings/{booking.Id.Value}/lifecycle");
        Assert.Equal("Confirmed", bookingLifecycle!.CurrentWorkflowState);
        Assert.Equal(booking.Id.Value, bookingLifecycle.BookingId);
        Assert.False(string.IsNullOrWhiteSpace(bookingLifecycle.LastAuditEventId));

        var audit = await client.GetFromJsonAsync<BookingAuditEvent[]>($"/api/apps/scheduling/bookings/{booking.Id.Value}/audit?providerId={setup.ProviderId}");
        var confirmed = Assert.Single(audit!, e => e.EventType == "booking_confirmed");
        Assert.Equal("Confirmed", confirmed.Data["lifecycleState"]);
        Assert.EndsWith("lifecycle.dom1", confirmed.Data["lifecycleCheckpoint"]);
    }

    [Fact]
    public async Task Expired_hold_advances_lifecycle_to_expired()
    {
        using var fixture = new LeviathanFactory();
        var client = fixture.CreateClient();
        var setup = await CreateSetup(client, "m10-expire", twoResources: false);
        var start = DateTimeOffset.Parse("2030-01-07T11:00:00Z");
        var hold = await Hold(client, setup.ProviderId, setup.ServiceId, setup.ResourceId, start, start.AddMinutes(30));
        var path = Path.Combine(fixture.DataDir, "scheduling", "providers", setup.ProviderId, "holds", "active", hold.HoldId + ".json");
        var stored = (await System.Text.Json.JsonSerializer.DeserializeAsync<Hold>(File.OpenRead(path), new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web)))!;
        await File.WriteAllTextAsync(path, System.Text.Json.JsonSerializer.Serialize(stored with { ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1) }, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web)));

        var response = await client.PostAsJsonAsync($"/api/apps/scheduling/holds/{hold.HoldId}/intake", new SubmitIntakeRequest(hold.ClaimToken, "Ada", "ada@example.test", null, null));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var lifecycle = await client.GetFromJsonAsync<SchedulingLifecycleSummary>($"/api/apps/scheduling/holds/{hold.HoldId}/lifecycle?providerId={setup.ProviderId}");
        Assert.Equal("Expired", lifecycle!.CurrentWorkflowState);
        Assert.Equal("expired", lifecycle.Status);
        Assert.False(string.IsNullOrWhiteSpace(lifecycle.LastAuditEventId));
    }

    [Fact]
    public async Task Confirmed_booking_can_be_cancelled_and_releases_same_resource_slot()
    {
        using var fixture = new LeviathanFactory();
        var client = fixture.CreateClient();
        var setup = await CreateSetup(client, "m11-cancel", twoResources: true);
        var start = DateTimeOffset.Parse("2030-01-07T09:30:00Z");
        var booking = await ConfirmBooking(client, setup.ProviderId, setup.ServiceId, setup.ResourceId, start);

        var cancelResponse = await client.PostAsJsonAsync($"/api/apps/scheduling/bookings/{booking.Id.Value}/cancel", new CancelBookingRequest("customer_requested", "Customer asked to move the visit.", "provider"));
        cancelResponse.EnsureSuccessStatusCode();
        var cancelled = (await cancelResponse.Content.ReadFromJsonAsync<CancelBookingResponse>())!;
        Assert.Equal("cancelled", cancelled.Booking.Status);
        Assert.Equal("customer_requested", cancelled.Booking.CancellationReasonCode);
        Assert.Equal("provider", cancelled.Booking.CancellationActor);
        Assert.Equal("accepted_confirmed_booking", cancelled.Booking.CancellationPolicyResult);
        Assert.False(string.IsNullOrWhiteSpace(cancelled.AuditEventId));
        Assert.Equal("Cancelled", cancelled.Lifecycle.CurrentWorkflowState);
        Assert.Equal(cancelled.AuditEventId, cancelled.Lifecycle.LastAuditEventId);
        Assert.True(File.Exists(Path.Combine(fixture.DataDir, "scheduling", "providers", setup.ProviderId, "bookings", booking.Id.Value, "lifecycle.dom1")));

        var audit = await client.GetFromJsonAsync<BookingAuditEvent[]>($"/api/apps/scheduling/bookings/{booking.Id.Value}/audit?providerId={setup.ProviderId}");
        var requested = Assert.Single(audit!, e => e.EventType == "booking_cancellation_requested");
        Assert.Equal("customer_requested", requested.Data["reasonCode"]);
        var completed = Assert.Single(audit!, e => e.EventType == "booking_cancelled");
        Assert.Equal("Cancelled", completed.Data["lifecycleState"]);
        Assert.Equal("accepted_confirmed_booking", completed.Data["policyResult"]);

        var releasedHold = await Hold(client, setup.ProviderId, setup.ServiceId, setup.ResourceId, start, start.AddMinutes(30));
        Assert.Equal("active", releasedHold.Status);

        var secondResourceHold = await Hold(client, setup.ProviderId, setup.ServiceId, setup.SecondResourceId!, start, start.AddMinutes(30));
        Assert.Equal("active", secondResourceHold.Status);
    }

    [Fact]
    public async Task Cancellation_rejects_unknown_and_already_cancelled_bookings()
    {
        using var fixture = new LeviathanFactory();
        var client = fixture.CreateClient();
        var setup = await CreateSetup(client, "m11-cancel-errors", twoResources: false);
        var booking = await ConfirmBooking(client, setup.ProviderId, setup.ServiceId, setup.ResourceId, DateTimeOffset.Parse("2030-01-07T10:30:00Z"));

        var unknown = await client.PostAsJsonAsync("/api/apps/scheduling/bookings/missing/cancel", new CancelBookingRequest("customer_requested", null, "provider"));
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);

        var first = await client.PostAsJsonAsync($"/api/apps/scheduling/bookings/{booking.Id.Value}/cancel", new CancelBookingRequest("customer_requested", null, "provider"));
        first.EnsureSuccessStatusCode();
        var second = await client.PostAsJsonAsync($"/api/apps/scheduling/bookings/{booking.Id.Value}/cancel", new CancelBookingRequest("customer_requested", null, "provider"));
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);

        var audit = await client.GetFromJsonAsync<BookingAuditEvent[]>($"/api/apps/scheduling/bookings/{booking.Id.Value}/audit?providerId={setup.ProviderId}");
        Assert.Contains(audit!, e => e.EventType == "booking_cancellation_rejected" && e.Data["policyResult"] == "rejected_not_confirmed");
    }

    [Fact]
    public async Task Cancelled_booking_lifecycle_summary_and_ics_are_safe()
    {
        using var fixture = new LeviathanFactory();
        var client = fixture.CreateClient();
        var setup = await CreateSetup(client, "m11-cancel-life", twoResources: false);
        var booking = await ConfirmBooking(client, setup.ProviderId, setup.ServiceId, setup.ResourceId, DateTimeOffset.Parse("2030-01-07T11:00:00Z"));

        var normalIcs = await client.GetAsync($"/api/apps/scheduling/bookings/{booking.Id.Value}/ics");
        Assert.True(normalIcs.IsSuccessStatusCode);

        await (await client.PostAsJsonAsync($"/api/apps/scheduling/bookings/{booking.Id.Value}/cancel", new CancelBookingRequest("provider_unavailable", null, "provider"))).Content.ReadAsStringAsync();
        var lifecycle = await client.GetFromJsonAsync<SchedulingLifecycleSummary>($"/api/apps/scheduling/bookings/{booking.Id.Value}/lifecycle");
        Assert.Equal("Cancelled", lifecycle!.CurrentWorkflowState);
        Assert.Equal("cancelled", lifecycle.Status);
        Assert.False(string.IsNullOrWhiteSpace(lifecycle.LastAuditEventId));

        var cancelledIcs = await client.GetAsync($"/api/apps/scheduling/bookings/{booking.Id.Value}/ics");
        Assert.Equal(HttpStatusCode.BadRequest, cancelledIcs.StatusCode);
    }

    private static async Task<(string ProviderId, string ServiceId, string ResourceId, string? SecondResourceId)> CreateSetup(HttpClient client, string slug, bool twoResources, string timeZone = "UTC")
    {
        var provider = (await (await client.PostAsJsonAsync("/api/apps/scheduling/providers", new CreateProviderRequest(slug, "M8 Demo", timeZone, null, null))).Content.ReadFromJsonAsync<Provider>())!;
        var resource = (await (await client.PostAsJsonAsync("/api/apps/scheduling/resources", new CreateResourceRequest(provider.Id.Value, "Room A", "room", timeZone))).Content.ReadFromJsonAsync<BookableResource>())!;
        BookableResource? second = null;
        if (twoResources) second = (await (await client.PostAsJsonAsync("/api/apps/scheduling/resources", new CreateResourceRequest(provider.Id.Value, "Room B", "room", timeZone))).Content.ReadFromJsonAsync<BookableResource>())!;
        var service = (await (await client.PostAsJsonAsync("/api/apps/scheduling/services", new CreateServiceRequest(provider.Id.Value, "Consult", null, 30))).Content.ReadFromJsonAsync<SchedulingService>())!;
        await client.PostAsJsonAsync($"/api/apps/scheduling/services/{service.Id.Value}/resources", new AssignResourceRequest(provider.Id.Value, resource.Id.Value));
        if (second is not null) await client.PostAsJsonAsync($"/api/apps/scheduling/services/{service.Id.Value}/resources", new AssignResourceRequest(provider.Id.Value, second.Id.Value));
        await client.PostAsJsonAsync("/api/apps/scheduling/availability-rules", new CreateAvailabilityRuleRequest(provider.Id.Value, resource.Id.Value, timeZone, [DayOfWeek.Monday], "09:00", "12:00", null, null));
        if (second is not null) await client.PostAsJsonAsync("/api/apps/scheduling/availability-rules", new CreateAvailabilityRuleRequest(provider.Id.Value, second.Id.Value, timeZone, [DayOfWeek.Monday], "09:00", "12:00", null, null));
        return (provider.Id.Value, service.Id.Value, resource.Id.Value, second?.Id.Value);
    }
    private static async Task<HoldResponse> Hold(HttpClient client, string providerId, string serviceId, string resourceId, DateTimeOffset start, DateTimeOffset end)
    {
        var response = await client.PostAsJsonAsync("/api/apps/scheduling/holds", new CreateHoldRequest(providerId, serviceId, resourceId, start, end, "UTC"));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<HoldResponse>())!;
    }

    private static async Task<Booking> ConfirmBooking(HttpClient client, string providerId, string serviceId, string resourceId, DateTimeOffset start)
    {
        var hold = await Hold(client, providerId, serviceId, resourceId, start, start.AddMinutes(30));
        (await client.PostAsJsonAsync($"/api/apps/scheduling/holds/{hold.HoldId}/intake", new SubmitIntakeRequest(hold.ClaimToken, "Ada", "ada@example.test", null, null))).EnsureSuccessStatusCode();
        var response = await client.PostAsJsonAsync("/api/apps/scheduling/bookings/confirm", new ConfirmBookingRequest(hold.HoldId, hold.ClaimToken, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<Booking>())!;
    }
    private sealed class LeviathanFactory : WebApplicationFactory<Program>
    {
        public string DataDir { get; } = Path.Combine(Path.GetTempPath(), "leviathan-tests", Guid.NewGuid().ToString("n"));
        private readonly bool _allowUnsafeAdmin;
        public LeviathanFactory(bool allowUnsafeAdmin = true) => _allowUnsafeAdmin = allowUnsafeAdmin;
        protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder) => builder.UseSetting("LEVIATHAN_DATA_DIR", DataDir).UseSetting("LEVIATHAN_ALLOW_UNSAFE_ADMIN", _allowUnsafeAdmin ? "true" : "false");
    }
}
