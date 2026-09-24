using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Leviathan.Server.Platform.Identity;
using Leviathan.Server.Platform.Persistence;
using Leviathan.Server.Platform.Storage;
using Microsoft.EntityFrameworkCore;

namespace Leviathan.Server.Platform.Projects;

public static class HeliosPublicationEndpoints
{
    private const int MaxPreviewBytes = 2 * 1024 * 1024;
    private static readonly byte[] PngSignature = [137, 80, 78, 71, 13, 10, 26, 10];

    public static void MapHeliosPublicationEndpoints(this WebApplication app)
    {
        var publicGroup = app.MapGroup("/api/helios/publications");
        publicGroup.MapGet("/", List);
        publicGroup.MapGet("/{id}", Get);
        publicGroup.MapGet("/{id}/preview", Preview);
        publicGroup.MapPost("/{id}/fork", Fork).RequireAuthorization().AddEndpointFilter<LeviathanCsrfFilter>();
        app.MapPost("/api/projects/{id}/publish", Publish).RequireAuthorization().AddEndpointFilter<LeviathanCsrfFilter>();
    }

    private static async Task<IResult> List(LeviathanDbContext db, CancellationToken ct)
    {
        var rows = await db.HeliosPublications.AsNoTracking().Where(x => x.Visibility == "Public").ToListAsync(ct);
        return Results.Ok(rows.OrderByDescending(x => x.PublishedAt).ThenBy(x => x.Id).Take(100).Select(Summary));
    }

    private static async Task<IResult> Get(string id, LeviathanDbContext db, ILeviathanObjectStore objects, CancellationToken ct)
    {
        var publication = await Public(db, id, ct);
        if (publication is null) return NotFound();
        var revision = await db.ProjectRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == publication.PublishedRevisionId && x.ProjectId == publication.ProjectId, ct);
        if (revision is null) return Unavailable();
        var source = await ReadSource(objects, revision, ct);
        return source is null ? Unavailable() : Results.Ok(new { publication.Id, publication.Title, publication.Description, publication.Category, publication.CreatorName, tags = Tags(publication), publication.PublishedRevisionId, publication.PublishedAt, previewUrl = PreviewUrl(publication), source });
    }

    private static async Task<IResult> Preview(string id, LeviathanDbContext db, ILeviathanObjectStore objects, HttpContext http, CancellationToken ct)
    {
        var publication = await Public(db, id, ct);
        if (publication is null) return NotFound();
        LeviathanObjectReadResult? asset;
        try { asset = await objects.GetAsync(new(publication.PreviewObjectKey), ct); }
        catch (LeviathanObjectStorageException) { return Unavailable(); }
        if (asset is null || !IsPng(asset.Content)) return Unavailable();
        http.Response.Headers.CacheControl = "public, max-age=300";
        return Results.File(asset.Content, "image/png");
    }

    private static async Task<IResult> Publish(string id, PublishRequest request, HttpContext http, LeviathanDbContext db, ILeviathanObjectStore objects, CancellationToken ct)
    {
        var actor = Context(http);
        if (actor is null) return Results.Unauthorized();
        var title = request.Title?.Trim();
        var description = request.Description?.Trim() ?? "";
        var category = request.Category?.Trim() ?? "Mechanical";
        var tags = request.Tags?.Select(x => x.Trim()).Where(x => x.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToArray() ?? [];
        if (string.IsNullOrWhiteSpace(title) || title.Length > 160 || description.Length > 2000 || category.Length > 40 || tags.Length > 8 || tags.Any(x => x.Length > 32) || string.IsNullOrWhiteSpace(request.ExpectedRevisionId))
            return Results.BadRequest(new { error = "invalid_publication" });
        byte[] preview;
        try { preview = Convert.FromBase64String(request.PreviewPngBase64 ?? ""); }
        catch (FormatException) { return Results.BadRequest(new { error = "invalid_preview" }); }
        if (preview.Length > MaxPreviewBytes || !IsPng(preview)) return Results.BadRequest(new { error = "invalid_preview" });
        var project = await db.Projects.SingleOrDefaultAsync(x => x.Id == id && x.AccountId == actor.AccountId.Value && x.Status == "active" && x.CurrentRevisionId == request.ExpectedRevisionId, ct);
        if (project is null) return Results.NotFound(new { error = "project_or_revision_not_found" });
        var installation = await db.Installations.AsNoTracking().AnyAsync(x => x.Id == project.AppInstallationId && x.AccountId == actor.AccountId.Value && x.AppId == "helios" && x.Status == "active", ct);
        var member = await db.Memberships.AsNoTracking().SingleOrDefaultAsync(x => x.AccountId == actor.AccountId.Value && x.UserId == actor.UserId.Value, ct);
        if (!installation || member?.Role != "Owner") return Results.Forbid();
        var revision = await db.ProjectRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == project.CurrentRevisionId && x.ProjectId == id, ct);
        if (revision is null || await ReadSource(objects, revision, ct) is null) return Unavailable();
        var existing = await db.HeliosPublications.SingleOrDefaultAsync(x => x.ProjectId == id, ct);
        var publicationId = existing?.Id ?? $"pub_{Guid.NewGuid():N}";
        var previewKey = LeviathanObjectKey.FromParts("helios", "publications", publicationId, "previews", $"{Guid.NewGuid():N}.png");
        try { await objects.PutAsync(previewKey, preview, new("image/png", ContentHash: Hash(preview)), new(IfNotExists: true), ct); }
        catch (LeviathanObjectStorageException) { return Unavailable(); }
        var user = await db.Users.AsNoTracking().SingleAsync(x => x.Id == actor.UserId.Value, ct);
        var publication = existing ?? new HeliosPublication { Id = publicationId, ProjectId = id, AccountId = actor.AccountId.Value };
        publication.Title = title; publication.Description = description; publication.Category = category;
        publication.TagsJson = JsonSerializer.Serialize(tags); publication.CreatorName = user.DisplayName;
        publication.PublishedRevisionId = revision.Id; publication.PreviewObjectKey = previewKey.Value;
        publication.Visibility = "Public"; publication.PublishedAt = DateTimeOffset.UtcNow;
        if (existing is null) db.HeliosPublications.Add(publication);
        await db.SaveChangesAsync(ct);
        return Results.Ok(Summary(publication));
    }

    private static async Task<IResult> Fork(string id, HttpContext http, LeviathanDbContext db, ILeviathanObjectStore objects, CancellationToken ct)
    {
        var actor = Context(http);
        if (actor is null) return Results.Unauthorized();
        var publication = await Public(db, id, ct);
        if (publication is null) return NotFound();
        var installation = await db.Installations.AsNoTracking().SingleOrDefaultAsync(x => x.AccountId == actor.AccountId.Value && x.AppId == "helios" && x.Status == "active", ct);
        if (installation is null) return Results.Forbid();
        var revision = await db.ProjectRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == publication.PublishedRevisionId && x.ProjectId == publication.ProjectId, ct);
        if (revision is null) return Unavailable();
        var source = await ReadSource(objects, revision, ct);
        if (source is null) return Unavailable();
        var now = DateTimeOffset.UtcNow;
        var project = new LeviathanProject { Id = $"proj_{Guid.NewGuid():N}", AccountId = actor.AccountId.Value, AppInstallationId = installation.Id, Name = $"{publication.Title} Copy"[..Math.Min(publication.Title.Length + 5, 160)], CreatedBy = actor.UserId.Value, CreatedAt = now, UpdatedAt = now };
        var forkRevision = new LeviathanProjectRevision { Id = $"rev_{Guid.NewGuid():N}", ProjectId = project.Id, CreatedBy = actor.UserId.Value, CreatedAt = now, ContentHash = revision.ContentHash };
        forkRevision.SourceObjectKey = LeviathanObjectKey.FromParts("accounts", project.AccountId, "apps", project.AppInstallationId, "projects", project.Id, "source", forkRevision.Id).Value;
        project.CurrentRevisionId = forkRevision.Id;
        try { await objects.PutAsync(new(forkRevision.SourceObjectKey), Encoding.UTF8.GetBytes(source), new("text/plain; charset=utf-8", ContentHash: forkRevision.ContentHash), new(IfNotExists: true), ct); }
        catch (LeviathanObjectStorageException) { return Unavailable(); }
        db.Projects.Add(project); db.ProjectRevisions.Add(forkRevision);
        await db.SaveChangesAsync(ct);
        return Results.Created($"/api/projects/{project.Id}", new { project.Id, project.AppInstallationId, project.Name, revisionId = forkRevision.Id, source, forkRevision.ContentHash, project.CreatedAt, project.UpdatedAt });
    }

    private static async Task<HeliosPublication?> Public(LeviathanDbContext db, string id, CancellationToken ct) =>
        await db.HeliosPublications.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.Visibility == "Public" && db.Projects.Any(p => p.Id == x.ProjectId && p.Status == "active"), ct);
    private static object Summary(HeliosPublication row) => new { row.Id, row.Title, row.Description, row.Category, row.CreatorName, tags = Tags(row), row.PublishedRevisionId, row.PublishedAt, previewUrl = PreviewUrl(row) };
    private static string PreviewUrl(HeliosPublication row) => $"/api/helios/publications/{row.Id}/preview";
    private static string[] Tags(HeliosPublication row) => JsonSerializer.Deserialize<string[]>(row.TagsJson) ?? [];
    private static LeviathanRequestContext? Context(HttpContext http) => http.Items[typeof(LeviathanRequestContext)] as LeviathanRequestContext;
    private static IResult NotFound() => Results.NotFound(new { error = "publication_not_found" });
    private static IResult Unavailable() => Results.Problem(statusCode: 503, title: "Publication artifact unavailable");
    private static bool IsPng(byte[] bytes) => bytes.Length >= 45 && bytes.AsSpan(0, 8).SequenceEqual(PngSignature)
        && bytes.AsSpan(12, 4).SequenceEqual("IHDR"u8) && bytes.AsSpan(bytes.Length - 8, 4).SequenceEqual("IEND"u8);
    private static string Hash(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    private static async Task<string?> ReadSource(ILeviathanObjectStore objects, LeviathanProjectRevision revision, CancellationToken ct)
    {
        try
        {
            var asset = await objects.GetAsync(new(revision.SourceObjectKey), ct);
            return asset is not null && Hash(asset.Content) == revision.ContentHash ? Encoding.UTF8.GetString(asset.Content) : null;
        }
        catch (LeviathanObjectStorageException) { return null; }
    }
    private sealed record PublishRequest(string? ExpectedRevisionId, string? Title, string? Description, string? Category, string[]? Tags, string? PreviewPngBase64);
}
