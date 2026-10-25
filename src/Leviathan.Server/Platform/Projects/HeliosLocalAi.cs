using System.Net;
using System.Diagnostics;
using System.Text.Json.Serialization;
using Tomlyn;
using Tomlyn.Model;

namespace Leviathan.Server.Platform.Projects;

/// <summary>Machine-local preferences. Secrets are never part of the public settings projection.</summary>
public sealed class HeliosLocalAi(IConfiguration configuration)
{
    public bool Enabled => configuration.GetValue<bool>("HELIOS_LOCAL_AI");
    public string ConfigPath => Path.GetFullPath(configuration["HELIOS_CONFIG_FILE"] ?? Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Aetheris", "Helios", "helios.toml"));

    public void ValidateBinding()
    {
        if (!Enabled) return;
        var urls = configuration["urls"];
        var endpoints = configuration.GetSection("Kestrel:Endpoints").GetChildren().Select(e => e["Url"]);
        if (string.IsNullOrWhiteSpace(urls) || urls.Split(';').Concat(endpoints).Any(url => !Uri.TryCreate(url, UriKind.Absolute, out var uri) || !uri.IsLoopback))
            throw new InvalidOperationException("HELIOS_LOCAL_AI requires exclusively loopback server URLs.");
    }

    public bool IsLocal(HttpContext http) => Enabled && http.Connection.RemoteIpAddress is { } ip
        && IPAddress.IsLoopback(ip) && Uri.TryCreate($"http://{http.Request.Host}", UriKind.Absolute, out var host) && host.IsLoopback;

    public LocalAiSettings Read()
    {
        if (!Enabled) return new();
        try
        {
            if (!File.Exists(ConfigPath)) return new();
            if (new FileInfo(ConfigPath).Length > 64 * 1024) throw new LocalAiException("helios.toml exceeds 64 KiB.");
            // Never forward parser exception text: it can contain the offending credential line.
            var syntax = Toml.Parse(File.ReadAllText(ConfigPath));
            if (syntax.HasErrors) throw new LocalAiException("Invalid TOML in helios.toml. Check quoting, duplicate keys and table names.");
            var root = (TomlTable)syntax.ToModel();
            Fields(root, "root", "defaultProvider", "providers", "agents");
            var selected = Value(root, "defaultProvider", "openai");
            if (!HeliosAuthorEndpoints.Providers.Any(p => p.Id == selected) && selected != "codex" && !DesktopAuthorConnections.Supports(selected))
                throw new LocalAiException("defaultProvider must be openai, anthropic, gemini, codex, claude-code, claude-desktop or antigravity.");
            var keys = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var pair in Table(root, "providers"))
            {
                if (!HeliosAuthorEndpoints.Providers.Any(p => p.Id == pair.Key)) throw new LocalAiException("Unknown provider table in helios.toml.");
                var table = pair.Value as TomlTable ?? throw new LocalAiException("Each provider must be a TOML table.");
                Fields(table, "provider", "apiKey", "apiKeyEnv");
                if (table.ContainsKey("apiKey") && table.ContainsKey("apiKeyEnv")) throw new LocalAiException("Choose either apiKey or apiKeyEnv for each provider.");
                if (table.ContainsKey("apiKeyEnv"))
                {
                    var variable = Value(table, "apiKeyEnv", "");
                    if (variable.Length == 0 || variable.Any(c => !char.IsAsciiLetterOrDigit(c) && c != '_'))
                        throw new LocalAiException("apiKeyEnv must name an environment variable.");
                    keys[pair.Key] = Environment.GetEnvironmentVariable(variable) ?? "";
                }
                else keys[pair.Key] = Value(table, "apiKey", "");
            }
            var agents = Table(root, "agents"); Fields(agents, "agents", "codex");
            var codex = Table(agents, "codex"); Fields(codex, "agents.codex", "executable");
            return new(selected, keys, Value(codex, "executable", "codex"));
        }
        catch (LocalAiException) { throw; }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException)
        { throw new LocalAiException("Cannot read helios.toml. Check its location and file permissions."); }
    }

    public string? Key(string provider, string variable, HttpContext http)
    {
        if (Enabled)
        {
            if (!IsLocal(http)) throw new LocalAiException("Local AI credentials require a loopback connection.");
            var settings = Read();
            // An explicitly configured empty/missing environment reference does not fall back.
            if (settings.Keys.TryGetValue(provider, out var value)) return value;
        }
        return configuration[variable];
    }

    public void OpenFolder()
    {
        var folder = Path.GetDirectoryName(ConfigPath)!;
        Directory.CreateDirectory(folder);
        if (!File.Exists(ConfigPath))
        {
            var options = new FileStreamOptions { Mode = FileMode.CreateNew, Access = FileAccess.Write };
            if (!OperatingSystem.IsWindows()) options.UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite;
            using var file = new FileStream(ConfigPath, options);
            using var writer = new StreamWriter(file);
            writer.Write(Example);
        }
        Process.Start(new ProcessStartInfo(folder) { UseShellExecute = true, WindowStyle = ProcessWindowStyle.Hidden });
    }

    private static void Fields(TomlTable table, string context, params string[] allowed)
    {
        if (table.Keys.Any(k => !allowed.Contains(k, StringComparer.Ordinal)))
            throw new LocalAiException($"Unknown field in helios.toml ({context}). Check the documented configuration fields.");
    }
    private static TomlTable Table(TomlTable table, string key) => !table.TryGetValue(key, out var value) ? new()
        : value as TomlTable ?? throw new LocalAiException("Expected a TOML table in helios.toml.");
    private static string Value(TomlTable table, string key, string fallback) => !table.TryGetValue(key, out var value) ? fallback
        : value as string ?? throw new LocalAiException("Expected a string value in helios.toml.");

    public const string Example = """
        # Local credentials only. Never put this file in a design project.
        defaultProvider = "openai"

        # Uncomment one or more providers. apiKeyEnv can be used instead of apiKey.
        # [providers.openai]
        # apiKey = "YOUR_OPENAI_KEY"
        # [providers.anthropic]
        # apiKeyEnv = "ANTHROPIC_API_KEY"
        # [providers.gemini]
        # apiKeyEnv = "GEMINI_API_KEY"

        [agents.codex]
        executable = "codex"
        # On Windows, use a native codex.exe (or a forward-slash absolute path).
        # Sign in with ChatGPT using Codex first. API-key accounts are refused here.
        """;
}

public sealed record LocalAiSettings(string DefaultProvider = "openai", [property: JsonIgnore] Dictionary<string, string>? ProviderKeys = null, string CodexExecutable = "codex")
{
    [JsonIgnore]
    public Dictionary<string, string> Keys { get; } = ProviderKeys ?? new(StringComparer.Ordinal);
}
public sealed class LocalAiException(string message) : Exception(message);
