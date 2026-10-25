using Microsoft.Extensions.Logging.Abstractions;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace Leviathan.Server.Platform.Projects;

/// <summary>Claude Desktop's native Windows/local MCP host uses stdio, not a project HTTP config.
/// The official SDK relays tools to the same local capability endpoint; no agent or model is embedded.</summary>
public static class DesktopMcpStdio
{
    public const string Flag = "--helios-desktop-mcp";
    public static async Task<int> Run(string[] args)
    {
        var position = Array.IndexOf(args, "--endpoint");
        var token = Environment.GetEnvironmentVariable("HELIOS_DESKTOP_CAPABILITY");
        if (position < 0 || position + 1 >= args.Length || !Uri.TryCreate(args[position + 1], UriKind.Absolute, out var endpoint)
            || !endpoint.IsLoopback || endpoint.Scheme is not ("http" or "https") || endpoint.AbsolutePath != DesktopAuthorConnections.Endpoint
            || string.IsNullOrWhiteSpace(token) || token.Length > 128)
        { await Console.Error.WriteLineAsync("Helios desktop bridge requires its loopback endpoint and a local pairing capability. Prepare the connection in Helios again."); return 1; }
        using var lifetime = new CancellationTokenSource();
        Console.CancelKeyPress += (_, e) => { e.Cancel = true; lifetime.Cancel(); };
        try {
            using var startup = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token); startup.CancelAfter(TimeSpan.FromSeconds(20));
            await using var upstream = await McpClient.CreateAsync(new HttpClientTransport(new HttpClientTransportOptions {
                Endpoint = endpoint, TransportMode = HttpTransportMode.StreamableHttp,
                AdditionalHeaders = new Dictionary<string, string> { ["Authorization"] = "Bearer " + token }
            }), cancellationToken: startup.Token);
            var options = new McpServerOptions { ServerInfo = new() { Name = "helios", Version = "2.0.0" }, Capabilities = new() { Tools = new() },
                Handlers = new McpServerHandlers {
                    ListToolsHandler = (context, ct) => upstream.ListToolsAsync(context.Params ?? new ListToolsRequestParams(), ct),
                    CallToolHandler = (context, ct) => upstream.CallToolAsync(context.Params!, ct)
                } };
            await using var server = McpServer.Create(new StdioServerTransport(options, NullLoggerFactory.Instance), options);
            await server.RunAsync(lifetime.Token); // stdin EOF ends the bridge; Desktop owns its process.
            return 0;
        }
        catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { return 0; }
        catch (Exception) {
            // No raw transport exceptions/headers on stdout or in desktop logs.
            await Console.Error.WriteLineAsync("Helios desktop bridge could not reach the local host or its pairing expired. Keep Helios open, prepare the desktop connection again, then reconnect the local MCP server."); return 1;
        }
    }
}
