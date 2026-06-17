using Leviathan.Server.Ariadne;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<AriadneSessionPersistence>();
builder.Services.AddSingleton<AriadneSessionManager>();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

var app = builder.Build();
app.UseCors();

app.MapGet("/api/apps", (AriadneSessionManager manager) => Results.Ok(manager.Apps));

app.MapPost("/api/ariadne/sessions", (CreateAriadneSessionRequest request, AriadneSessionManager manager) =>
{
    if (!manager.TryCreate(request.AppId, out var session) || session is null)
        return Results.BadRequest(new { error = $"Unknown appId '{request.AppId}'." });
    return Results.Ok(new CreateAriadneSessionResponse(session.Id, session.Screen()));
});

app.MapGet("/api/ariadne/sessions", (AriadneSessionManager manager) => Results.Ok(manager.Sessions));
app.MapGet("/api/ariadne/sessions/{sessionId}/screen", GetScreen);

app.MapPost("/api/ariadne/sessions/{sessionId}/advance", (string sessionId, AdvancePromptRequest request, AriadneSessionManager manager) =>
    Submit(sessionId, manager, session => session.Advance(request.PromptId, request.Revision)));

app.MapPost("/api/ariadne/sessions/{sessionId}/choose", (string sessionId, ChoosePromptRequest request, AriadneSessionManager manager) =>
    Submit(sessionId, manager, session => session.Choose(request.PromptId, request.Revision, request.ChoiceKey)));

app.MapPost("/api/ariadne/sessions/{sessionId}/input", (string sessionId, InputPromptRequest request, AriadneSessionManager manager) =>
    Submit(sessionId, manager, session => session.Input(request.PromptId, request.Revision, request.Text)));

app.Run();

static IResult GetScreen(string sessionId, AriadneSessionManager manager)
{
    if (manager.TryGet(sessionId, out var session, out var error) && session is not null) return Results.Ok(session.Screen());
    return error is null
        ? Results.NotFound(new { error = $"Unknown session '{sessionId}'." })
        : Results.Problem(error, statusCode: StatusCodes.Status500InternalServerError);
}

static IResult Submit(string sessionId, AriadneSessionManager manager, Func<AriadneSession, (bool Ok, string? Error, AriadneScreenDto? Screen)> submit)
{
    if (!manager.TryGet(sessionId, out var session, out var error) || session is null)
        return error is null
            ? Results.NotFound(new { error = $"Unknown session '{sessionId}'." })
            : Results.Problem(error, statusCode: StatusCodes.Status500InternalServerError);
    var result = submit(session);
    if (result.Ok) manager.Save(session);
    return result.Ok ? Results.Ok(result.Screen) : Results.BadRequest(new { error = result.Error });
}

public partial class Program { }
