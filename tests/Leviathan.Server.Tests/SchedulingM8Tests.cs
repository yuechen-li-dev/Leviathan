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
    private static readonly System.Text.Json.JsonSerializerOptions TestJson = new(System.Text.Json.JsonSerializerDefaults.Web);

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
        var stored = await ReadHoldJson(path);
        await WriteHoldJson(path, stored with { ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1) });
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
        var stored = await ReadHoldJson(path);
        await WriteHoldJson(path, stored with { ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1) });

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

    [Fact]
    public async Task Reschedule_replacement_hold_keeps_old_booking_confirmed_and_conflicts_safely()
    {
        using var fixture = new LeviathanFactory();
        var client = fixture.CreateClient();
        var setup = await CreateSetup(client, "m19-hold", twoResources: true);
        var oldStart = DateTimeOffset.Parse("2030-01-07T09:00:00Z");
        var old = await ConfirmBooking(client, setup.ProviderId, setup.ServiceId, setup.ResourceId, oldStart);
        var blocker = await ConfirmBooking(client, setup.ProviderId, setup.ServiceId, setup.SecondResourceId!, DateTimeOffset.Parse("2030-01-07T10:00:00Z"));

        var conflict = await client.PostAsJsonAsync($"/api/apps/scheduling/bookings/{old.Id.Value}/reschedule/holds", new CreateReplacementHoldRequest(setup.ServiceId, setup.SecondResourceId!, DateTimeOffset.Parse("2030-01-07T10:00:00Z"), DateTimeOffset.Parse("2030-01-07T10:30:00Z"), "UTC", "UTC", "customer_requested", "Move later.", "provider"));
        Assert.Equal(HttpStatusCode.Conflict, conflict.StatusCode);
        var stillOld = await client.GetFromJsonAsync<Booking>($"/api/apps/scheduling/bookings/{old.Id.Value}");
        Assert.Equal("confirmed", stillOld!.Status);
        Assert.Equal("confirmed", (await client.GetFromJsonAsync<Booking>($"/api/apps/scheduling/bookings/{blocker.Id.Value}"))!.Status);

        var replacement = await client.PostAsJsonAsync($"/api/apps/scheduling/bookings/{old.Id.Value}/reschedule/holds", new CreateReplacementHoldRequest(setup.ServiceId, setup.SecondResourceId!, DateTimeOffset.Parse("2030-01-07T10:30:00Z"), DateTimeOffset.Parse("2030-01-07T11:00:00Z"), "UTC", "UTC", "customer_requested", "Move later.", "provider"));
        replacement.EnsureSuccessStatusCode();
        var replacementHold = (await replacement.Content.ReadFromJsonAsync<ReplacementHoldResponse>())!;
        Assert.Equal(old.Id.Value, replacementHold.OldBookingId);
        Assert.False(string.IsNullOrWhiteSpace(replacementHold.AuditEventId));
        Assert.Equal("AwaitingIntake", replacementHold.Lifecycle!.CurrentWorkflowState);
        Assert.Equal("confirmed", (await client.GetFromJsonAsync<Booking>($"/api/apps/scheduling/bookings/{old.Id.Value}"))!.Status);
    }

    [Fact]
    public async Task Reschedule_confirmation_links_bookings_releases_old_slot_blocks_new_slot_and_updates_audit_lifecycle_ics()
    {
        using var fixture = new LeviathanFactory();
        var client = fixture.CreateClient();
        var setup = await CreateSetup(client, "m19-confirm", twoResources: true);
        var oldStart = DateTimeOffset.Parse("2030-01-07T09:00:00Z");
        var newStart = DateTimeOffset.Parse("2030-01-07T10:30:00Z");
        var old = await ConfirmBooking(client, setup.ProviderId, setup.ServiceId, setup.ResourceId, oldStart);

        var holdResponse = await client.PostAsJsonAsync($"/api/apps/scheduling/bookings/{old.Id.Value}/reschedule/holds", new CreateReplacementHoldRequest(setup.ServiceId, setup.SecondResourceId!, newStart, newStart.AddMinutes(30), "UTC", "UTC", "customer_requested", null, "provider"));
        holdResponse.EnsureSuccessStatusCode();
        var hold = (await holdResponse.Content.ReadFromJsonAsync<ReplacementHoldResponse>())!;
        (await client.PostAsJsonAsync($"/api/apps/scheduling/holds/{hold.ReplacementHoldId}/intake", new SubmitIntakeRequest(hold.ClaimToken, "Ada", "ada@example.test", null, null))).EnsureSuccessStatusCode();
        var confirm = await client.PostAsJsonAsync("/api/apps/scheduling/bookings/confirm", new ConfirmBookingRequest(hold.ReplacementHoldId, hold.ClaimToken, null));
        confirm.EnsureSuccessStatusCode();
        var replacement = (await confirm.Content.ReadFromJsonAsync<Booking>())!;

        Assert.Equal("confirmed", replacement.Status);
        Assert.Equal(old.Id, replacement.RescheduledFromBookingId);
        var rescheduledOld = await client.GetFromJsonAsync<Booking>($"/api/apps/scheduling/bookings/{old.Id.Value}");
        Assert.Equal("rescheduled", rescheduledOld!.Status);
        Assert.Equal(replacement.Id, rescheduledOld.RescheduledToBookingId);
        Assert.Equal("customer_requested", rescheduledOld.RescheduleReasonCode);

        var oldReleased = await Hold(client, setup.ProviderId, setup.ServiceId, setup.ResourceId, oldStart, oldStart.AddMinutes(30));
        Assert.Equal("active", oldReleased.Status);
        var newBlocked = await client.PostAsJsonAsync("/api/apps/scheduling/holds", new CreateHoldRequest(setup.ProviderId, setup.ServiceId, setup.SecondResourceId!, newStart, newStart.AddMinutes(30), "UTC"));
        Assert.Equal(HttpStatusCode.Conflict, newBlocked.StatusCode);

        var oldAudit = await client.GetFromJsonAsync<BookingAuditEvent[]>($"/api/apps/scheduling/bookings/{old.Id.Value}/audit?providerId={setup.ProviderId}");
        Assert.Contains(oldAudit!, e => e.EventType == "booking_reschedule_requested");
        Assert.Contains(oldAudit!, e => e.EventType == "booking_rescheduled" && e.Data["newBookingId"] == replacement.Id.Value && e.Data["lifecycleState"] == "Rescheduled");
        var newAudit = await client.GetFromJsonAsync<BookingAuditEvent[]>($"/api/apps/scheduling/bookings/{replacement.Id.Value}/audit?providerId={setup.ProviderId}");
        Assert.Contains(newAudit!, e => e.EventType == "booking_reschedule_confirmed" && e.Data["oldBookingId"] == old.Id.Value);

        var oldLifecycle = await client.GetFromJsonAsync<SchedulingLifecycleSummary>($"/api/apps/scheduling/bookings/{old.Id.Value}/lifecycle");
        Assert.Equal("Rescheduled", oldLifecycle!.CurrentWorkflowState);
        Assert.Equal(replacement.Id.Value, oldLifecycle.RescheduledToBookingId);
        var newLifecycle = await client.GetFromJsonAsync<SchedulingLifecycleSummary>($"/api/apps/scheduling/bookings/{replacement.Id.Value}/lifecycle");
        Assert.Equal("Confirmed", newLifecycle!.CurrentWorkflowState);
        Assert.Equal(old.Id.Value, newLifecycle.RescheduledFromBookingId);

        var oldIcs = await client.GetAsync($"/api/apps/scheduling/bookings/{old.Id.Value}/ics");
        Assert.Equal(HttpStatusCode.BadRequest, oldIcs.StatusCode);
        var oldIcsError = await oldIcs.Content.ReadFromJsonAsync<SchedulingError>();
        Assert.Equal("booking_rescheduled", oldIcsError!.Error);
        Assert.True((await client.GetAsync($"/api/apps/scheduling/bookings/{replacement.Id.Value}/ics")).IsSuccessStatusCode);
    }

    [Fact]
    public async Task Expired_replacement_hold_leaves_old_booking_confirmed()
    {
        using var fixture = new LeviathanFactory();
        var client = fixture.CreateClient();
        var setup = await CreateSetup(client, "m19-expired", twoResources: false);
        var old = await ConfirmBooking(client, setup.ProviderId, setup.ServiceId, setup.ResourceId, DateTimeOffset.Parse("2030-01-07T09:00:00Z"));
        var newStart = DateTimeOffset.Parse("2030-01-07T10:00:00Z");
        var hold = (await (await client.PostAsJsonAsync($"/api/apps/scheduling/bookings/{old.Id.Value}/reschedule/holds", new CreateReplacementHoldRequest(setup.ServiceId, setup.ResourceId, newStart, newStart.AddMinutes(30), "UTC", null, "customer_requested", null, "provider"))).Content.ReadFromJsonAsync<ReplacementHoldResponse>())!;
        var path = Path.Combine(fixture.DataDir, "scheduling", "providers", setup.ProviderId, "holds", "active", hold.ReplacementHoldId + ".json");
        var stored = await ReadHoldJson(path);
        await WriteHoldJson(path, stored with { ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1) });
        var confirm = await client.PostAsJsonAsync("/api/apps/scheduling/bookings/confirm", new ConfirmBookingRequest(hold.ReplacementHoldId, hold.ClaimToken, new CustomerContact("Ada", "ada@example.test", null, null)));
        Assert.Equal(HttpStatusCode.BadRequest, confirm.StatusCode);
        Assert.Equal("confirmed", (await client.GetFromJsonAsync<Booking>($"/api/apps/scheduling/bookings/{old.Id.Value}"))!.Status);
    }


    [Fact]
    public async Task M14_local_dev_context_and_provider_ownership_are_enforced()
    {
        using var fixture = new LeviathanFactory();
        var client = fixture.CreateClient();

        var context = await client.GetFromJsonAsync<System.Text.Json.JsonElement>("/api/platform/local-dev/context");
        Assert.Equal("local-dev", context.GetProperty("actorKind").GetString());
        Assert.Equal("acct_local_dev", context.GetProperty("accountId").GetString());
        Assert.Equal("inst_local_dev_scheduling", context.GetProperty("schedulingInstallation").GetProperty("appInstallationId").GetProperty("value").GetString());

        var response = await client.PostAsJsonAsync("/api/apps/scheduling/providers", new { slug = "m14-owned", displayName = "Owned", timeZoneId = "UTC", accountId = "acct_attacker", appInstallationId = "inst_attacker" });
        response.EnsureSuccessStatusCode();
        Assert.Equal("local-dev-only", response.Headers.GetValues("X-Leviathan-Unsafe-Admin").Single());
        var provider = (await response.Content.ReadFromJsonAsync<Provider>())!;
        Assert.Equal("acct_local_dev", provider.AccountId);
        Assert.Equal("inst_local_dev_scheduling", provider.AppInstallationId);

        var adminFetch = await client.GetFromJsonAsync<Provider>($"/api/apps/scheduling/providers/{provider.Id.Value}");
        Assert.Equal("acct_local_dev", adminFetch!.AccountId);

        var publicFetch = await client.GetFromJsonAsync<Provider>("/api/apps/scheduling/public/m14-owned");
        Assert.Equal(provider.Id, publicFetch!.Id);
    }

    [Fact]
    public async Task M14_admin_list_backfills_old_records_and_hides_other_owner_records()
    {
        using var fixture = new LeviathanFactory();
        var client = fixture.CreateClient();
        var owned = await CreateSetup(client, "m14-list-owned", twoResources: false);

        var old = new Provider(new ProviderId("prov_old"), "m14-old", "Old", "UTC", null, null, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow);
        var other = old with { Id = new ProviderId("prov_other"), Slug = "m14-other", AccountId = "acct_other", AppInstallationId = "inst_other" };
        await WriteProviderJson(fixture.DataDir, old);
        await WriteProviderJson(fixture.DataDir, other);

        var providers = await client.GetFromJsonAsync<Provider[]>("/api/apps/scheduling/providers");
        Assert.Contains(providers!, p => p.Id.Value == owned.ProviderId);
        var backfilled = Assert.Single(providers!, p => p.Id.Value == "prov_old");
        Assert.Equal("acct_local_dev", backfilled.AccountId);
        Assert.DoesNotContain(providers!, p => p.Id.Value == "prov_other");

        var otherFetch = await client.GetAsync("/api/apps/scheduling/providers/prov_other");
        Assert.Equal(HttpStatusCode.NotFound, otherFetch.StatusCode);

        var resourceForOther = await client.PostAsJsonAsync("/api/apps/scheduling/resources", new CreateResourceRequest("prov_other", "Room", "room", "UTC"));
        Assert.Equal(HttpStatusCode.NotFound, resourceForOther.StatusCode);
    }

    [Fact]
    public async Task M14_unsafe_disabled_blocks_context_and_mutation_with_controlled_error()
    {
        using var fixture = new LeviathanFactory(allowUnsafeAdmin: false);
        var client = fixture.CreateClient();
        var context = await client.GetAsync("/api/platform/local-dev/context");
        Assert.Equal(HttpStatusCode.Forbidden, context.StatusCode);

        var forbidden = await client.PostAsJsonAsync("/api/apps/scheduling/providers", new CreateProviderRequest("m14-blocked", "Blocked", "UTC", null, null));
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        var error = await forbidden.Content.ReadFromJsonAsync<SchedulingError>();
        Assert.Equal("unsafe_admin_disabled", error!.Error);
    }


    [Fact]
    public async Task M15_capability_bootstrap_allows_admin_and_records_audit_decision()
    {
        using var fixture = new LeviathanFactory();
        var client = fixture.CreateClient();

        var grants = await client.GetFromJsonAsync<System.Text.Json.JsonElement[]>("/api/platform/local-dev/capability-grants");
        Assert.Contains(grants!, g => g.GetProperty("capabilityName").GetProperty("value").GetString() == "admin.provider.configure" && g.GetProperty("status").GetString() == "Enabled");

        var response = await client.PostAsJsonAsync("/api/apps/scheduling/providers", new { slug = "m15-allowed", displayName = "Allowed", timeZoneId = "UTC", grantId = "grant_attacker", accountId = "acct_attacker" });
        response.EnsureSuccessStatusCode();

        var decisions = await client.GetFromJsonAsync<System.Text.Json.JsonElement[]>("/api/platform/local-dev/capability-decisions/recent");
        var decision = Assert.Single(decisions!, d => d.GetProperty("operation").GetString() == "providers.create" && d.GetProperty("targetId").GetString() == "m15-allowed");
        Assert.True(decision.GetProperty("allowed").GetBoolean());
        Assert.Equal("grant_local_dev_scheduling_admin_provider_configure", decision.GetProperty("grantId").GetString());
        Assert.Equal("admin.provider.configure", decision.GetProperty("capability").GetString());
    }

    [Fact]
    public async Task M15_provider_creation_denied_when_capability_grant_missing_but_public_lookup_remains_open()
    {
        using var fixture = new LeviathanFactory(bootstrapCapabilities: false);
        var client = fixture.CreateClient();
        var publicProvider = new Provider(new ProviderId("prov_public_m15"), "m15-public", "Public", "UTC", null, null, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow);
        await WriteProviderJson(fixture.DataDir, publicProvider);

        var response = await client.PostAsJsonAsync("/api/apps/scheduling/providers", new CreateProviderRequest("m15-denied", "Denied", "UTC", null, null));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Equal("capability_denied", body.GetProperty("error").GetString());
        Assert.Equal("capability_grant_missing", body.GetProperty("reason").GetString());
        Assert.False(body.GetProperty("audit").GetProperty("allowed").GetBoolean());

        var publicFetch = await client.GetFromJsonAsync<Provider>("/api/apps/scheduling/public/m15-public");
        Assert.Equal("prov_public_m15", publicFetch!.Id.Value);
    }


    [Fact]
    public async Task M21_notification_policy_schedules_cancels_reschedules_and_fake_sends_without_contact_data_audit()
    {
        using var fixture = new LeviathanFactory();
        var client = fixture.CreateClient();
        var provider = (await (await client.PostAsJsonAsync("/api/apps/scheduling/providers", new CreateProviderRequest("m21-notify", "M21 Notify", "UTC", null, null))).Content.ReadFromJsonAsync<Provider>())!;
        var resource = (await (await client.PostAsJsonAsync("/api/apps/scheduling/resources", new CreateResourceRequest(provider.Id.Value, "Room A", "room", "UTC"))).Content.ReadFromJsonAsync<BookableResource>())!;
        var second = (await (await client.PostAsJsonAsync("/api/apps/scheduling/resources", new CreateResourceRequest(provider.Id.Value, "Room B", "room", "UTC"))).Content.ReadFromJsonAsync<BookableResource>())!;
        var rules = new[] { new NotificationRule(NotificationTriggers.BookingConfirmed, NotificationChannels.App, "customer", "booking_confirmed_app"), new NotificationRule(NotificationTriggers.BeforeBookingStart, NotificationChannels.Email, "provider", "provider_reminder", 120) };
        var policy = new SchedulingNotificationPolicy(true, rules);
        var service = (await (await client.PostAsJsonAsync("/api/apps/scheduling/services", new CreateServiceRequest(provider.Id.Value, "Notify Consult", null, 30, NotificationPolicy: policy))).Content.ReadFromJsonAsync<SchedulingService>())!;
        await client.PostAsJsonAsync($"/api/apps/scheduling/services/{service.Id.Value}/resources", new AssignResourceRequest(provider.Id.Value, resource.Id.Value));
        await client.PostAsJsonAsync($"/api/apps/scheduling/services/{service.Id.Value}/resources", new AssignResourceRequest(provider.Id.Value, second.Id.Value));
        var old = await ConfirmBooking(client, provider.Id.Value, service.Id.Value, resource.Id.Value, DateTimeOffset.Parse("2030-01-07T09:00:00Z"));

        var notifications = (await client.GetFromJsonAsync<ScheduledNotification[]>($"/api/apps/scheduling/bookings/{old.Id.Value}/notifications"))!;
        Assert.Equal(2, notifications.Length);
        Assert.All(notifications, n => Assert.Equal(NotificationStatuses.Pending, n.Status));
        Assert.Contains(notifications, n => n.Trigger == NotificationTriggers.BeforeBookingStart && n.ScheduledForUtc == old.Range.StartsAtUtc.AddMinutes(-120));
        var audit = (await client.GetFromJsonAsync<BookingAuditEvent[]>($"/api/apps/scheduling/bookings/{old.Id.Value}/audit?providerId={provider.Id.Value}"))!;
        Assert.Contains(audit, e => e.EventType == "notification_policy_applied");
        Assert.DoesNotContain(audit.Where(e => e.EventType.StartsWith("notification_")), e => e.Data.Values.Any(v => v.Contains("ada@example.test", StringComparison.OrdinalIgnoreCase)));

        var fake = await client.PostAsJsonAsync($"/api/apps/scheduling/notifications/{notifications[0].Id.Value}/fake-send", new FakeSendNotificationRequest("test"));
        fake.EnsureSuccessStatusCode();
        notifications = (await client.GetFromJsonAsync<ScheduledNotification[]>($"/api/apps/scheduling/bookings/{old.Id.Value}/notifications"))!;
        Assert.Contains(notifications, n => n.Id == notifications[0].Id && n.Status == NotificationStatuses.SentFake);
        audit = (await client.GetFromJsonAsync<BookingAuditEvent[]>($"/api/apps/scheduling/bookings/{old.Id.Value}/audit?providerId={provider.Id.Value}"))!;
        Assert.Contains(audit, e => e.EventType == "notification_sent_fake");

        var replacement = await client.PostAsJsonAsync($"/api/apps/scheduling/bookings/{old.Id.Value}/reschedule/holds", new CreateReplacementHoldRequest(service.Id.Value, second.Id.Value, DateTimeOffset.Parse("2030-01-07T10:00:00Z"), DateTimeOffset.Parse("2030-01-07T10:30:00Z"), "UTC", null, "customer_request", null, "test"));
        replacement.EnsureSuccessStatusCode();
        var repl = (await replacement.Content.ReadFromJsonAsync<ReplacementHoldResponse>())!;
        await client.PostAsJsonAsync($"/api/apps/scheduling/holds/{repl.ReplacementHoldId}/intake", new SubmitIntakeRequest(repl.ClaimToken, "Ada", "ada@example.test", null, null));
        var confirmed = await client.PostAsJsonAsync("/api/apps/scheduling/bookings/confirm", new ConfirmBookingRequest(repl.ReplacementHoldId, repl.ClaimToken, null));
        confirmed.EnsureSuccessStatusCode();
        var newer = (await confirmed.Content.ReadFromJsonAsync<Booking>())!;
        Assert.Equal(old.Id, newer.RescheduledFromBookingId);

        var oldNotifications = (await client.GetFromJsonAsync<ScheduledNotification[]>($"/api/apps/scheduling/bookings/{old.Id.Value}/notifications"))!;
        Assert.Contains(oldNotifications, n => n.Status == NotificationStatuses.Cancelled);
        var newNotifications = (await client.GetFromJsonAsync<ScheduledNotification[]>($"/api/apps/scheduling/bookings/{newer.Id.Value}/notifications"))!;
        Assert.Equal(2, newNotifications.Count(n => n.Status == NotificationStatuses.Pending));
    }

    [Fact]
    public async Task M21_notification_policy_none_creates_no_notification_records_and_payment_required_still_blocks()
    {
        using var fixture = new LeviathanFactory();
        var client = fixture.CreateClient();
        var setup = await CreateSetup(client, "m21-none", twoResources: false);
        var booking = await ConfirmBooking(client, setup.ProviderId, setup.ServiceId, setup.ResourceId, DateTimeOffset.Parse("2030-01-07T11:00:00Z"));
        var notifications = await client.GetFromJsonAsync<ScheduledNotification[]>($"/api/apps/scheduling/bookings/{booking.Id.Value}/notifications");
        Assert.Empty(notifications!);

        var provider = (await (await client.PostAsJsonAsync("/api/apps/scheduling/providers", new CreateProviderRequest("m21-pay", "M21 Pay", "UTC", null, null))).Content.ReadFromJsonAsync<Provider>())!;
        var resource = (await (await client.PostAsJsonAsync("/api/apps/scheduling/resources", new CreateResourceRequest(provider.Id.Value, "Room A", "room", "UTC"))).Content.ReadFromJsonAsync<BookableResource>())!;
        var pay = new SchedulingPaymentPolicy(true, false, new MoneyAmount(1000, "USD"), null, "USD", SchedulingPaymentTimings.BeforeConfirmation, SchedulingPaymentProviderModes.FakeLocal, SchedulingCancellationPaymentPolicies.RefundDeferred, SchedulingReschedulePaymentPolicies.CarryPaymentForwardDeferred);
        var service = (await (await client.PostAsJsonAsync("/api/apps/scheduling/services", new CreateServiceRequest(provider.Id.Value, "Pay", null, 30, PaymentPolicy: pay, NotificationPolicy: SchedulingNotificationPolicy.None()))).Content.ReadFromJsonAsync<SchedulingService>())!;
        await client.PostAsJsonAsync($"/api/apps/scheduling/services/{service.Id.Value}/resources", new AssignResourceRequest(provider.Id.Value, resource.Id.Value));
        var hold = await Hold(client, provider.Id.Value, service.Id.Value, resource.Id.Value, DateTimeOffset.Parse("2030-01-07T12:00:00Z"), DateTimeOffset.Parse("2030-01-07T12:30:00Z"));
        await client.PostAsJsonAsync($"/api/apps/scheduling/holds/{hold.HoldId}/intake", new SubmitIntakeRequest(hold.ClaimToken, "Ada", "ada@example.test", null, null));
        var rejected = await client.PostAsJsonAsync("/api/apps/scheduling/bookings/confirm", new ConfirmBookingRequest(hold.HoldId, hold.ClaimToken, null));
        Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
        Assert.Equal("payment_required", (await rejected.Content.ReadFromJsonAsync<SchedulingError>())!.Error);
    }

    [Fact]
    public async Task M20_payment_required_hold_rejects_confirmation_until_fake_local_satisfied()
    {
        using var fixture = new LeviathanFactory();
        var client = fixture.CreateClient();
        var provider = (await (await client.PostAsJsonAsync("/api/apps/scheduling/providers", new CreateProviderRequest("m20-pay", "M20 Pay", "UTC", null, null))).Content.ReadFromJsonAsync<Provider>())!;
        var resource = (await (await client.PostAsJsonAsync("/api/apps/scheduling/resources", new CreateResourceRequest(provider.Id.Value, "Room A", "room", "UTC"))).Content.ReadFromJsonAsync<BookableResource>())!;
        var policy = new SchedulingPaymentPolicy(true, false, new MoneyAmount(2500, "USD"), null, "USD", SchedulingPaymentTimings.BeforeConfirmation, SchedulingPaymentProviderModes.FakeLocal, SchedulingCancellationPaymentPolicies.RefundDeferred, SchedulingReschedulePaymentPolicies.CarryPaymentForwardDeferred);
        var service = (await (await client.PostAsJsonAsync("/api/apps/scheduling/services", new CreateServiceRequest(provider.Id.Value, "Deposit Consult", null, 30, PaymentPolicy: policy))).Content.ReadFromJsonAsync<SchedulingService>())!;
        Assert.Equal(2500, service.PaymentPolicy!.DepositAmount!.MinorUnits);
        Assert.Equal("USD", service.PaymentPolicy.Currency);
        await client.PostAsJsonAsync($"/api/apps/scheduling/services/{service.Id.Value}/resources", new AssignResourceRequest(provider.Id.Value, resource.Id.Value));

        var hold = await Hold(client, provider.Id.Value, service.Id.Value, resource.Id.Value, DateTimeOffset.Parse("2030-01-07T09:00:00Z"), DateTimeOffset.Parse("2030-01-07T09:30:00Z"));
        Assert.Equal(PaymentRequirementStatuses.Required, hold.PaymentRequirementStatus);
        Assert.Equal(2500, hold.PaymentPolicySnapshot!.DepositAmount!.MinorUnits);

        (await client.PostAsJsonAsync($"/api/apps/scheduling/holds/{hold.HoldId}/intake", new SubmitIntakeRequest(hold.ClaimToken, "Ada", "ada@example.test", null, null))).EnsureSuccessStatusCode();
        var rejected = await client.PostAsJsonAsync("/api/apps/scheduling/bookings/confirm", new ConfirmBookingRequest(hold.HoldId, hold.ClaimToken, null));
        Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
        Assert.Equal("payment_required", (await rejected.Content.ReadFromJsonAsync<SchedulingError>())!.Error);

        var satisfy = await client.PostAsJsonAsync($"/api/apps/scheduling/holds/{hold.HoldId}/payment/fake-satisfy", new FakeSatisfyPaymentRequest(hold.ClaimToken, "test"));
        satisfy.EnsureSuccessStatusCode();
        var fake = (await satisfy.Content.ReadFromJsonAsync<FakeSatisfyPaymentResponse>())!;
        Assert.Equal(PaymentRequirementStatuses.Satisfied, fake.PaymentRequirementStatus);
        Assert.StartsWith("fakepay_", fake.PaymentReference);

        var confirmed = await client.PostAsJsonAsync("/api/apps/scheduling/bookings/confirm", new ConfirmBookingRequest(hold.HoldId, hold.ClaimToken, null));
        confirmed.EnsureSuccessStatusCode();
        var booking = (await confirmed.Content.ReadFromJsonAsync<Booking>())!;
        Assert.Equal(PaymentRequirementStatuses.Satisfied, booking.PaymentRequirementStatus);
        Assert.Equal(fake.PaymentReference, booking.PaymentReference);

        var audit = await client.GetFromJsonAsync<BookingAuditEvent[]>($"/api/apps/scheduling/bookings/{booking.Id.Value}/audit?providerId={provider.Id.Value}");
        Assert.Contains(audit!, e => e.EventType == "payment_policy_applied");
        Assert.Contains(audit!, e => e.EventType == "booking_confirmed");
        var lifecycle = await client.GetFromJsonAsync<SchedulingLifecycleSummary>($"/api/apps/scheduling/bookings/{booking.Id.Value}/lifecycle");
        Assert.Equal(PaymentRequirementStatuses.Satisfied, lifecycle!.PaymentRequirementStatus);
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
    private static async Task WriteProviderJson(string dataDir, Provider provider)
    {
        var dir = Path.Combine(dataDir, "scheduling", "providers", provider.Id.Value);
        Directory.CreateDirectory(dir);
        await File.WriteAllTextAsync(Path.Combine(dir, "provider.json"), System.Text.Json.JsonSerializer.Serialize(provider, TestJson));
    }

    private static async Task<Hold> ReadHoldJson(string path)
    {
        await using var stream = File.OpenRead(path);
        return (await System.Text.Json.JsonSerializer.DeserializeAsync<Hold>(stream, TestJson))!;
    }

    private static Task WriteHoldJson(string path, Hold hold)
    {
        return File.WriteAllTextAsync(path, System.Text.Json.JsonSerializer.Serialize(hold, TestJson));
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
        private readonly bool _bootstrapCapabilities;
        public LeviathanFactory(bool allowUnsafeAdmin = true, bool bootstrapCapabilities = true)
        {
            _allowUnsafeAdmin = allowUnsafeAdmin;
            _bootstrapCapabilities = bootstrapCapabilities;
        }
        protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder) => builder.UseSetting("LEVIATHAN_DATA_DIR", DataDir).UseSetting("LEVIATHAN_ALLOW_UNSAFE_ADMIN", _allowUnsafeAdmin ? "true" : "false").UseSetting("LEVIATHAN_LOCAL_DEV_BOOTSTRAP_CAPABILITIES", _bootstrapCapabilities ? "true" : "false");
    }
}
