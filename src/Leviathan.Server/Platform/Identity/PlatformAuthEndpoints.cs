using System.Security.Claims;
using Leviathan.Server.Platform.Persistence;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Leviathan.Server.Platform.Identity;

public static class PlatformAuthEndpoints
{
    public static RouteGroupBuilder MapPlatformAuthEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/auth");
        group.MapGet("/csrf", (HttpContext http, IAntiforgery antiforgery) => Results.Ok(new { token = antiforgery.GetAndStoreTokens(http).RequestToken }));
        group.MapPost("/register", Register).AddEndpointFilter<LeviathanCsrfFilter>();
        group.MapPost("/login", Login).AddEndpointFilter<LeviathanCsrfFilter>();
        group.MapPost("/logout", async (SignInManager<LeviathanUser> signIn) => { await signIn.SignOutAsync(); return Results.NoContent(); }).RequireAuthorization().AddEndpointFilter<LeviathanCsrfFilter>();
        group.MapGet("/me", async (HttpContext http, LeviathanDbContext db) =>
        {
            var context = http.Items[typeof(LeviathanRequestContext)] as LeviathanRequestContext;
            if (context is null || context.UnsafeLocalDev) return Results.Unauthorized();
            var user = await db.Users.AsNoTracking().SingleAsync(x => x.Id == context.UserId.Value);
            return Results.Ok(new { userId = user.Id, user.DisplayName, user.Email, accountId = context.AccountId.Value });
        }).RequireAuthorization();
        return group;
    }

    private static async Task<IResult> Register(RegisterRequest request, LeviathanDbContext db, UserManager<LeviathanUser> users, SignInManager<LeviathanUser> signIn, CancellationToken ct)
    {
        var email = request.Email?.Trim();
        var displayName = request.DisplayName?.Trim();
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(displayName) || displayName.Length > 120)
            return Results.BadRequest(new { error = "invalid_registration" });
        var now = DateTimeOffset.UtcNow;
        var user = new LeviathanUser { Id = $"user_{Guid.NewGuid():N}", UserName = email, Email = email, DisplayName = displayName, CreatedAt = now };
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var created = await users.CreateAsync(user, request.Password ?? "");
        if (!created.Succeeded) return Results.BadRequest(new { error = "registration_rejected", details = created.Errors.Select(x => x.Code).ToArray() });
        var account = new LeviathanAccount { Id = $"acct_{Guid.NewGuid():N}", Name = $"{displayName}'s account", CreatedAt = now };
        user.DefaultAccountId = account.Id;
        var installation = new LeviathanInstallation { Id = $"inst_{Guid.NewGuid():N}", AccountId = account.Id, AppId = "helios", InstalledBy = user.Id, InstalledAt = now };
        db.Accounts.Add(account);
        db.Memberships.Add(new LeviathanMembership { AccountId = account.Id, UserId = user.Id, Role = "Owner", JoinedAt = now });
        db.Installations.Add(installation);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        await signIn.SignInAsync(user, isPersistent: false);
        return Results.Ok(new { userId = user.Id, user.DisplayName, user.Email, accountId = account.Id });
    }

    private static async Task<IResult> Login(LoginRequest request, UserManager<LeviathanUser> users, SignInManager<LeviathanUser> signIn)
    {
        var user = await users.FindByEmailAsync(request.Email?.Trim() ?? "");
        if (user is null) return Results.Unauthorized();
        var result = await signIn.PasswordSignInAsync(user, request.Password ?? "", false, lockoutOnFailure: true);
        return result.Succeeded ? Results.NoContent() : Results.Unauthorized();
    }

    private sealed record RegisterRequest(string? Email, string? Password, string? DisplayName);
    private sealed record LoginRequest(string? Email, string? Password);
}

public sealed class LeviathanCsrfFilter(IAntiforgery antiforgery) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        try { await antiforgery.ValidateRequestAsync(context.HttpContext); }
        catch (AntiforgeryValidationException) { return Results.Json(new { error = "invalid_csrf_token" }, statusCode: StatusCodes.Status400BadRequest); }
        return await next(context);
    }
}

public static class LeviathanAuthenticatedContext
{
    public static async Task ResolveAsync(HttpContext http, LeviathanDbContext db, RequestDelegate next)
    {
        var userId = http.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!string.IsNullOrWhiteSpace(userId))
        {
            var accountId = await db.Users.AsNoTracking().Where(x => x.Id == userId).Select(x => x.DefaultAccountId).SingleOrDefaultAsync();
            var membership = await db.Memberships.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.AccountId == accountId);
            if (membership?.Role is "Owner" or "Member") http.Items[typeof(LeviathanRequestContext)] = new LeviathanRequestContext("user", new(userId), new(membership.AccountId), false, http.TraceIdentifier);
        }
        await next(http);
    }
}
