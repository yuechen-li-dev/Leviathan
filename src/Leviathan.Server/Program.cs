using Leviathan.Server.Ariadne;
using Leviathan.Server.Apps.Scheduling;
using Leviathan.Server.Apps.Scheduling.Api;
using Leviathan.Server.Apps.Scheduling.Engine;
using Leviathan.Server.Apps.Scheduling.Storage;
using Leviathan.Server.Apps.Scheduling.Runtime;
using Leviathan.Server.Platform.Apps;
using Leviathan.Server.Platform.Identity;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<AriadneSessionPersistence>();
builder.Services.AddSingleton<ILeviathanSessionApp, RustSimulatorAppDefinition>();
builder.Services.AddSingleton<ILeviathanAppDefinition, RustSimulatorAppDefinition>(sp => (RustSimulatorAppDefinition)sp.GetRequiredService<ILeviathanSessionApp>());
builder.Services.AddSingleton<ILeviathanAppDefinition, SchedulingAppDefinition>();
builder.Services.AddSingleton<SchedulingStore, SchedulingFileStore>();
builder.Services.AddSingleton<ResourceLockRegistry>();
builder.Services.AddSingleton<SchedulingBookingRuntime>();
builder.Services.AddSingleton<BookingClaimService>();
builder.Services.AddSingleton<SlotGenerator>();
builder.Services.AddSingleton<LeviathanAppRegistry>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddSingleton<ILeviathanRequestContextAccessor, LeviathanRequestContextAccessor>();
builder.Services.AddSingleton<LeviathanLocalDevAppInstallations>();
builder.Services.AddSingleton<AriadneSessionManager>();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

var app = builder.Build();
app.UseCors();

app.MapGet("/api/apps", (LeviathanAppRegistry registry) => Results.Ok(registry.Apps));
app.MapGet("/api/platform/local-dev/context", (ILeviathanRequestContextAccessor ctx, LeviathanLocalDevAppInstallations installs) => ctx.Current is { } c ? Results.Ok(new { c.ActorKind, UserId = c.UserId.Value, AccountId = c.AccountId.Value, UnsafeLocalDev = c.UnsafeLocalDev, c.RequestId, SchedulingInstallation = installs.Scheduling }) : Results.Json(new { error = "unsafe_admin_disabled", message = "Local-dev context is only available when LEVIATHAN_ALLOW_UNSAFE_ADMIN=true." }, statusCode: StatusCodes.Status403Forbidden));
app.MapSchedulingEndpoints();

app.MapGet("/api/apps/{appId}", (string appId, LeviathanAppRegistry registry) =>
    registry.TryGetManifest(appId, out var manifest) ? Results.Ok(manifest) : Results.NotFound(new { error = $"Unknown appId '{appId}'." }));

app.MapPost("/api/apps/{appId}/sessions", (string appId, AriadneSessionManager manager) => CreateSession(appId, manager));
app.MapGet("/api/apps/{appId}/sessions", (string appId, AriadneSessionManager manager) => Results.Ok(manager.Sessions(appId)));
app.MapGet("/api/apps/{appId}/sessions/{sessionId}/screen", GetScreen);
app.MapPost("/api/apps/{appId}/sessions/{sessionId}/advance", (string appId, string sessionId, AdvancePromptRequest request, AriadneSessionManager manager) =>
    Submit(appId, sessionId, manager, session => session.Advance(request.PromptId, request.Revision)));
app.MapPost("/api/apps/{appId}/sessions/{sessionId}/choose", (string appId, string sessionId, ChoosePromptRequest request, AriadneSessionManager manager) =>
    Submit(appId, sessionId, manager, session => session.Choose(request.PromptId, request.Revision, request.ChoiceKey)));
app.MapPost("/api/apps/{appId}/sessions/{sessionId}/input", (string appId, string sessionId, InputPromptRequest request, AriadneSessionManager manager) =>
    Submit(appId, sessionId, manager, session => session.Input(request.PromptId, request.Revision, request.Text)));

// Transitional Ariadne aliases retained for the M0-M5 frontend/API contract.
app.MapPost("/api/ariadne/sessions", (CreateAriadneSessionRequest request, AriadneSessionManager manager) => CreateSession(request.AppId, manager));
app.MapGet("/api/ariadne/sessions", (AriadneSessionManager manager) => Results.Ok(manager.Sessions("rust_simulator")));
app.MapGet("/api/ariadne/sessions/{sessionId}/screen", (string sessionId, AriadneSessionManager manager) => GetScreen("rust_simulator", sessionId, manager));
app.MapPost("/api/ariadne/sessions/{sessionId}/advance", (string sessionId, AdvancePromptRequest request, AriadneSessionManager manager) =>
    Submit("rust_simulator", sessionId, manager, session => session.Advance(request.PromptId, request.Revision)));
app.MapPost("/api/ariadne/sessions/{sessionId}/choose", (string sessionId, ChoosePromptRequest request, AriadneSessionManager manager) =>
    Submit("rust_simulator", sessionId, manager, session => session.Choose(request.PromptId, request.Revision, request.ChoiceKey)));
app.MapPost("/api/ariadne/sessions/{sessionId}/input", (string sessionId, InputPromptRequest request, AriadneSessionManager manager) =>
    Submit("rust_simulator", sessionId, manager, session => session.Input(request.PromptId, request.Revision, request.Text)));

app.Run();

static IResult CreateSession(string appId, AriadneSessionManager manager)
{
    if (!manager.TryCreate(appId, out var session) || session is null)
        return Results.BadRequest(new { error = $"Unknown appId '{appId}'." });
    return Results.Ok(new CreateAriadneSessionResponse(session.Id, session.Screen()));
}

static IResult GetScreen(string appId, string sessionId, AriadneSessionManager manager)
{
    if (manager.TryGet(appId, sessionId, out var session, out var error) && session is not null) return Results.Ok(session.Screen());
    return error is null
        ? Results.NotFound(new { error = $"Unknown session '{sessionId}' for app '{appId}'." })
        : Results.Problem(error, statusCode: StatusCodes.Status500InternalServerError);
}

static IResult Submit(string appId, string sessionId, AriadneSessionManager manager, Func<AriadneSession, (bool Ok, string? Error, AriadneScreenDto? Screen)> submit)
{
    if (!manager.TryGet(appId, sessionId, out var session, out var error) || session is null)
        return error is null
            ? Results.NotFound(new { error = $"Unknown session '{sessionId}' for app '{appId}'." })
            : Results.Problem(error, statusCode: StatusCodes.Status500InternalServerError);
    var result = submit(session);
    if (result.Ok) manager.Save(session);
    return result.Ok ? Results.Ok(result.Screen) : Results.BadRequest(new { error = result.Error });
}

public partial class Program { }
