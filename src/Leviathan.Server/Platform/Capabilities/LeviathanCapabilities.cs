using System.Text.Json;
using System.Text.Json.Serialization;
using Leviathan.Server.Ariadne;
using Leviathan.Server.Platform.Apps;
using Leviathan.Server.Platform.Identity;

namespace Leviathan.Server.Platform.Capabilities;

public static class LeviathanCapabilityNames
{
    public const string AdminProviderConfigure = "admin.provider.configure";
    public const string CalendarRead = "calendar.read";
    public const string CalendarWrite = "calendar.write";
    public const string GraphOutlookCalendar = "graph.outlook.calendar";
    public const string PaymentCheckout = "payment.checkout";
    public const string PaymentRefund = "payment.refund";
    public const string NotificationSend = "notification.send";
    public const string EmailSend = "email.send";
    public const string SmsSend = "sms.send";
    public const string FileRead = "file.read";
    public const string FileWrite = "file.write";
    public const string LlmCall = "llm.call";
    public const string HomeAssistantServiceCall = "homeassistant.service.call";

    public static readonly string[] WellKnown = [AdminProviderConfigure, CalendarRead, CalendarWrite, GraphOutlookCalendar, PaymentCheckout, PaymentRefund, NotificationSend, EmailSend, SmsSend, FileRead, FileWrite, LlmCall, HomeAssistantServiceCall];
}

public sealed record LeviathanCapabilityName(string Value) { public override string ToString() => Value; }
public sealed record LeviathanCapabilityGrantId(string Value) { public static LeviathanCapabilityGrantId New() => new($"grant_{Guid.NewGuid():N}"); public override string ToString() => Value; }
public enum CapabilityGrantStatus { Enabled, Disabled, Revoked }
public enum CapabilityAuditLevel { Standard, Sensitive }
public sealed record LeviathanCapabilityScope(string Kind, string? TargetKind = null, string? TargetId = null)
{
    public static LeviathanCapabilityScope Account() => new("account");
    public static LeviathanCapabilityScope Provider(string providerId) => new("provider", "provider", providerId);
}

public sealed record LeviathanCapabilityGrant(
    LeviathanCapabilityGrantId GrantId,
    LeviathanAccountId AccountId,
    LeviathanAppInstallationId AppInstallationId,
    string AppId,
    LeviathanCapabilityName CapabilityName,
    LeviathanCapabilityScope Scope,
    string? ConnectedAccountId,
    LeviathanUserId GrantedByUserId,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ExpiresAt,
    CapabilityGrantStatus Status,
    CapabilityAuditLevel AuditLevel,
    string? RevocationReason);

public sealed record LeviathanCapabilityCheck(
    string AppId,
    LeviathanAppInstallationId AppInstallationId,
    LeviathanCapabilityName CapabilityName,
    LeviathanCapabilityScope Scope,
    string Operation,
    string? TargetKind = null,
    string? TargetId = null,
    string? CorrelationId = null);

public sealed record LeviathanCapabilityDecision(
    bool Allowed,
    string ReasonCode,
    LeviathanCapabilityGrantId? GrantId,
    LeviathanCapabilityAuditEnvelope Audit);

public sealed record LeviathanCapabilityAuditEnvelope(
    DateTimeOffset OccurredAt,
    string? AccountId,
    string AppInstallationId,
    string AppId,
    string Capability,
    string Operation,
    string? TargetKind,
    string? TargetId,
    bool Allowed,
    string ReasonCode,
    string? GrantId,
    string? CorrelationId,
    string? RequestId);

public interface ILeviathanCapabilityStore
{
    Task<IReadOnlyList<LeviathanCapabilityGrant>> GetGrants(LeviathanAccountId accountId, LeviathanAppInstallationId appInstallationId, LeviathanCapabilityName capabilityName);
    Task<IReadOnlyList<LeviathanCapabilityGrant>> GetGrants(LeviathanAccountId accountId);
    Task AppendAudit(LeviathanCapabilityAuditEnvelope audit);
    IReadOnlyList<LeviathanCapabilityAuditEnvelope> RecentDecisions { get; }
}

public sealed class LeviathanLocalCapabilityStore(IConfiguration config) : ILeviathanCapabilityStore
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true, Converters = { new JsonStringEnumConverter() } };
    private readonly object _lock = new();
    private readonly List<LeviathanCapabilityAuditEnvelope> _recent = [];
    private string Root => Path.Combine(config["LEVIATHAN_DATA_DIR"] ?? Environment.GetEnvironmentVariable("LEVIATHAN_DATA_DIR") ?? Path.Combine(AppContext.BaseDirectory, "data"), "platform", "accounts");
    private bool BootstrapEnabled => !string.Equals(config["LEVIATHAN_LOCAL_DEV_BOOTSTRAP_CAPABILITIES"], "false", StringComparison.OrdinalIgnoreCase);
    public IReadOnlyList<LeviathanCapabilityAuditEnvelope> RecentDecisions { get { lock (_lock) return _recent.ToArray(); } }

    public async Task<IReadOnlyList<LeviathanCapabilityGrant>> GetGrants(LeviathanAccountId accountId, LeviathanAppInstallationId appInstallationId, LeviathanCapabilityName capabilityName)
        => (await GetGrants(accountId)).Where(g => g.AppInstallationId == appInstallationId && g.CapabilityName.Value == capabilityName.Value).ToArray();

    public async Task<IReadOnlyList<LeviathanCapabilityGrant>> GetGrants(LeviathanAccountId accountId)
    {
        var grants = new List<LeviathanCapabilityGrant>();
        var dir = Path.Combine(Root, accountId.Value, "capability-grants");
        if (Directory.Exists(dir))
        {
            foreach (var path in Directory.EnumerateFiles(dir, "*.json"))
            {
                await using var stream = File.OpenRead(path);
                if (await JsonSerializer.DeserializeAsync<LeviathanCapabilityGrant>(stream, Json) is { } grant) grants.Add(grant);
            }
        }
        if (BootstrapEnabled && accountId == LeviathanRequestContextAccessor.LocalDevAccountId)
            grants.Add(LocalDevSchedulingAdminGrant());
        return grants;
    }

    public async Task AppendAudit(LeviathanCapabilityAuditEnvelope audit)
    {
        lock (_lock) { _recent.Add(audit); if (_recent.Count > 100) _recent.RemoveAt(0); }
        if (audit.AccountId is null) return;
        var dir = Path.Combine(Root, audit.AccountId, "audit");
        Directory.CreateDirectory(dir);
        var path = Path.Combine(dir, $"capability-events-{audit.OccurredAt:yyyy-MM}.jsonl");
        await File.AppendAllTextAsync(path, JsonSerializer.Serialize(audit, Json) + Environment.NewLine);
    }

    private static LeviathanCapabilityGrant LocalDevSchedulingAdminGrant() => new(
        new("grant_local_dev_scheduling_admin_provider_configure"), LeviathanRequestContextAccessor.LocalDevAccountId,
        LeviathanLocalDevAppInstallations.SchedulingInstallationId, "scheduling", new(LeviathanCapabilityNames.AdminProviderConfigure),
        LeviathanCapabilityScope.Account(), null, LeviathanRequestContextAccessor.LocalDevUserId, DateTimeOffset.UnixEpoch, null,
        CapabilityGrantStatus.Enabled, CapabilityAuditLevel.Standard, null);
}

public interface ILeviathanCapabilityPolicy { Task<LeviathanCapabilityDecision> Evaluate(LeviathanRequestContext? context, LeviathanCapabilityCheck check); }

public sealed class LeviathanCapabilityPolicy(ILeviathanCapabilityStore store, LeviathanAppRegistry registry, IConfiguration config) : ILeviathanCapabilityPolicy
{
    public async Task<LeviathanCapabilityDecision> Evaluate(LeviathanRequestContext? context, LeviathanCapabilityCheck check)
    {
        var now = DateTimeOffset.UtcNow;
        string reason;
        LeviathanCapabilityGrant? match = null;
        if (context is null) reason = "missing_request_context";
        else if (check.CapabilityName.Value.StartsWith("admin.", StringComparison.Ordinal) && !LeviathanLocalDevIdentity.UnsafeAdminEnabled(config)) reason = "unsafe_admin_disabled";
        else if (!registry.TryGetManifest(check.AppId, out var manifest) || manifest is null || !manifest.Capabilities.Contains(check.CapabilityName.Value)) reason = "capability_not_declared";
        else
        {
            var grants = await store.GetGrants(context.AccountId, check.AppInstallationId, check.CapabilityName);
            match = grants.FirstOrDefault(g => g.Status == CapabilityGrantStatus.Enabled && (g.ExpiresAt is null || g.ExpiresAt > now) && ScopeCovers(g.Scope, check.Scope));
            reason = match is null ? (grants.Any(g => g.Status == CapabilityGrantStatus.Revoked) ? "capability_grant_revoked" : grants.Any(g => g.ExpiresAt <= now) ? "capability_grant_expired" : "capability_grant_missing") : "allowed";
        }
        var allowed = match is not null;
        var audit = new LeviathanCapabilityAuditEnvelope(now, context?.AccountId.Value, check.AppInstallationId.Value, check.AppId, check.CapabilityName.Value, check.Operation, check.TargetKind, check.TargetId, allowed, reason, match?.GrantId.Value, check.CorrelationId, context?.RequestId);
        await store.AppendAudit(audit);
        return new(allowed, reason, match?.GrantId, audit);
    }
    private static bool ScopeCovers(LeviathanCapabilityScope grant, LeviathanCapabilityScope requested) => grant.Kind == "account" || grant == requested;
}
