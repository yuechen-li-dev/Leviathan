using System.Diagnostics;
using System.Net;
using System.Security.Cryptography;
using System.Text.Json;
using Leviathan.Server.Platform.Identity;
using Leviathan.Server.Platform.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.EntityFrameworkCore;

namespace Leviathan.Server.Desktop;

/// <summary>The packaged local profile. Cloud authentication/storage remain unchanged.</summary>
public sealed class HeliosDesktopLaunch : IDisposable
{
    public const int DefaultPort = 4180;
    private const string UserId = "user_helios_desktop";
    private readonly string token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    private readonly FileStream? lease;
    private readonly bool noBrowser;
    public string DataRoot { get; }
    public int Port { get; }
    public string Address => $"http://127.0.0.1:{Port}";
    public bool AlreadyRunning { get; }
    private string SessionPath => Path.Combine(DataRoot, "running.json");

    private HeliosDesktopLaunch(int port, string dataRoot, bool noBrowser)
    {
        Port = port; DataRoot = Path.GetFullPath(dataRoot); this.noBrowser = noBrowser;
        Directory.CreateDirectory(DataRoot);
        try { lease = new FileStream(Path.Combine(DataRoot, "host.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None); }
        catch (IOException) {
            AlreadyRunning = true;
            // The lease is held for the host's entire lifetime. Never start a second database owner.
            var session = JsonSerializer.Deserialize<RunningSession>(File.ReadAllText(SessionPath))
                ?? throw new InvalidOperationException("Helios is starting. Try again in a moment.");
            if (!Uri.TryCreate(session.Address, UriKind.Absolute, out var address) || address.Host != "127.0.0.1" || address.Scheme != "http"
                || session.Token.Length != 64) throw new InvalidOperationException("Invalid local Helios session. Close the previous launcher first.");
            Console.WriteLine($"Helios is already running at {session.Address}");
            if (!noBrowser) OpenBrowser(session.Address, session.Token);
        }
    }

    public static HeliosDesktopLaunch? TryCreate(string[] args)
    {
        if (!args.Contains("--helios-desktop") && !File.Exists(Path.Combine(AppContext.BaseDirectory, "helios-bundle.json"))) return null;
        var port = DefaultPort;
        var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Aetheris", "Helios");
        var noBrowser = false;
        for (var i = 0; i < args.Length; i++) {
            switch (args[i]) {
                case "--helios-desktop": break;
                case "--no-browser": noBrowser = true; break;
                case "--port" when i + 1 < args.Length && int.TryParse(args[++i], out var number) && number is > 1023 and <= 65535: port = number; break;
                case "--data-dir" when i + 1 < args.Length: root = args[++i]; break;
                default: throw new ArgumentException("Helios accepts --no-browser, --port <1024-65535>, and --data-dir <directory>. The desktop host always binds to loopback.");
            }
        }
        if (!File.Exists(Path.Combine(AppContext.BaseDirectory, "wwwroot", "index.html")))
            throw new InvalidOperationException("Helios browser assets are missing. Extract the complete bundle before starting Helios.");
        return new(port, root, noBrowser);
    }

    public void Configure(WebApplicationBuilder builder)
    {
        // Local mode cannot inherit cloud database/object storage or unsafe development identity.
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> {
            ["urls"] = Address, ["LEVIATHAN_DATA_DIR"] = DataRoot,
            ["LEVIATHAN_POSTGRES_CONNECTION"] = "", ["LEVIATHAN_S3_BUCKET"] = "",
            ["LEVIATHAN_ALLOW_UNSAFE_ADMIN"] = "false", ["HELIOS_LOCAL_AI"] = "true",
            ["LEVIATHAN_ALLOWED_ORIGINS"] = ""
        });
        if (builder.Configuration.GetSection("Kestrel:Endpoints").GetChildren().Any())
            throw new InvalidOperationException("Remove custom Kestrel endpoints before using the loopback-only Helios launcher.");
        builder.Logging.ClearProviders();
        builder.Logging.SetMinimumLevel(LogLevel.Information);
        builder.Logging.AddFilter("Microsoft", LogLevel.Warning);
        builder.Logging.AddProvider(new DesktopFileLogger(Path.Combine(DataRoot, "logs")));
    }

    public async Task Initialize(WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LeviathanDbContext>();
        if (await db.Users.AnyAsync(x => x.Id == UserId)) return;
        var users = scope.ServiceProvider.GetRequiredService<UserManager<LeviathanUser>>();
        var now = DateTimeOffset.UtcNow;
        var user = new LeviathanUser { Id = UserId, UserName = "local@helios.invalid", Email = "local@helios.invalid", DisplayName = "Local engineer", DefaultAccountId = "acct_helios_desktop", CreatedAt = now };
        await using var transaction = await db.Database.BeginTransactionAsync();
        var result = await users.CreateAsync(user); // No password: access requires the launch capability.
        if (!result.Succeeded) throw new InvalidOperationException("Could not initialize the local Helios identity.");
        db.Accounts.Add(new() { Id = user.DefaultAccountId, Name = "On this computer", CreatedAt = now });
        db.Memberships.Add(new() { AccountId = user.DefaultAccountId, UserId = user.Id, Role = "Owner", JoinedAt = now });
        db.Installations.Add(new() { Id = "inst_helios_desktop", AccountId = user.DefaultAccountId, AppId = "helios", InstalledBy = user.Id, InstalledAt = now });
        await db.SaveChangesAsync(); await transaction.CommitAsync();
    }

    public void Guard(WebApplication app) => app.Use(async (http, next) => {
        // Reject DNS rebinding and cross-origin browser requests before any API, including MCP.
        if (http.Connection.RemoteIpAddress is not { } ip || !IPAddress.IsLoopback(ip)
            || http.Request.Host.Host != "127.0.0.1" || http.Request.Host.Port != Port
            || (http.Request.Headers.Origin.Count != 0 && http.Request.Headers.Origin != Address)) {
            http.Response.StatusCode = 403; return;
        }
        http.Response.Headers["Referrer-Policy"] = "no-referrer";
        http.Response.Headers["X-Content-Type-Options"] = "nosniff";
        if (http.Request.Path.StartsWithSegments("/api/auth") && http.Request.Path.Value is "/api/auth/register" or "/api/auth/login" or "/api/auth/logout") {
            http.Response.StatusCode = 403; return; // Single local identity, not a LAN/cloud account service.
        }
        await next();
    });

    public void Map(WebApplication app)
    {
        app.MapGet("/__helios/status", () => Results.Ok(new { mode = "desktop", address = Address }));
        app.MapGet("/__helios/start", (HttpContext http) => {
            http.Response.Headers.CacheControl = "no-store";
            http.Response.Headers.ContentSecurityPolicy = "default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'";
            return Results.Content("""
                <!doctype html><html lang="en"><meta charset="utf-8"><title>Opening Helios</title>
                <body><p id="message">Opening your local Helios workspace…</p><script>
                const token = location.hash.slice(1); history.replaceState(null, '', '/__helios/start');
                fetch('/__helios/session', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({token})})
                .then(r => { if (!r.ok) throw Error(); location.replace('/'); })
                .catch(() => document.getElementById('message').textContent='This launch link has expired. Open the Helios launcher again.');
                </script></body></html>
                """, "text/html");
        });
        app.MapPost("/__helios/session", async (SessionRequest request, HttpContext http, UserManager<LeviathanUser> users, SignInManager<LeviathanUser> signIn) => {
            if (request.Token is null || request.Token.Length != token.Length
                || !CryptographicOperations.FixedTimeEquals(System.Text.Encoding.UTF8.GetBytes(request.Token), System.Text.Encoding.UTF8.GetBytes(token)))
                return Results.Unauthorized();
            http.Response.Headers.CacheControl = "no-store";
            await signIn.SignInAsync((await users.FindByIdAsync(UserId))!, isPersistent: false);
            return Results.NoContent();
        });
        app.MapPost("/__helios/stop", (HttpContext http, IHostApplicationLifetime lifetime) => {
            http.Response.OnCompleted(() => { lifetime.StopApplication(); return Task.CompletedTask; });
            return Results.NoContent();
        }).RequireAuthorization().AddEndpointFilter<LeviathanCsrfFilter>();
        var types = new FileExtensionContentTypeProvider();
        types.Mappings[".wasm"] = "application/wasm";
        types.Mappings[".dat"] = "application/octet-stream";
        // The SDK's page-thread runtime manifest includes portable debug symbols.
        // ASP.NET deliberately has no default .pdb mapping, so admit only static
        // files from the packaged wwwroot (never the host's executable directory).
        types.Mappings[".pdb"] = "application/octet-stream";
        types.Mappings[".wgsl"] = "text/plain";
        app.UseDefaultFiles();
        app.UseStaticFiles(new StaticFileOptions { ContentTypeProvider = types });
        // Missing API/runtime assets must remain 404s instead of being replaced by SPA HTML.
        app.MapFallback((HttpContext http) => http.Request.Method == "GET" && !Path.HasExtension(http.Request.Path)
            && !http.Request.Path.StartsWithSegments("/api") && !http.Request.Path.StartsWithSegments("/__helios")
            ? Results.File(Path.Combine(AppContext.BaseDirectory, "wwwroot", "index.html"), "text/html") : Results.NotFound());
    }

    public void Ready()
    {
        File.WriteAllText(SessionPath, JsonSerializer.Serialize(new RunningSession(Address, token)));
        if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(SessionPath, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        Console.WriteLine($"Helios is ready: {Address}\nData and logs: {DataRoot}\nUse Quit Helios in the browser, close this window, or press Ctrl+C to stop.");
        if (!noBrowser) OpenBrowser(Address, token);
    }

    private static void OpenBrowser(string address, string capability)
    {
        try { Process.Start(new ProcessStartInfo(address + "/__helios/start#" + capability) { UseShellExecute = true }); }
        catch { throw new InvalidOperationException("Could not open your default browser. Set a default browser and start Helios again."); }
    }

    public void Dispose()
    {
        if (lease is null) return;
        if (File.Exists(SessionPath)) File.Delete(SessionPath);
        lease.Dispose();
    }
    private sealed record RunningSession(string Address, string Token);
    private sealed record SessionRequest(string? Token);
}
