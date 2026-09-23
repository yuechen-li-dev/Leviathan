using System.Security.Cryptography;
using System.Text;
using Leviathan.Server.Platform.Identity;
using Leviathan.Server.Platform.Persistence;
using Leviathan.Server.Platform.Storage;
using Microsoft.EntityFrameworkCore;

namespace Leviathan.Server.Platform.Projects;

public static class ProjectEndpoints
{
    private const int MaxSourceBytes = 2 * 1024 * 1024;

    public static RouteGroupBuilder MapProjectEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/projects").RequireAuthorization();
        group.MapGet("/", List);
        group.MapGet("/{id}", Get);
        group.MapPost("/", Create).AddEndpointFilter<LeviathanCsrfFilter>();
        group.MapPut("/{id}", Save).AddEndpointFilter<LeviathanCsrfFilter>();
        group.MapDelete("/{id}", Delete).AddEndpointFilter<LeviathanCsrfFilter>();
        return group;
    }

    private static async Task<IResult> List(HttpContext http, LeviathanDbContext db, CancellationToken ct)
    {
        if (Context(http) is not { } actor) return Results.Unauthorized();
        var installations = db.Installations.AsNoTracking().Where(x => x.AccountId == actor.AccountId.Value && x.Status == "active").Select(x => x.Id);
        var projects = await db.Projects.AsNoTracking().Where(x => x.AccountId == actor.AccountId.Value && installations.Contains(x.AppInstallationId) && x.Status == "active").Select(x => new ProjectSummary(x.Id, x.AppInstallationId, x.Name, x.CurrentRevisionId, x.CreatedAt, x.UpdatedAt)).ToListAsync(ct);
        return Results.Ok(projects.OrderByDescending(x => x.UpdatedAt));
    }

    private static async Task<IResult> Get(string id, HttpContext http, LeviathanDbContext db, ILeviathanObjectStore objects, ILoggerFactory loggerFactory, CancellationToken ct)
    {
        if (Context(http) is not { } actor) return Results.Unauthorized();
        var project = await OwnedProject(db, actor, id, ct);
        if (project is null) return Results.NotFound(new { error = "project_not_found" });
        var revision = await db.ProjectRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == project.CurrentRevisionId && x.ProjectId == project.Id, ct);
        if (revision is null) return Results.Problem(statusCode: 503, title: "Project revision unavailable");
        LeviathanObjectReadResult? source;
        try { source = await objects.GetAsync(new(revision.SourceObjectKey), ct); }
        catch (LeviathanObjectStorageException) { return Results.Problem(statusCode: 503, title: "Project storage unavailable"); }
        if (source is null || !string.Equals(Hash(source.Content), revision.ContentHash, StringComparison.Ordinal)) return Results.Problem(statusCode: 503, title: "Project source unavailable");
        db.ProjectAudits.Add(Audit(actor, project, revision.Id, "opened"));
        await db.SaveChangesAsync(ct);
        loggerFactory.CreateLogger("Leviathan.ProjectAudit").LogInformation("ProjectOpened request={RequestId} actor={Actor} account={Account} installation={Installation} project={Project} revision={Revision}", actor.RequestId, actor.UserId.Value, actor.AccountId.Value, project.AppInstallationId, project.Id, revision.Id);
        return Results.Ok(new ProjectDetail(project.Id, project.AppInstallationId, project.Name, revision.Id, Encoding.UTF8.GetString(source.Content), revision.ContentHash, project.CreatedAt, project.UpdatedAt));
    }

    private static async Task<IResult> Create(CreateProjectRequest request, HttpContext http, LeviathanDbContext db, ILeviathanObjectStore objects, ILoggerFactory loggerFactory, CancellationToken ct)
    {
        if (Context(http) is not { } actor) return Results.Unauthorized();
        var name = request.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name) || name.Length > 160 || InvalidSource(request.Source)) return Results.BadRequest(new { error = "invalid_project" });
        var installation = await db.Installations.AsNoTracking().SingleOrDefaultAsync(x => x.AccountId == actor.AccountId.Value && x.AppId == request.AppId && x.Status == "active", ct);
        if (installation is null) return Results.Forbid();
        var now = DateTimeOffset.UtcNow;
        var project = new LeviathanProject { Id = $"proj_{Guid.NewGuid():N}", AccountId = actor.AccountId.Value, AppInstallationId = installation.Id, Name = name, CreatedBy = actor.UserId.Value, CreatedAt = now, UpdatedAt = now };
        var revision = Revision(project, request.Source!, actor.UserId.Value, now);
        project.CurrentRevisionId = revision.Id;
        try { await objects.PutAsync(new(revision.SourceObjectKey), Encoding.UTF8.GetBytes(request.Source!), new("text/plain; charset=utf-8", ContentHash: revision.ContentHash), new(IfNotExists: true), ct); }
        catch (LeviathanObjectStorageException) { return Results.Problem(statusCode: 503, title: "Project storage unavailable"); }
        db.Projects.Add(project);
        db.ProjectRevisions.Add(revision);
        db.ProjectAudits.Add(Audit(actor, project, revision.Id, "created"));
        await db.SaveChangesAsync(ct);
        loggerFactory.CreateLogger("Leviathan.ProjectAudit").LogInformation("ProjectCreated request={RequestId} actor={Actor} account={Account} installation={Installation} project={Project} revision={Revision}", actor.RequestId, actor.UserId.Value, actor.AccountId.Value, installation.Id, project.Id, revision.Id);
        return Results.Created($"/api/projects/{project.Id}", new ProjectDetail(project.Id, project.AppInstallationId, project.Name, revision.Id, request.Source!, revision.ContentHash, project.CreatedAt, project.UpdatedAt));
    }

    private static async Task<IResult> Save(string id, SaveProjectRequest request, HttpContext http, LeviathanDbContext db, ILeviathanObjectStore objects, ILoggerFactory loggerFactory, CancellationToken ct)
    {
        if (Context(http) is not { } actor) return Results.Unauthorized();
        if (string.IsNullOrWhiteSpace(request.ExpectedRevisionId) || InvalidSource(request.Source)) return Results.BadRequest(new { error = "invalid_save" });
        var project = await OwnedProject(db, actor, id, ct);
        if (project is null) return Results.NotFound(new { error = "project_not_found" });
        if (project.CurrentRevisionId != request.ExpectedRevisionId) return Results.Conflict(new { error = "stale_revision", currentRevisionId = project.CurrentRevisionId });
        var now = DateTimeOffset.UtcNow;
        var revision = Revision(project, request.Source!, actor.UserId.Value, now);
        try { await objects.PutAsync(new(revision.SourceObjectKey), Encoding.UTF8.GetBytes(request.Source!), new("text/plain; charset=utf-8", ContentHash: revision.ContentHash), new(IfNotExists: true), ct); }
        catch (LeviathanObjectStorageException) { return Results.Problem(statusCode: 503, title: "Project storage unavailable"); }
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var changed = await db.Projects.Where(x => x.Id == id && x.AccountId == actor.AccountId.Value && x.Status == "active" && x.CurrentRevisionId == request.ExpectedRevisionId).ExecuteUpdateAsync(setters => setters.SetProperty(x => x.CurrentRevisionId, revision.Id).SetProperty(x => x.UpdatedAt, now), ct);
        if (changed != 1) return Results.Conflict(new { error = "stale_revision" });
        db.ProjectRevisions.Add(revision);
        db.ProjectAudits.Add(Audit(actor, project, revision.Id, "saved"));
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        loggerFactory.CreateLogger("Leviathan.ProjectAudit").LogInformation("ProjectSaved request={RequestId} actor={Actor} account={Account} installation={Installation} project={Project} revision={Revision}", actor.RequestId, actor.UserId.Value, actor.AccountId.Value, project.AppInstallationId, project.Id, revision.Id);
        return Results.Ok(new { revisionId = revision.Id, revision.ContentHash, updatedAt = now });
    }

    private static async Task<IResult> Delete(string id, HttpContext http, LeviathanDbContext db, ILoggerFactory loggerFactory, CancellationToken ct)
    {
        if (Context(http) is not { } actor) return Results.Unauthorized();
        var project = await OwnedProject(db, actor, id, ct);
        if (project is null) return Results.NotFound(new { error = "project_not_found" });
        var membership = await db.Memberships.AsNoTracking().SingleOrDefaultAsync(x => x.AccountId == actor.AccountId.Value && x.UserId == actor.UserId.Value, ct);
        if (membership?.Role != "Owner") return Results.Forbid();
        project.Status = "deleted";
        project.UpdatedAt = DateTimeOffset.UtcNow;
        db.ProjectAudits.Add(Audit(actor, project, project.CurrentRevisionId, "deleted"));
        await db.SaveChangesAsync(ct);
        loggerFactory.CreateLogger("Leviathan.ProjectAudit").LogInformation("ProjectDeleted request={RequestId} actor={Actor} account={Account} installation={Installation} project={Project} revision={Revision}", actor.RequestId, actor.UserId.Value, actor.AccountId.Value, project.AppInstallationId, project.Id, project.CurrentRevisionId);
        return Results.NoContent();
    }

    private static LeviathanRequestContext? Context(HttpContext http) => http.Items[typeof(LeviathanRequestContext)] as LeviathanRequestContext;
    private static LeviathanProjectAudit Audit(LeviathanRequestContext actor, LeviathanProject project, string revisionId, string operation) => new()
    {
        Id = $"audit_{Guid.NewGuid():N}", AccountId = actor.AccountId.Value, AppInstallationId = project.AppInstallationId,
        ProjectId = project.Id, ActorUserId = actor.UserId.Value, RevisionId = revisionId, RequestId = actor.RequestId,
        Operation = operation, Result = "success", OccurredAt = DateTimeOffset.UtcNow
    };
    private static Task<LeviathanProject?> OwnedProject(LeviathanDbContext db, LeviathanRequestContext actor, string id, CancellationToken ct)
    {
        var installations = db.Installations.AsNoTracking().Where(x => x.AccountId == actor.AccountId.Value && x.Status == "active").Select(x => x.Id);
        return db.Projects.SingleOrDefaultAsync(x => x.Id == id && x.AccountId == actor.AccountId.Value && x.Status == "active" && installations.Contains(x.AppInstallationId), ct);
    }
    private static bool InvalidSource(string? source) => source is null || Encoding.UTF8.GetByteCount(source) > MaxSourceBytes;
    private static string Hash(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    private static LeviathanProjectRevision Revision(LeviathanProject project, string source, string actor, DateTimeOffset now)
    {
        var id = $"rev_{Guid.NewGuid():N}";
        return new() { Id = id, ProjectId = project.Id, SourceObjectKey = LeviathanObjectKey.FromParts("accounts", project.AccountId, "apps", project.AppInstallationId, "projects", project.Id, "source", id).Value, ContentHash = Hash(Encoding.UTF8.GetBytes(source)), CreatedBy = actor, CreatedAt = now };
    }
    private sealed record CreateProjectRequest(string? AppId, string? Name, string? Source);
    private sealed record SaveProjectRequest(string? ExpectedRevisionId, string? Source);
    private sealed record ProjectSummary(string Id, string AppInstallationId, string Name, string RevisionId, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
    private sealed record ProjectDetail(string Id, string AppInstallationId, string Name, string RevisionId, string Source, string ContentHash, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
}
