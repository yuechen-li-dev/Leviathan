using System.Text.Json;
using Dominatus.Actuators.SemanticKernel;
using Leviathan.Server.Platform.Identity;
using Leviathan.Server.Platform.Persistence;
using Leviathan.Server.Platform.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.SemanticKernel;

namespace Leviathan.Server.Platform.Projects;

public sealed record ReferenceUpload(string Name, string ContentBase64);
public sealed record EngineeringToolRequest(string Name, JsonElement Arguments, string[] ReferenceIds, string Root, Dictionary<string, string> DocumentHashes, string Requirements);
public static class EngineeringToolEndpoints
{
    public static readonly SemanticKernelActuatorOptions Options = new() { MaxResultBytes = 1_000_000, AllowedFunctions =
        [new("engineering", "search_references"), new("engineering", "read_reference"), new("engineering", "find_parts"), new("engineering", "bind_parameters"), new("engineering", "prepare_review")] };
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public static Kernel KernelFor(EngineeringReference[] references, string root = "", IReadOnlyDictionary<string, string>? hashes = null, string requirements = "")
    { var kernel = new Kernel(); kernel.Plugins.AddFromObject(new EngineeringTools(references, root, hashes ?? new Dictionary<string, string>(), requirements), "engineering"); return kernel; }
    public static JsonElement[] Schemas() => SemanticKernelToolCatalog.Create(KernelFor([]), Options).Values.Select(v => v.Schema).ToArray();
    private static LeviathanObjectKey Prefix(LeviathanRequestContext actor) => LeviathanObjectKey.FromParts("platform", "accounts", actor.AccountId.Value, "helios", "references");
    private static LeviathanObjectKey Key(LeviathanRequestContext actor, string id, string file)
    { if (!Guid.TryParseExact(id, "N", out _)) throw new InvalidOperationException("Invalid reference identity."); return Prefix(actor).Child(id, file); }
    private static async Task<LeviathanRequestContext?> Actor(HttpContext http, LeviathanDbContext db, CancellationToken ct)
    {
        if (http.Items[typeof(LeviathanRequestContext)] is not LeviathanRequestContext actor) return null;
        return await db.Installations.AnyAsync(i => i.AccountId == actor.AccountId.Value && i.AppId == "helios" && i.Status == "active", ct) ? actor : null;
    }
    public static async Task<EngineeringReference[]> Load(ILeviathanObjectStore objects, LeviathanRequestContext actor, string[] ids, CancellationToken ct)
    {
        if (ids.Length > 10 || ids.Distinct(StringComparer.Ordinal).Count() != ids.Length) throw new InvalidOperationException("Attach at most 10 distinct references.");
        var references = new List<EngineeringReference>();
        foreach (var id in ids)
        {
            var stored = await objects.GetAsync(Key(actor, id, "reference.json"), ct) ?? throw new InvalidOperationException("Attached reference is missing or inaccessible.");
            references.Add(JsonSerializer.Deserialize<EngineeringReference>(stored.Content, Json)!);
        }
        return references.ToArray();
    }
    public static void MapEngineeringToolEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/helios/author").RequireAuthorization();
        group.MapGet("/references", async (HttpContext http, LeviathanDbContext db, ILeviathanObjectStore objects, CancellationToken ct) => {
            if (await Actor(http, db, ct) is not { } actor) return Results.Forbid();
            var result = new List<object>();
            await foreach (var entry in objects.ListAsync(Prefix(actor), ct))
            {
                if (!entry.Key.Value.EndsWith("/reference.json", StringComparison.Ordinal)) continue;
                var stored = await objects.GetAsync(entry.Key, ct); if (stored is null) continue;
                var reference = JsonSerializer.Deserialize<EngineeringReference>(stored.Content, Json)!;
                result.Add(new { reference.Id, reference.Name, reference.Sha256, sections = reference.Sections.Length, tables = reference.Tables.Select(t => t.Name) });
            }
            return Results.Ok(result);
        });
        group.MapPost("/references", async (ReferenceUpload upload, HttpContext http, LeviathanDbContext db, ILeviathanObjectStore objects, CancellationToken ct) => {
            if (await Actor(http, db, ct) is not { } actor) return Results.Forbid();
            try {
                if (upload.ContentBase64.Length > EngineeringReferenceReader.MaxBytes * 4 / 3 + 4) throw new InvalidOperationException("Reference exceeds 4 MiB.");
                var bytes = Convert.FromBase64String(upload.ContentBase64); var reference = EngineeringReferenceReader.Read(upload.Name, bytes, ct);
                await objects.PutAsync(Key(actor, reference.Id, "original.bin"), bytes, new(ContentType: "application/octet-stream", ContentHash: reference.Sha256), new(IfNotExists: true), ct);
                await objects.PutAsync(Key(actor, reference.Id, "reference.json"), JsonSerializer.SerializeToUtf8Bytes(reference, Json), new(ContentType: "application/json"), new(IfNotExists: true), ct);
                return Results.Ok(new { reference.Id, reference.Name, reference.Sha256, sections = reference.Sections.Length, tables = reference.Tables.Select(t => t.Name) });
            } catch (Exception ex) when (ex is not OperationCanceledException) { return Results.BadRequest(new { error = "reference_import_failed", message = ex is InvalidOperationException ? ex.Message : "Reference could not be parsed. Supply a supported, unencrypted document with literal table cells." }); }
        }).AddEndpointFilter<LeviathanCsrfFilter>();
        group.MapPost("/tools/invoke", async (EngineeringToolRequest request, HttpContext http, LeviathanDbContext db, ILeviathanObjectStore objects, CancellationToken ct) => {
            if (await Actor(http, db, ct) is not { } actor) return Results.Forbid();
            try {
                if (request.Arguments.ValueKind != JsonValueKind.Object || request.ReferenceIds is null || request.DocumentHashes is null
                    || request.Requirements is null || string.IsNullOrWhiteSpace(request.Root)
                    || JsonSerializer.Serialize(request).Length > 200_000) throw new InvalidOperationException("Invalid engineering tool request.");
                var references = await Load(objects, actor, request.ReferenceIds, ct);
                var kernel = KernelFor(references, request.Root, request.DocumentHashes, request.Requirements);
                var catalog = SemanticKernelToolCatalog.Create(kernel, Options);
                if (!catalog.TryGetValue(request.Name, out var tool)) return Results.BadRequest(new { error = "engineering_tool_unknown" });
                // Request admission is above; Dominatus's bounded executor performs the exact same
                // operation used by Ai.Act/Ai.Await, without manufacturing a tick loop in ASP.NET.
                var result = await new SemanticKernelActuationHandler(kernel, Options).HandleAsync(default,
                    new(tool.Function.PluginName, tool.Function.FunctionName, request.Arguments.GetRawText()), ct);
                if (!result.Ok) return Results.BadRequest(new { error = "engineering_tool_rejected", message = result.Error });
                var output = JsonSerializer.Deserialize<JsonElement>(((SemanticKernelFunctionResult)result.Payload!).ResultText);
                return Results.Ok(output);
            } catch (Exception ex) when (ex is InvalidOperationException or ArgumentException or JsonException or KeyNotFoundException) {
                return Results.BadRequest(new { error = "engineering_tool_rejected", message = ex is InvalidOperationException ? ex.Message : "Invalid engineering tool arguments." });
            }
        }).AddEndpointFilter<LeviathanCsrfFilter>();
    }
}
